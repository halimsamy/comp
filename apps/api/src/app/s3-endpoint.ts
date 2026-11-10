/**
 * S3Client options for a self-hosted S3-compatible server (SeaweedFS in
 * docker-compose) when APP_AWS_ENDPOINT is set; empty for AWS S3.
 *
 * Checksums are only sent when required: by default the SDK signs a CRC32 of the
 * empty body into presigned PUT URLs, which S3-compatible servers reject (BadDigest).
 */
export function s3EndpointOptions() {
  const endpoint = process.env.APP_AWS_ENDPOINT;
  if (!endpoint) return {};
  return {
    endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  };
}
