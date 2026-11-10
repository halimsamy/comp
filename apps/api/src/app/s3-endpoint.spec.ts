import { s3EndpointOptions } from './s3-endpoint';

describe('s3EndpointOptions', () => {
  const original = process.env.APP_AWS_ENDPOINT;
  afterEach(() => {
    process.env.APP_AWS_ENDPOINT = original;
  });

  it('adds nothing for AWS S3', () => {
    delete process.env.APP_AWS_ENDPOINT;
    expect(s3EndpointOptions()).toEqual({});
  });

  it('targets the self-hosted endpoint path-style without default checksums', () => {
    process.env.APP_AWS_ENDPOINT = 'http://s3:8333';
    expect(s3EndpointOptions()).toEqual({
      endpoint: 'http://s3:8333',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  });
});
