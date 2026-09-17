import { useT } from '@/i18n';
import { Card, CardHeader } from '@/components/ui/Card';

/** Plain privacy and terms pages; an Enable Banking application asks for an address to each. */
export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const t = useT().bank.legal;
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader title={kind === 'privacy' ? t.privacyTitle : t.termsTitle} />
      <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-soft">
        {(kind === 'privacy' ? t.privacy : t.terms).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </Card>
  );
}
