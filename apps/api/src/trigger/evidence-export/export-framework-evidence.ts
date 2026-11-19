import { metadata, schemaTask } from '@trycompai/jobs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createElement } from 'react';
import { z } from 'zod';
import { EvidenceExportReadyEmail } from '@/email/templates/evidence-export-ready';
import { triggerEmail } from '@/email/trigger-email';
import { AttachmentsService } from '@/attachments/attachments.service';
import { AccessRevocationService } from '@/offboarding-checklist/access-revocation.service';
import { OffboardingChecklistService } from '@/offboarding-checklist/offboarding-checklist.service';
import { OffboardingExportService } from '@/offboarding-checklist/offboarding-export.service';
import {
  frameworkExportKey,
  periodSlug,
} from '@/tasks/evidence-export/framework-evidence-export.dto';
import { FrameworkEvidenceExportService } from '@/tasks/evidence-export/framework-evidence-export.service';
import { REGISTER_KEYS } from '@/tasks/evidence-export/registers/registers';
import { PolicyPdfRendererService } from '@/trust-portal/policy-pdf-renderer.service';
import { UploadsService } from '@/uploads/uploads.service';
import {
  createS3Client,
  getBucketName,
  streamArchiveToS3,
} from './export-organization-evidence';

// A multi-GB ZIP can take over an hour to download on a slow link, and the browser
// can only resume an interrupted download while the URL is still valid.
const DOWNLOAD_URL_EXPIRY = 24 * 60 * 60;

const exportService = new FrameworkEvidenceExportService(
  new PolicyPdfRendererService(),
);

// The job runs outside Nest's DI container, so wire the offboarding export by hand.
const attachments = new AttachmentsService(new UploadsService());
const accessRevocations = new AccessRevocationService(attachments);
const offboardingExport = new OffboardingExportService(
  attachments,
  accessRevocations,
  new OffboardingChecklistService(attachments),
);

/**
 * Builds a framework's evidence ZIP into S3 and returns a presigned download URL.
 * The browser downloads from storage (known size, resumable) instead of holding a
 * live multi-GB stream open against the API.
 */
export const exportFrameworkEvidenceTask = schemaTask({
  id: 'export-framework-evidence',
  machine: { preset: 'large-1x' },
  // One export per organization at a time (concurrencyKey = organizationId).
  queue: { name: 'framework-evidence-export', concurrencyLimit: 1 },
  maxDuration: 60 * 60,
  retry: { maxAttempts: 0 },
  schema: z.object({
    organizationId: z.string(),
    frameworkInstanceId: z.string(),
    // Absent on runs queued before registers were added: export without them.
    access: z
      .object({ registers: z.array(z.enum(REGISTER_KEYS)), soa: z.boolean() })
      .default({ registers: [], soa: false }),
    period: z
      .object({ from: z.string().datetime().optional(), to: z.string().datetime().optional() })
      .default({}),
    auditId: z.string().optional(),
    /** The requester; emailed the download link when the ZIP is ready. */
    notifyEmail: z.string().email().optional(),
  }),
  run: async (
    { organizationId, frameworkInstanceId, access, period, auditId, notifyEmail },
    { ctx },
  ) => {
    metadata.set('status', 'generating');

    const framework = await exportService.loadFramework(
      organizationId,
      frameworkInstanceId,
    );
    const s3Client = createS3Client();
    const bucket = getBucketName();
    const s3Key = frameworkExportKey({ organizationId, frameworkInstanceId, runId: ctx.run.id });
    const fileName = `${framework.root}_${periodSlug(period)}.zip`;

    await streamArchiveToS3({
      s3Client,
      bucket,
      key: s3Key,
      populate: (archive) =>
        exportService.populate({
          archive,
          organizationId,
          framework,
          access,
          period: {
            from: period.from ? new Date(period.from) : undefined,
            to: period.to ? new Date(period.to) : undefined,
          },
          offboardingExport,
          auditId,
        }),
    });

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
      { expiresIn: DOWNLOAD_URL_EXPIRY },
    );

    if (notifyEmail) {
      // A lost email must not fail the export: the UI still downloads from the run output.
      await triggerEmail({
        to: notifyEmail,
        subject: `Your ${framework.frameworkName} evidence export is ready`,
        system: true,
        react: createElement(EvidenceExportReadyEmail, {
          email: notifyEmail,
          organizationName: framework.organizationName,
          frameworkName: framework.frameworkName,
          periodLabel: periodSlug(period).replace(/_/g, ' ').replace('all-time', 'all time'),
          downloadUrl,
          expiresInHours: DOWNLOAD_URL_EXPIRY / 3600,
        }),
      }).catch(() => undefined);
    }

    metadata.set('status', 'completed');
    return { downloadUrl, s3Key, fileName };
  },
});
