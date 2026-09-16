import { Camera } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@/i18n';
import { fileToAvatar, initialsOf } from '@/lib/image';

/**
 * Picks a profile picture. The file is resized to a small square in the browser and handed back as
 * a data URL; the original never leaves the device and is not kept. `children` sit beside the photo.
 */
export function AvatarPicker({
  avatar,
  name,
  onChange,
  onError,
  children,
}: {
  avatar?: string;
  name: string;
  onChange: (dataUrl: string | undefined) => void;
  onError: (message: string) => void;
  children?: ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const t = useT().accounts.avatar;

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToAvatar(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : t.unusable);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        aria-label={avatar ? t.change : t.add}
        title={avatar ? t.change : t.add}
        className="group relative inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-solid text-[18px] font-semibold text-white ring-2 ring-card focus:outline-none focus-visible:ring-brand-200 disabled:cursor-wait"
      >
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(name) || '•'}
        <span
          className={clsx(
            'absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100',
            busy && 'opacity-100',
          )}
        >
          <Camera size={20} />
        </span>
      </button>
      <div className="min-w-0 flex-1">
        {children}
        {avatar && (
          <button
            type="button"
            className="mt-1 text-[12px] font-medium text-muted hover:text-negative hover:underline"
            onClick={() => onChange(undefined)}
          >
            {t.remove}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}
