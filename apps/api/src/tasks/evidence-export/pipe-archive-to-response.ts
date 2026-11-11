import type { Logger } from '@nestjs/common';
import type { Archiver } from 'archiver';
import type { Request, Response } from 'express';

/**
 * Wire an archive to the HTTP response with two concerns:
 *  1. Archive errors → log and end the response (500 if headers not yet sent).
 *  2. Client disconnect → abort the archive so S3 fetches stop and the
 *     background populate task doesn't keep running for a closed socket.
 *
 * We listen on `res.close` only and distinguish normal-completion from
 * disconnect via `res.writableFinished` (true only after the full response
 * has been flushed). `req.close` is not used because it fires on normal
 * request completion in modern Node, which can race with our response flush
 * and cause false aborts of successful exports.
 */
export function pipeArchiveToResponse(params: {
  archive: Archiver;
  req: Request;
  res: Response;
  logger: Logger;
  tag: string;
}): void {
  const { archive, res, logger, tag } = params;
  let aborted = false;

  res.once('close', () => {
    if (aborted) return;
    // writableFinished becomes true only after the response is fully flushed
    // and the 'finish' event fires; on a client disconnect this stays false.
    if (res.writableFinished) return;
    aborted = true;
    logger.warn(`Client disconnected during export (${tag}); aborting archive`);
    archive.abort();
  });

  archive.on('error', (err) => {
    logger.error(`Archive stream error (${tag}): ${err.message}`);
    if (!res.headersSent) {
      res.status(500).end();
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  archive.pipe(res);
}
