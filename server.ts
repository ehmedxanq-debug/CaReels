import express from 'express';
import path from 'path';
import { Readable } from 'stream';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;

interface CachedChunk {
  status: number;
  contentType: string;
  acceptRanges: string;
  contentRange?: string;
  body: Buffer;
  storedAt: number;
}

interface CachedHead {
  totalSize: number;
  isComplete: boolean;
  contentType: string;
  body: Buffer;
  storedAt: number;
}

const VIDEO_CHUNK_CACHE = new Map<string, CachedChunk>();
const VIDEO_HEAD_CACHE = new Map<string, CachedHead>();
const MAX_CACHE_TOTAL_BYTES = 48 * 1024 * 1024;
const MAX_HEAD_BYTES = 1572864; // 1.5 MB instant startup prefix
const MAX_CACHEABLE_CHUNK_BYTES = 2 * 1024 * 1024;
const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedTotalBytes = 0;

function pruneVideoCache() {
  const now = Date.now();
  for (const [key, entry] of VIDEO_CHUNK_CACHE.entries()) {
    if (now - entry.storedAt > CACHE_TTL_MS) {
      cachedTotalBytes -= entry.body.byteLength;
      VIDEO_CHUNK_CACHE.delete(key);
    }
  }
  for (const [key, entry] of VIDEO_HEAD_CACHE.entries()) {
    if (now - entry.storedAt > CACHE_TTL_MS) {
      cachedTotalBytes -= entry.body.byteLength;
      VIDEO_HEAD_CACHE.delete(key);
    }
  }
  while (cachedTotalBytes > MAX_CACHE_TOTAL_BYTES) {
    if (VIDEO_CHUNK_CACHE.size > 0) {
      const oldestKey = VIDEO_CHUNK_CACHE.keys().next().value;
      if (oldestKey) {
        const entry = VIDEO_CHUNK_CACHE.get(oldestKey);
        if (entry) cachedTotalBytes -= entry.body.byteLength;
        VIDEO_CHUNK_CACHE.delete(oldestKey);
        continue;
      }
    }
    if (VIDEO_HEAD_CACHE.size > 0) {
      const oldestKey = VIDEO_HEAD_CACHE.keys().next().value;
      if (oldestKey) {
        const entry = VIDEO_HEAD_CACHE.get(oldestKey);
        if (entry) cachedTotalBytes -= entry.body.byteLength;
        VIDEO_HEAD_CACHE.delete(oldestKey);
        continue;
      }
    }
    break;
  }
}

function setCachedChunk(key: string, chunk: CachedChunk) {
  if (chunk.body.byteLength > MAX_CACHEABLE_CHUNK_BYTES) return;
  const existing = VIDEO_CHUNK_CACHE.get(key);
  if (existing) {
    cachedTotalBytes -= existing.body.byteLength;
    VIDEO_CHUNK_CACHE.delete(key);
  }
  VIDEO_CHUNK_CACHE.set(key, chunk);
  cachedTotalBytes += chunk.body.byteLength;
  pruneVideoCache();
}

function setCachedHead(url: string, head: CachedHead) {
  if (head.body.byteLength === 0 || head.body.byteLength > MAX_CACHEABLE_CHUNK_BYTES) return;
  const existing = VIDEO_HEAD_CACHE.get(url);
  if (existing) {
    cachedTotalBytes -= existing.body.byteLength;
    VIDEO_HEAD_CACHE.delete(url);
  }
  VIDEO_HEAD_CACHE.set(url, head);
  cachedTotalBytes += head.body.byteLength;
  pruneVideoCache();
}

function parseByteRangeHeader(
  rangeHeader: string
): { start: number; end?: number } | null {
  const match = /^bytes=(\d+)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (!Number.isFinite(start) || start < 0) return null;
  if (end !== undefined && (!Number.isFinite(end) || end < start)) return null;
  return { start, end };
}

