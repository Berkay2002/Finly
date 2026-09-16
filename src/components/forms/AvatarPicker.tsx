import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import clsx from 'clsx';
import { fileToAvatar, initialsOf } from '@/lib/image';
import { Button } from '@/components/ui/Button';

/**
 * Picks a profile picture. The file is resized to a small square in the browser and handed back as
 * a data URL; the original never leaves the device and is not kept.
 */
export function AvatarPicker({
  avatar,
  name,
  onChange,
  onError,
}: {
  avatar?: string;
  name: string;
  onChange: (dataUrl: string | undefined) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToAvatar(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'That image could not be used.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <span
        className={clsx(
          'inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-600 text-[18px] font-semibold text-white ring-2 ring-card',
        )}
      >
        {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initialsOf(name) || '•'}
      </span>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={Camera} disabled={busy} onClick={() => fileRef.current?.click()}>
          {avatar ? 'Change photo' : 'Add photo'}
        </Button>
        {avatar && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onChange(undefined)}>
            Remove
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  );
}
