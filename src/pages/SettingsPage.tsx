import { Camera, Download, RotateCcw, Sparkles, Trash2, Upload, Users } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatMoney, formatMonthKey, formatMonthYear } from '@/engine/format';
import { isFrozen } from '@/engine/history';
import { parseContacts } from '@/engine/vcard';
import { logoDevEnabled } from '@/lib/brandLogo';
import { downloadText, readFileText } from '@/lib/download';
import { useBankStore } from '@/bank/bankStore';
import { usePlanStore } from '@/store/planStore';
import { parsePlanFile, serializePlanFile } from '@/store/planFile';
import { monthKey, usePlan } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { type ThemeMode, useThemeStore } from '@/store/themeStore';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card, CardHeader, Divider } from '@/components/ui/Card';
import { BankCard } from '@/components/bank/BankCard';
import { SyncCard } from '@/components/sync/SyncCard';
import { AvatarPicker } from '@/components/forms/AvatarPicker';
import { BirthYearField } from '@/components/forms/BirthYearField';
import { HomeFields } from '@/components/forms/HomeFields';
import { useSyncActions } from '@/sync/useSync';
import { Label, SegmentedControl, SelectField, TextField } from '@/components/ui/fields';
import { LanguageSwitch } from '@/components/ui/LanguageSwitch';
import { useT } from '@/i18n';

const CURRENCIES = ['SEK', 'NOK', 'DKK', 'EUR', 'GBP', 'USD', 'CHF', 'PLN'];