async function startServer() {
  const app = express();

  const warmInFlight = new Set<string>();

  // Background warmup endpoint: prefetches first 1.5MB of upcoming video into VIDEO_HEAD_CACHE
  app.get('/api/video-warm', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl || (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://'))) {
      res.status(204).end();
      return;
    }
    const existing = VIDEO_HEAD_CACHE.get(rawUrl);
    if ((existing && Date.now() - existing.storedAt <= CACHE_TTL_MS) || warmInFlight.has(rawUrl)) {
      res.status(204).end();
      return;
    }
    warmInFlight.add(rawUrl);
    res.status(204).end();

    try {
      const upstream = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CaReels/1.0)',
          Range: `bytes=0-${MAX_HEAD_BYTES - 1}`,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      });
      if (upstream.ok || upstream.status === 206) {
        const ab = await upstream.arrayBuffer();
        const buf = Buffer.from(ab);
        const contentType = upstream.headers.get('content-type') || 'video/mp4';
        if (upstream.status === 200) {
          if (buf.byteLength <= MAX_CACHEABLE_CHUNK_BYTES) {
            setCachedHead(rawUrl, {
              totalSize: buf.byteLength,
              isComplete: true,
              contentType,
              body: buf,
              storedAt: Date.now(),
            });
          }
        } else {
          const cr = upstream.headers.get('content-range') || '';
          const crMatch = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(cr);
          const totalSize = crMatch && crMatch[3] !== '*' ? Number(crMatch[3]) : 0;
          const rangeEnd = crMatch ? Number(crMatch[2]) : buf.byteLength - 1;
          if (totalSize > 0 && buf.byteLength <= MAX_CACHEABLE_CHUNK_BYTES) {
            setCachedHead(rawUrl, {
              totalSize,
              isComplete: rangeEnd + 1 >= totalSize,
              contentType,
              body: buf,
              storedAt: Date.now(),
            });
          }
        }
      }
    } catch {
      // ignore warmup errors
    } finally {
      warmInFlight.delete(rawUrl);
    }
  });

  // Video streaming proxy for Catbox / external video links with HTTP Range support & RAM head/chunk cache
  app.all('/api/video-proxy', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).end();
      return;
    }
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl || (!rawUrl.startsWith('https://') && !rawUrl.startsWith('http://'))) {
      res.status(400).json({ error: 'Invalid video URL' });
      return;
    }

    const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : '';
    const headHit = VIDEO_HEAD_CACHE.get(rawUrl);

    if (headHit && Date.now() - headHit.storedAt <= CACHE_TTL_MS && headHit.totalSize > 0) {
      if (req.method === 'HEAD') {
        res.status(200);
        res.setHeader('Content-Type', headHit.contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Length', String(headHit.totalSize));
        res.end();
        return;
      }

      if (!rangeHeader && headHit.isComplete) {
        res.status(200);
        res.setHeader('Content-Type', headHit.contentType);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Length', String(headHit.body.byteLength));
        res.send(headHit.body);
        return;
      }

      if (rangeHeader) {
        const parsed = parseByteRangeHeader(rangeHeader);
        if (parsed && parsed.start < headHit.body.byteLength) {
          const maxAvailableEnd = headHit.body.byteLength - 1;
          const sliceEnd =
            parsed.end !== undefined
              ? Math.min(parsed.end, maxAvailableEnd)
              : maxAvailableEnd;
          if (sliceEnd >= parsed.start) {
            const slice = headHit.body.subarray(parsed.start, sliceEnd + 1);
            res.status(206);
            res.setHeader('Content-Type', headHit.contentType);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader(
              'Content-Range',
              `bytes ${parsed.start}-${sliceEnd}/${headHit.totalSize}`
            );
            res.setHeader('Content-Length', String(slice.byteLength));
            res.send(slice);
            return;
          }
        }
      }
    }

    const cacheKey = rangeHeader ? `${rawUrl}::${rangeHeader}` : `${rawUrl}::full`;

    if (req.method === 'GET') {
      const hit = VIDEO_CHUNK_CACHE.get(cacheKey);
      if (hit && Date.now() - hit.storedAt <= CACHE_TTL_MS) {
        VIDEO_CHUNK_CACHE.delete(cacheKey);
        VIDEO_CHUNK_CACHE.set(cacheKey, hit);
        res.status(hit.status);
        res.setHeader('Content-Type', hit.contentType);
        res.setHeader('Accept-Ranges', hit.acceptRanges);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Length', String(hit.body.byteLength));
        if (hit.contentRange) {
          res.setHeader('Content-Range', hit.contentRange);
        }
        res.send(hit.body);
        return;
      }
    }

    const upstreamController = new AbortController();
    const connectTimer = setTimeout(() => upstreamController.abort(), 12000);
    req.on('close', () => {
      clearTimeout(connectTimer);
      if (!res.writableEnded) {
        upstreamController.abort();
      }
    });

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; CaReels/1.0)',
      };
      if (rangeHeader) {
        headers['Range'] = rangeHeader;
      }

      const upstream = await fetch(rawUrl, {
        method: req.method,
        headers,
        redirect: 'follow',
        signal: upstreamController.signal,
      });
      clearTimeout(connectTimer);

      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).send('Upstream video error');
        return;
      }

      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type') || 'video/mp4';
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader('Cache-Control', 'public, max-age=3600');

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      if (req.method === 'HEAD' || !upstream.body) {
        res.end();
        return;
      }

      const numericLen = contentLength ? Number(contentLength) : 0;
      if (numericLen > 0 && numericLen <= MAX_CACHEABLE_CHUNK_BYTES) {
        const ab = await upstream.arrayBuffer();
        const buf = Buffer.from(ab);
        setCachedChunk(cacheKey, {
          status: upstream.status,
          contentType,
          acceptRanges,
          contentRange: contentRange || undefined,
          body: buf,
          storedAt: Date.now(),
        });
        res.send(buf);
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
      nodeStream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      nodeStream.pipe(res);
    } catch {
      clearTimeout(connectTimer);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Failed to stream video' });
      }
    }
  });

  // Catbox.moe multipart upload proxy with strict timeouts and fast fallback hosts
  app.post('/api/catbox-upload', async (req, res) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      res.status(400).json({ error: 'Expected multipart/form-data request' });
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
      }
      const rawBuffer = Buffer.concat(chunks);
      const parsedForm = await new Response(rawBuffer, {
        headers: { 'content-type': contentType },
      }).formData();

      const uploadedEntry = parsedForm.get('fileToUpload') || parsedForm.get('file');
      if (!uploadedEntry || typeof uploadedEntry === 'string') {
        res.status(400).json({ error: 'Video faylı tapılmadı' });
        return;
      }

      const fileBlob = uploadedEntry as File;
      const fileName = fileBlob.name || 'video.mp4';

      // 1. Catbox.moe (try when CATBOX_USERHASH is set or file is small <= 512KB with 4.5s timeout)
      if (process.env.CATBOX_USERHASH || fileBlob.size <= 512 * 1024) {
        try {
          const catboxFd = new FormData();
          catboxFd.append('reqtype', 'fileupload');
          if (process.env.CATBOX_USERHASH) {
            catboxFd.append('userhash', process.env.CATBOX_USERHASH);
          }
          catboxFd.append('fileToUpload', fileBlob, fileName);

          const catboxRes = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: catboxFd,
            signal: AbortSignal.timeout(4500),
          });
          const catboxText = (await catboxRes.text()).trim();
          if (catboxRes.ok && /^https?:\/\/\S+/i.test(catboxText)) {
            res.status(200).json({ url: catboxText, provider: 'catbox' });
            return;
          }
        } catch {
          // Fall through immediately to fast backup hosts
        }
      }

      // 2. Fast permanent MP4 host: kappa.lol (supports video/mp4 + HTTP 206 Range streaming)
      try {
        const kappaFd = new FormData();
        kappaFd.append('file', fileBlob, fileName);
        const kappaRes = await fetch('https://kappa.lol/api/upload', {
          method: 'POST',
          body: kappaFd,
          signal: AbortSignal.timeout(30000),
        });

        if (kappaRes.ok) {
          const kappaJson = (await kappaRes.json()) as {
            id?: string;
            ext?: string;
            link?: string;
          };
          const directUrl =
            kappaJson.id && kappaJson.ext
              ? `https://kappa.lol/${kappaJson.id}${kappaJson.ext}`
              : kappaJson.link || '';
          if (/^https?:\/\/\S+/i.test(directUrl)) {
            res.status(200).json({ url: directUrl, provider: 'kappa' });
            return;
          }
        }
      } catch {
        // Fall through to tertiary host
      }

      // 3. Tertiary fallback: qu.ax
      try {
        const quaxFd = new FormData();
        quaxFd.append('files[]', fileBlob, fileName);
        const quaxRes = await fetch('https://qu.ax/upload.php', {
          method: 'POST',
          body: quaxFd,
          signal: AbortSignal.timeout(25000),
        });
        if (quaxRes.ok) {
          const quaxJson = (await quaxRes.json()) as {
            success?: boolean;
            files?: { url?: string }[];
          };
          const url = quaxJson.files?.[0]?.url || '';
          if (/^https?:\/\/\S+/i.test(url)) {
            res.status(200).json({ url, provider: 'quax' });
            return;
          }
        }
      } catch {
        // Fall through to error
      }

      res.status(502).json({ error: 'Video serverə yüklənə bilmədi.' });
    } catch {
      if (!res.headersSent) {
        res.status(502).json({ error: 'Video yükləmə sorğusu uğursuz oldu.' });
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CaReels server running on port ${PORT}`);
  });
}

startServer();
