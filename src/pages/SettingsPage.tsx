import { Camera, Download, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatMoney, formatMonthYear } from '@/engine/format';
import { downloadText, readFileText } from '@/lib/download';
import { parsePlan, serializePlan, usePlanStore } from '@/store/planStore';
import { monthKey, usePlan } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader } from '@/components/ui/Card';
import { SelectField, TextField } from '@/components/ui/fields';

const CURRENCIES = ['SEK', 'NOK', 'DKK', 'EUR', 'GBP', 'USD', 'CHF', 'PLN'];

export function SettingsPage() {
  const plan = usePlan();
  const snapshots = usePlanStore((s) => s.snapshots);
  const { setUserName, setCurrency, loadSample, reset, importPlan, reopenOnboarding, saveSnapshot } = usePlanStore();
  const viewMonth = useUiStore((s) => s.viewMonth);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const onExport = () => {
    downloadText(`finly-plan-${new Date().toISOString().slice(0, 10)}.json`, serializePlan(plan));
    setMessage({ tone: 'success', text: 'Your plan was downloaded as a JSON file.' });
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      importPlan(parsePlan(await readFileText(file)));
      setMessage({ tone: 'success', text: `Imported ${file.name}.` });
    } catch (e) {
      setMessage({ tone: 'warning', text: e instanceof Error ? e.message : 'Could not read that file.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const key = monthKey(viewMonth);
  const snapshotList = Object.values(snapshots).sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, your data, and how Finly keeps it." showMonth={false} />

      {message && (
        <Callout tone={message.tone} className="mb-4">
          {message.text}
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" />
          <div className="space-y-4">
            <TextField label="Your name" placeholder="Used in the greeting" value={plan.userName} onChange={(e) => setUserName(e.target.value)} />
            <SelectField
              label="Currency"
              value={plan.currency}
              onValueChange={setCurrency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
            <p className="text-[12px] text-muted">Amounts are shown as entered; changing the currency does not convert them.</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Monthly snapshots" subtitle="Freeze this month's numbers so next month can show what changed." />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" icon={Camera} onClick={() => saveSnapshot(key)}>
              Save snapshot for {formatMonthYear(viewMonth)}
            </Button>
            {snapshots[key] && <span className="text-[12px] text-muted">Already saved. Saving again overwrites it.</span>}
          </div>
          {snapshotList.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {snapshotList.map((s) => (
                <li key={s.month} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="font-medium text-ink">{s.month}</span>
                  <span className="tabular text-muted">
                    income {formatMoney(s.income, plan.currency)} · costs {formatMoney(s.lifestyleCost, plan.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Your data" subtitle="Everything is stored in this browser only." />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={onExport}>
              Export JSON
            </Button>
            <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>
              Import JSON
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
            <Button
              variant="secondary"
              icon={RotateCcw}
              onClick={() => {
                reopenOnboarding();
                navigate('/onboarding/income');
              }}
            >
              Re-run planning session
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Demo & reset" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Sparkles}
              onClick={() => {
                loadSample();
                setMessage({ tone: 'success', text: 'Sample plan loaded. Your previous plan was replaced.' });
              }}
            >
              Load sample data
            </Button>
            {confirmReset ? (
              <>
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={() => {
                    reset();
                    setConfirmReset(false);
                    navigate('/welcome');
                  }}
                >
                  Yes, delete everything
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmReset(true)}>
                Reset all data
              </Button>
            )}
          </div>
          <p className="mt-3 text-[12px] text-muted">Export first if you want to keep a copy.</p>
        </Card>
      </div>
    </div>
  );
}
