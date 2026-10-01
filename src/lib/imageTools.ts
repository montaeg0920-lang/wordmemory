/**
 * Photo preparation for AI text recognition.
 *
 * Phone photos are often 3–15MB (12–48MP). Sending them as-is is slow, can hit
 * upload limits and can crash the browser while converting. We shrink them to
 * at most 1600px (plenty for reading printed text) and re-encode as JPEG,
 * which also fixes rotation (EXIF orientation is applied when drawing).
 */

export const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;
const RAW_FALLBACK_LIMIT = 7 * 1024 * 1024;

export class ImagePrepError extends Error {
  constructor(public code: 'HEIC_UNSUPPORTED' | 'TOO_LARGE' | 'DECODE_FAILED') {
    super(code);
  }
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode failed'));
    };
    img.src = url;
  });
}

function canvasToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.fillStyle = '#fff'; // transparent PNGs → white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY)
  );
}

function isHeic(file: File) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

/** Returns a small JPEG ready for upload (or the original file if it cannot be decoded but is small enough). */
export async function prepareImageForUpload(file: File): Promise<{ blob: Blob; mimeType: string }> {
  // 1) <img> decode — applies EXIF rotation, works for JPEG/PNG/WebP/GIF everywhere and HEIC on Safari.
  try {
    const img = await loadImage(file);
    const blob = await canvasToJpeg(img, img.naturalWidth, img.naturalHeight);
    return { blob, mimeType: 'image/jpeg' };
  } catch {
    // continue
  }
  // 2) createImageBitmap — some Android browsers decode here when <img> fails.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    const blob = await canvasToJpeg(bitmap, bitmap.width, bitmap.height);
    bitmap.close?.();
    return { blob, mimeType: 'image/jpeg' };
  } catch {
    // continue
  }
  // 3) Could not decode in this browser: Gemini can still read HEIC/other images directly if small enough.
  if (file.size <= RAW_FALLBACK_LIMIT) {
    return { blob: file, mimeType: file.type || (isHeic(file) ? 'image/heic' : 'image/jpeg') };
  }
  throw new ImagePrepError(isHeic(file) ? 'HEIC_UNSUPPORTED' : 'TOO_LARGE');
}

/** True on phones/tablets, where the native camera app (input capture) is the best camera. */
export function prefersNativeCamera(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export type CameraErrorCode = 'PERMISSION' | 'NO_CAMERA' | 'IN_USE' | 'INSECURE' | 'BLOCKED_IN_FRAME' | 'UNKNOWN';

export function describeCameraError(err: unknown): { code: CameraErrorCode; message: string } {
  const name = (err as { name?: string })?.name || '';
  if (!window.isSecureContext) {
    return { code: 'INSECURE', message: '카메라는 https 주소에서만 쓸 수 있어요. 대신 "앨범에서"로 사진을 골라 주세요.' };
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    const inFrame = window.self !== window.top;
    return inFrame
      ? { code: 'BLOCKED_IN_FRAME', message: '미리보기 화면에서는 카메라가 막혀 있어요. 앱 주소를 새 탭에서 열거나 "앨범에서"를 이용해 주세요.' }
      : { code: 'PERMISSION', message: '카메라 권한이 꺼져 있어요. 브라우저 주소창 왼쪽의 자물쇠 → 카메라 → 허용으로 바꿔 주세요.' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { code: 'NO_CAMERA', message: '사용할 수 있는 카메라를 찾지 못했어요. "앨범에서"로 사진을 골라 주세요.' };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return { code: 'IN_USE', message: '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 시도해 주세요.' };
  }
  return { code: 'UNKNOWN', message: '카메라를 열지 못했어요. "앨범에서"로 사진을 골라 주세요.' };
}
