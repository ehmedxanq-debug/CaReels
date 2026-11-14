import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const rawUrl = parsed.searchParams.get('url') || '';

    if (!rawUrl || (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://'))) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid video URL' }));
      return;
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; CaReels/1.0)',
    };
    const rangeHeader = req.headers.range;
    if (typeof rangeHeader === 'string' && rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const upstream = await fetch(rawUrl, {
      headers,
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      res.statusCode = upstream.status;
      res.end('Upstream video error');
      return;
    }

    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }
    const contentRange = upstream.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }

    if (!upstream.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(
      upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]
    );
    nodeStream.on('error', () => {
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    nodeStream.pipe(res);
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to stream video' }));
    }
  }
}
