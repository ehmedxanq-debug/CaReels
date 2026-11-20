const CATBOX_ENDPOINT = 'https://catbox.moe/user/api.php';

export function isValidHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+/i.test(value.trim());
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function uploadMediaFile(file: File, fallbackName = 'media.bin'): Promise<string> {
  const safeName = file.name || fallbackName;
  const isVideo =
    file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp|mkv|avi)$/i.test(safeName);

  const buildCatboxFormData = () => {
    const fd = new FormData();
    fd.append('reqtype', 'fileupload');
    fd.append('fileToUpload', file, safeName);
    return fd;
  };

  const tryKappaDirect = async (): Promise<string> => {
    try {
      const backupFd = new FormData();
      backupFd.append('file', file, safeName);
      const backupRes = await fetchWithTimeout(
        'https://kappa.lol/api/upload',
        { method: 'POST', body: backupFd },
        45000
      );

      if (backupRes.ok) {
        const json = (await backupRes.json()) as {
          id?: string;
          ext?: string;
          link?: string;
        };
        const directUrl =
          json.id && json.ext
            ? `https://kappa.lol/${json.id}${json.ext}`
            : json.link || '';
        if (isValidHttpUrl(directUrl)) {
          return directUrl;
        }
      }
    } catch {
      // Fall through
    }
    return '';
  };

  // For video files: prefer fast HTTP-206 CDN host first so viewers open videos immediately
  if (isVideo) {
    const fastVideoUrl = await tryKappaDirect();
    if (fastVideoUrl) {
      return fastVideoUrl;
    }
  }

  // Birbaşa Catbox.moe API-yə POST sorğusu (3 saniyə limit)
  try {
    const directRes = await fetchWithTimeout(
      CATBOX_ENDPOINT,
      { method: 'POST', body: buildCatboxFormData() },
      3000
    );
    const directText = (await directRes.text()).trim();
    if (directRes.ok && isValidHttpUrl(directText)) {
      return directText;
    }
  } catch {
    // Brauzer CORS və ya zaman aşımı olduqda davam et
  }

  // Kiçik və orta fayllar üçün (/api/catbox-upload) proxy funksiyası
  if (file.size <= 4 * 1024 * 1024) {
    try {
      const proxyRes = await fetchWithTimeout(
        '/api/catbox-upload',
        { method: 'POST', body: buildCatboxFormData() },
        20000
      );
      const rawBody = await proxyRes.text();
      let parsedUrl = '';
      try {
        const json = JSON.parse(rawBody) as { url?: string };
        parsedUrl = typeof json.url === 'string' ? json.url.trim() : '';
      } catch {
        parsedUrl = rawBody.trim();
      }
      if (proxyRes.ok && isValidHttpUrl(parsedUrl)) {
        return parsedUrl;
      }
    } catch {
      // Fall through
    }
  }

  if (!isVideo) {
    const fastImageUrl = await tryKappaDirect();
    if (fastImageUrl) {
      return fastImageUrl;
    }
  }

  // Son ehtiyat: Express server proxy (/api/catbox-upload)
  const fallbackProxyRes = await fetchWithTimeout(
    '/api/catbox-upload',
    { method: 'POST', body: buildCatboxFormData() },
    45000
  );
  const fallbackRaw = await fallbackProxyRes.text();
  let fallbackUrl = '';
  try {
    const json = JSON.parse(fallbackRaw) as { url?: string };
    fallbackUrl = typeof json.url === 'string' ? json.url.trim() : '';
  } catch {
    fallbackUrl = fallbackRaw.trim();
  }
  if (fallbackProxyRes.ok && isValidHttpUrl(fallbackUrl)) {
    return fallbackUrl;
  }

  throw new Error('Fayl yüklənə bilmədi. Zəhmət olmasa interneti yoxlayıb yenidən cəhd edin.');
}
