/** Side length of a stored profile picture. Small on purpose: it lives in the plan and syncs with it. */
export const AVATAR_SIZE = 192;

/**
 * Centre-crop an image file to a square and return it as a small JPEG data URL (about 10–25 KB).
 * Runs entirely in the browser; the original file is never stored.
 */
export async function fileToAvatar(file: File, size = AVATAR_SIZE): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG, WebP or HEIC).');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('That image could not be read. Try a JPEG or PNG.');
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize images.');
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    bitmap.close();
  }
}

/** Two letters from a name, for the fallback when there is no picture. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}
