import { plural } from '../plural';

export default {
  title: 'Settings',
  subtitle: 'Your profile, your data, and how Finly keeps it.',
  exported: 'Your plan was downloaded as a JSON file.',
  imported: (file: string, closedMonths: number) =>
    `Imported ${file}${closedMonths > 0 ? ` with ${closedMonths} closed ${plural(closedMonths, 'month', 'months')}` : ''}.`,
  importFailed: 'Could not read that file.',
  notPlanFile: 'Not a Finly plan file',
  logosCredit: 'Logos provided by Logo.dev',
  profile: {
    title: 'Profile',
    name: 'Your name',
    namePlaceholder: 'Used in the greeting',
    birthYearHint: '(optional, for how long you pay CSN)',
    currency: 'Currency',
    currencyNote: 'Amounts are shown as entered; changing the currency does not convert them.',
    appearance: 'Appearance',
    thisDeviceOnly: '(this device only)',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  birthYear: {
    label: 'Year you were born',
    optional: '(optional)',
    placeholder: 'e.g. 1998',
  },
  closedMonths: {
    title: 'Closed months',
    subtitle:
      'Each month is closed automatically when the next one starts, so its numbers stay as they were and the next month can show what changed.',
    closedOn: (month: string, date: string) => `${month} was closed on ${date}.`,
    saveSnapshot: (month: string) => `Save snapshot for ${month}`,
    alreadySaved: 'Already saved. Saving again overwrites it.',
    row: (income: string, costs: string) => `income ${income} · costs ${costs}`,
    real: (amount: string) => ` · real ${amount}`,
  },
  data: {
    title: 'Your data',
    subtitle: 'Stored in this browser. Export a file for a backup you control.',
    export: 'Export JSON',
    import: 'Import JSON',
    rerun: 'Re-run planning session',
  },
  demo: {
    title: 'Demo & reset',
    loadSample: 'Load sample data',
    sampleLoadedSynced:
      'Sample plan loaded and sync turned off on this device. Your cloud copy and other devices keep your plan.',
    sampleLoaded: 'Sample plan loaded. Your previous plan was replaced.',
    confirmResetSynced: 'Yes, delete everything on this device',
    confirmReset: 'Yes, delete everything',
    cancel: 'Cancel',
    reset: 'Reset all data',
    exportFirst: 'Export first if you want to keep a copy.',
  },
};
