const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

function readUint32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readUint64BE(view: DataView, offset: number): number {
  const high = view.getUint32(offset, false);
  const low = view.getUint32(offset + 4, false);
  return high * 4294967296 + low;
}

function writeUint32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false);
}

function writeUint64BE(view: DataView, offset: number, value: number): void {
  const high = Math.floor(value / 4294967296);
  const low = value - high * 4294967296;
  view.setUint32(offset, high >>> 0, false);
  view.setUint32(offset + 4, low >>> 0, false);
}

function readBoxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

function shiftChunkOffsetsInMoov(
  moovBytes: Uint8Array,
  start: number,
  end: number,
  insertPos: number,
  originalMoovStart: number,
  shiftBy: number
): boolean {
  const view = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
  let pos = start;

  while (pos + 8 <= end) {
    let size = readUint32BE(view, pos);
    const type = readBoxType(moovBytes, pos + 4);
    let headerSize = 8;

    if (size === 1) {
      if (pos + 16 > end) return false;
      size = readUint64BE(view, pos + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }

    if (size < headerSize || pos + size > end) {
      return false;
    }

    const boxEnd = pos + size;
    const payloadStart = pos + headerSize;

    if (type === 'stco') {
      if (payloadStart + 8 > boxEnd) return false;
      const entryCount = readUint32BE(view, payloadStart + 4);
      if (payloadStart + 8 + entryCount * 4 > boxEnd) return false;
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = payloadStart + 8 + i * 4;
        const oldVal = readUint32BE(view, entryOffset);
        if (oldVal >= insertPos && oldVal < originalMoovStart) {
          const nextVal = oldVal + shiftBy;
          if (nextVal > 0xffffffff) return false;
          writeUint32BE(view, entryOffset, nextVal);
        }
      }
    } else if (type === 'co64') {
      if (payloadStart + 8 > boxEnd) return false;
      const entryCount = readUint32BE(view, payloadStart + 4);
      if (payloadStart + 8 + entryCount * 8 > boxEnd) return false;
      for (let i = 0; i < entryCount; i++) {
        const entryOffset = payloadStart + 8 + i * 8;
        const oldVal = readUint64BE(view, entryOffset);
        if (oldVal >= insertPos && oldVal < originalMoovStart) {
          writeUint64BE(view, entryOffset, oldVal + shiftBy);
        }
      }
    } else if (CONTAINER_BOXES.has(type)) {
      if (
        !shiftChunkOffsetsInMoov(
          moovBytes,
          payloadStart,
          boxEnd,
          insertPos,
          originalMoovStart,
          shiftBy
        )
      ) {
        return false;
      }
    }

    pos = boxEnd;
  }

  return true;
}

/**
 * Relocates the MP4 `moov` atom before `mdat` (faststart) without re-encoding video or audio.
 * Makes browser playback start in 1 HTTP Range request instead of multiple seeks.
 * Safely returns the original file untouched if already faststart or non-standard.
 */
export async function ensureMp4Faststart(file: File): Promise<File> {
  try {
    // Only inspect reasonable-sized ISOBMFF/MP4/MOV files (< 65 MB)
    if (!file || file.size < 64 || file.size > 65 * 1024 * 1024) {
      return file;
    }

    interface TopBox {
      type: string;
      start: number;
      size: number;
    }

    const boxes: TopBox[] = [];
    let offset = 0;

    while (offset + 8 <= file.size) {
      const headerBuf = await file.slice(offset, Math.min(offset + 16, file.size)).arrayBuffer();
      const headerBytes = new Uint8Array(headerBuf);
      const headerView = new DataView(headerBuf);

      let size = readUint32BE(headerView, 0);
      const type = readBoxType(headerBytes, 4);
      let headerSize = 8;

      if (size === 1) {
        if (headerBytes.byteLength < 16) return file;
        size = readUint64BE(headerView, 8);
        headerSize = 16;
      } else if (size === 0) {
        size = file.size - offset;
      }

      if (size < headerSize || offset + size > file.size) {
        return file;
      }

      boxes.push({ type, start: offset, size });
      offset += size;
      if (boxes.length > 128) return file;
    }

    const ftypIndex = boxes.findIndex((b) => b.type === 'ftyp');
    const mdatIndex = boxes.findIndex((b) => b.type === 'mdat');
    const moovIndex = boxes.findIndex((b) => b.type === 'moov');
    const hasMoof = boxes.some((b) => b.type === 'moof');

    // Already faststart, fragmented, or missing required atoms
    if (
      ftypIndex !== 0 ||
      mdatIndex === -1 ||
      moovIndex === -1 ||
      hasMoof ||
      moovIndex < mdatIndex
    ) {
      return file;
    }

    const moovBox = boxes[moovIndex];
    const mdatBox = boxes[mdatIndex];
    // Reject unusually huge moov (> 8 MB)
    if (moovBox.size > 8 * 1024 * 1024) {
      return file;
    }

    const insertPos = mdatBox.start;
    const moovBytes = new Uint8Array(
      await file.slice(moovBox.start, moovBox.start + moovBox.size).arrayBuffer()
    );

    const moovView = new DataView(moovBytes.buffer, moovBytes.byteOffset, moovBytes.byteLength);
    const firstSize = readUint32BE(moovView, 0);
    const moovHeaderSize = firstSize === 1 ? 16 : 8;

    const ok = shiftChunkOffsetsInMoov(
      moovBytes,
      moovHeaderSize,
      moovBytes.byteLength,
      insertPos,
      moovBox.start,
      moovBox.size
    );
    if (!ok) {
      return file;
    }

    const leadingSlice = file.slice(0, insertPos);
    const middleSlice = file.slice(insertPos, moovBox.start);
    const trailingSlice = file.slice(moovBox.start + moovBox.size, file.size);

    return new File([leadingSlice, moovBytes, middleSlice, trailingSlice], file.name || 'video.mp4', {
      type: file.type || 'video/mp4',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

/**
 * Extracts a compact JPEG thumbnail from the first visible frame of a local video file
 * so viewers immediately see a crisp poster frame instead of a black screen while buffering.
 */
export async function extractVideoPosterBlob(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => finish(null), 2500);

    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    video.onloadeddata = () => {
      try {
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        if (!vw || !vh) {
          finish(null);
          return;
        }
        const maxWidth = 480;
        const scale = vw > maxWidth ? maxWidth / vw : 1;
        const width = Math.max(1, Math.round(vw * scale));
        const height = Math.max(1, Math.round(vh * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size < 200) {
              finish(null);
              return;
            }
            finish(new File([blob], 'poster.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.74
        );
      } catch {
        finish(null);
      }
    };

    video.onerror = () => finish(null);
    video.src = objectUrl;
    try {
      video.currentTime = 0.08;
    } catch {
      // ignore seek on initial load
    }
  });
}
