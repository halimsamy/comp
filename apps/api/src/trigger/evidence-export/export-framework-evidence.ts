import { metadata, schemaTask } from '@trycompai/jobs';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { FrameworkEvidenceExportService } from '@/tasks/evidence-export/framework-evidence-export.service';
import { PolicyPdfRendererService } from '@/trust-portal/policy-pdf-renderer.service';
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
  }),
  run: async ({ organizationId, frameworkInstanceId }) => {
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
        exportService.populate({ archive, organizationId, framework }),
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