export function SettingsPage() {
  const plan = usePlan();
  const snapshots = usePlanStore((s) => s.snapshots);
  const { setUserName, setAvatar, setCurrency, loadSample, reset, importPlan, reopenOnboarding, saveSnapshot } = usePlanStore();
  const viewMonth = useUiStore((s) => s.viewMonth);
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const contactsRef = useRef<HTMLInputElement>(null);
  const contacts = useBankStore((s) => s.contacts);
  const setContacts = useBankStore((s) => s.setContacts);
  const contactCount = Object.keys(contacts).length;
  const [message, setMessage] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sync = useSyncActions();
  const synced = sync.configured && sync.status !== 'off';
  const t = useT();
  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'system', label: t.settings.profile.themeSystem },
    { value: 'light', label: t.settings.profile.themeLight },
    { value: 'dark', label: t.settings.profile.themeDark },
  ];

  const onExport = () => {
    downloadText(`finly-plan-${new Date().toISOString().slice(0, 10)}.json`, serializePlanFile({ plan, snapshots }));
    setMessage({ tone: 'success', text: t.settings.exported });
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = parsePlanFile(await readFileText(file));
      importPlan(data);
      const n = Object.keys(data.snapshots).length;
      setMessage({ tone: 'success', text: t.settings.imported(file.name, n) });
    } catch (e) {
      setMessage({ tone: 'warning', text: e instanceof Error ? e.message : t.settings.importFailed });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Names by mobile number from the phone's contacts file, for Swish lines. Device-local, never synced.
  const onImportContacts = async (file: File | undefined) => {
    if (!file) return;
    try {
      const found = parseContacts(await readFileText(file));
      const n = Object.keys(found).length;
      if (!n) throw new Error(t.settings.contacts.none);
      setContacts({ ...contacts, ...found });
      setMessage({ tone: 'success', text: t.settings.contacts.imported(n) });
    } catch (e) {
      setMessage({ tone: 'warning', text: e instanceof Error ? e.message : t.settings.contacts.none });
    } finally {
      if (contactsRef.current) contactsRef.current.value = '';
    }
  };

  const key = monthKey(viewMonth);
  const snapshotList = Object.values(snapshots).sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div>
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} showMonth={false} />

      {message && (
        <Callout tone={message.tone} className="mb-4">
          {message.text}
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t.settings.profile.title} />
          <div className="space-y-4">
            <AvatarPicker
              avatar={plan.avatar}
              name={plan.userName}
              onChange={setAvatar}
              onError={(text) => setMessage({ tone: 'warning', text })}
            >
              <TextField label={t.settings.profile.name} placeholder={t.settings.profile.namePlaceholder} value={plan.userName} onChange={(e) => setUserName(e.target.value)} />
            </AvatarPicker>
            <BirthYearField hint={t.settings.profile.birthYearHint} />
            <HomeFields />
            <SelectField
              label={t.settings.profile.currency}
              value={plan.currency}
              onValueChange={setCurrency}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
            <p className="text-[12px] text-muted">{t.settings.profile.currencyNote}</p>
            <div>
              <Label hint={t.settings.profile.thisDeviceOnly}>{t.settings.profile.appearance}</Label>
              <SegmentedControl value={themeMode} onChange={setThemeMode} options={themeOptions} />
            </div>
            <div>
              <Label hint={t.settings.profile.thisDeviceOnly}>{t.common.language}</Label>
              <LanguageSwitch />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t.settings.closedMonths.title}
            subtitle={t.settings.closedMonths.subtitle}
          />
          <div className="flex flex-wrap items-center gap-2">
            {isFrozen(snapshots, key) ? (
              <span className="text-[12.5px] text-muted">
                {t.settings.closedMonths.closedOn(formatMonthYear(viewMonth), formatDate(snapshots[key].savedAt))}
              </span>
            ) : (
              <>
                <Button variant="soft" icon={Camera} onClick={() => saveSnapshot(key)}>
                  {t.settings.closedMonths.saveSnapshot(formatMonthYear(viewMonth))}
                </Button>
                {snapshots[key] && (
                  <span className="text-[12px] text-muted">{t.settings.closedMonths.alreadySaved}</span>
                )}
              </>
            )}
          </div>
          {snapshotList.length > 0 && (
            <ul className="mt-4 divide-y divide-line">
              {snapshotList.map((s) => (
                <li key={s.month} className="flex items-center justify-between py-2 text-[13px]">
                  <span className="font-medium text-ink">{formatMonthKey(s.month)}</span>
                  <span className="tabular text-muted">
                    {t.settings.closedMonths.row(formatMoney(s.income, plan.currency), formatMoney(s.lifestyleCost, plan.currency))}
                    {s.lifestyleCostActual !== undefined && s.actualVariance
                      ? t.settings.closedMonths.real(formatMoney(s.lifestyleCostActual, plan.currency))
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Divider className="my-5" />
          <SyncCard onMessage={(tone, text) => setMessage({ tone, text })} />

          <Divider className="my-5" />
          <BankCard onMessage={(tone, text) => setMessage({ tone, text })} />

          <Divider className="my-5" />
          <CardHeader title={t.settings.contacts.title} subtitle={contactCount ? t.settings.contacts.count(contactCount) : t.settings.contacts.subtitle} />
          <p className="mb-3 text-[12px] text-muted">{t.settings.contacts.how}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Users} onClick={() => contactsRef.current?.click()}>
              {t.settings.contacts.import}
            </Button>
            <input ref={contactsRef} type="file" accept=".vcf,text/vcard,text/x-vcard" className="hidden" onChange={(e) => onImportContacts(e.target.files?.[0])} />
            {contactCount > 0 && (
              <Button variant="ghost" onClick={() => setContacts({})}>
                {t.settings.contacts.forget}
              </Button>
            )}
          </div>

          <Divider className="my-5" />
          <CardHeader title={t.settings.data.title} subtitle={t.settings.data.subtitle} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={onExport}>
              {t.settings.data.export}
            </Button>
            <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>
              {t.settings.data.import}
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
              {t.settings.data.rerun}
            </Button>
          </div>

          <Divider className="my-5" />
          <CardHeader title={t.settings.demo.title} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Sparkles}
              onClick={() => {
                // A sample is a playground: never let it reach the cloud copy or other devices.
                if (synced) sync.turnOff();
                loadSample();
                setMessage({
                  tone: 'success',
                  text: synced ? t.settings.demo.sampleLoadedSynced : t.settings.demo.sampleLoaded,
                });
              }}
            >
              {t.settings.demo.loadSample}
            </Button>
            {confirmReset ? (
              <>
                <Button
                  variant="danger"
                  icon={Trash2}
                  onClick={() => {
                    // Reset is local: detach first so an empty plan is never pushed to other devices.
                    if (synced) sync.turnOff();
                    reset();
                    setConfirmReset(false);
                    navigate('/welcome');
                  }}
                >
                  {synced ? t.settings.demo.confirmResetSynced : t.settings.demo.confirmReset}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  {t.settings.demo.cancel}
                </Button>
              </>
            ) : (
              <Button variant="danger" icon={Trash2} onClick={() => setConfirmReset(true)}>
                {t.settings.demo.reset}
              </Button>
            )}
          </div>
          <p className="mt-3 text-[12px] text-muted">{t.settings.demo.exportFirst}</p>
        </Card>
      </div>

      {logoDevEnabled() && (
        <p className="mt-6 text-[12px] text-muted">
          <a href="https://logo.dev" target="_blank" className="hover:text-brand-700 hover:underline">
            {t.settings.logosCredit}
          </a>
        </p>
      )}
    </div>
  );
}
