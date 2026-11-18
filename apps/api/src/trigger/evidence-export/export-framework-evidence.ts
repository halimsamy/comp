import { metadata, schemaTask } from '@trycompai/jobs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { AttachmentsService } from '@/attachments/attachments.service';
import { AccessRevocationService } from '@/offboarding-checklist/access-revocation.service';
import { OffboardingChecklistService } from '@/offboarding-checklist/offboarding-checklist.service';
import { OffboardingExportService } from '@/offboarding-checklist/offboarding-export.service';
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
  new OffboardingChecklistService(attachments, accessRevocations),
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
  }),
  run: async ({ organizationId, frameworkInstanceId, access, period }) => {
    metadata.set('status', 'generating');

    const framework = await exportService.loadFramework(
      organizationId,
      frameworkInstanceId,
    );
    const s3Client = createS3Client();
    const bucket = getBucketName();
    // One object per framework, overwritten by each export, so storage stays bounded.
    const s3Key = `${organizationId}/exports/framework-evidence-${frameworkInstanceId}.zip`;

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
        }),
    });

    const downloadUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${framework.root}.zip"`,
      }),
      { expiresIn: DOWNLOAD_URL_EXPIRY },
    );

    metadata.set('status', 'completed');
    return { downloadUrl, s3Key };
  },
});
