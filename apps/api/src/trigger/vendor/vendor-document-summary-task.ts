import { BUCKET_NAME, s3Client } from '@/app/s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@db';
import { logger, queue, schemaTask, tags } from '@trycompai/jobs';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  assuranceFromDocument,
  resolveDocumentExpiry,
} from '../../vendors/tpsp/vendor-assurance';
import {
  parseSummaryDate,
  VENDOR_DOCUMENT_SUMMARY_TASK_ID,
  vendorDocumentSummarySchema,
} from './vendor-document-summary/summary-schema';

const SYSTEM_PROMPT = `You are a third-party risk analyst reviewing a vendor's assurance report for an organization certified to ISO/IEC 27001:2022 and PCI DSS v4.0.1 (service provider).
Extract facts only from the document. Never invent dates, auditors or exceptions; use null or an empty list when the document does not say.
For a SOC 2 report, the opinion is the auditor's opinion. For a PCI DSS AOC, use "compliant" or "non_compliant". For an ISO certificate, use "not_stated" unless the document states otherwise.
List every complementary user entity control (CUEC) and every testing exception you find.`;

async function readAttachment(s3Key: string): Promise<Buffer> {
  if (!s3Client || !BUCKET_NAME) throw new Error('S3 is not configured');
  const response = await s3Client.send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
  );
  if (!response.Body) throw new Error('Empty S3 object');
  return Buffer.from(await response.Body.transformToByteArray());
}

function mediaTypeFor(name: string): 'application/pdf' | 'image' | null {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext && ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'image';
  return null;
}

/**
 * Summarizes an uploaded SOC 2 / ISO certificate / AOC / pentest report with
 * Claude, then fills any missing coverage dates and refreshes the vendor's
 * assurance fields from them.
 */
export const vendorDocumentSummaryTask = schemaTask({
  id: VENDOR_DOCUMENT_SUMMARY_TASK_ID,
  queue: queue({ name: 'vendor-document-summary', concurrencyLimit: 5 }),
  retry: { maxAttempts: 2 },
  maxDuration: 10 * 60,
  schema: z.object({ documentId: z.string(), organizationId: z.string() }),
  run: async ({ documentId, organizationId }) => {
    await tags.add([`org:${organizationId}`]);
    const document = await db.vendorDocument.findFirst({
      where: { id: documentId, organizationId },
      include: {
        attachment: { select: { name: true, url: true } },
        vendor: { select: { id: true, name: true, assuranceExpiresAt: true } },
      },
    });
    if (!document) return { success: false, reason: 'not_found' };

    const kind = mediaTypeFor(document.attachment.name);
    if (!kind) {
      await db.vendorDocument.update({
        where: { id: documentId },
        data: { aiSummaryStatus: 'failed' },
      });
      return { success: false, reason: 'unsupported_file_type' };
    }

    try {
      const file = await readAttachment(document.attachment.url);
      const base64 = file.toString('base64');
      const { object: summary } = await generateObject({
        model: anthropic('claude-opus-5-5'),
        system: SYSTEM_PROMPT,
        schema: vendorDocumentSummarySchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Vendor: ${document.vendor.name}. Summarize this ${document.type.replace(/_/g, ' ')} document.`,
              },
              kind === 'application/pdf'
                ? { type: 'file', data: base64, mediaType: 'application/pdf' }
                : { type: 'image', image: file },
            ],
          },
        ],
      });

      const periodStart =
        document.periodStart ?? parseSummaryDate(summary.periodStart);
      const periodEnd =
        document.periodEnd ?? parseSummaryDate(summary.periodEnd);
      const expiresAt = resolveDocumentExpiry({
        type: document.type,
        periodEnd,
        expiresAt: document.expiresAt ?? parseSummaryDate(summary.expiresAt),
      });
      await db.vendorDocument.update({
        where: { id: documentId },
        data: {
          aiSummary: summary,
          aiSummaryStatus: 'completed',
          periodStart,
          periodEnd,
          expiresAt,
        },
      });
      const assurance = assuranceFromDocument({
        document: { type: document.type, periodStart, periodEnd, expiresAt },
        vendor: document.vendor,
      });
      if (assurance) {
        await db.vendor.update({
          where: { id: document.vendor.id },
          data: assurance,
        });
      }
      logger.info('Vendor document summarized', { documentId });
      return { success: true };
    } catch (error) {
      logger.error('Vendor document summary failed', {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      await db.vendorDocument.update({
        where: { id: documentId },
        data: { aiSummaryStatus: 'failed' },
      });
      throw error;
    }
  },
});
