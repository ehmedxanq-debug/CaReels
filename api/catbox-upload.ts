import type { IncomingMessage, ServerResponse } from 'node:http';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Expected multipart/form-data request' }));
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
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Video faylı tapılmadı' }));
      return;
    }

    const fileBlob = uploadedEntry as File;
    const fileName = fileBlob.name || 'video.mp4';
    res.setHeader('Content-Type', 'application/json');

    // 1. Try Catbox.moe when userhash is set or file is small (<= 512KB)
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
          res.statusCode = 200;
          res.end(JSON.stringify({ url: catboxText, provider: 'catbox' }));
          return;
        }
      } catch {
        // Fall through to backup host
      }
    }

    // 2. Fallback: kappa.lol
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
          res.statusCode = 200;
          res.end(JSON.stringify({ url: directUrl, provider: 'kappa' }));
          return;
        }
      }
    } catch {
      // Fall through
    }

    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Video serverə yüklənə bilmədi.' }));
  } catch {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Video yükləmə sorğusu uğursuz oldu.' }));
    }
  }
}
