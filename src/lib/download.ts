/**
 * Hands a generated file to the person. In an installed app the system share sheet is the native way
 * (AirDrop, Files, Mail); elsewhere, or when the browser cannot share files, it is a plain download.
 * Must be called from a click handler: sharing needs the gesture.
 */
export function downloadText(filename: string, text: string, type = 'application/json') {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    // AbortError is the person closing the sheet; nothing to do then.
    void navigator.share({ files: [file] }).catch(() => undefined);
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
