import type { Messages } from '../en';
import { plural } from '../plural';

export default {
  title: 'Inställningar',
  subtitle: 'Din profil, dina data och hur Finly sparar dem.',
  exported: 'Din plan laddades ner som en JSON-fil.',
  imported: (file, closedMonths) =>
    `Importerade ${file}${closedMonths > 0 ? ` med ${closedMonths} ${plural(closedMonths, 'stängd månad', 'stängda månader')}` : ''}.`,
  importFailed: 'Filen kunde inte läsas.',
  notPlanFile: 'Det här är inte en planfil från Finly',
  logosCredit: 'Logotyper från Logo.dev',
  profile: {
    title: 'Profil',
    name: 'Ditt namn',
    namePlaceholder: 'Används i hälsningen',
    birthYearHint: '(valfritt, avgör hur länge du betalar CSN)',
    currency: 'Valuta',
    currencyNote: 'Beloppen visas som du skrev in dem. Att byta valuta räknar inte om dem.',
    appearance: 'Utseende',
    thisDeviceOnly: '(bara den här enheten)',
    themeSystem: 'System',
    themeLight: 'Ljust',
    themeDark: 'Mörkt',
  },
  birthYear: {
    label: 'Födelseår',
    optional: '(valfritt)',
    placeholder: 't.ex. 1998',
  },
  closedMonths: {
    title: 'Stängda månader',
    subtitle:
      'Varje månad stängs automatiskt när nästa börjar. Då ligger siffrorna kvar som de var och nästa månad kan visa vad som har ändrats.',
    closedOn: (month, date) => `${month} stängdes ${date}.`,
    saveSnapshot: (month) => `Spara ögonblicksbild för ${month}`,
    alreadySaved: 'Redan sparad. Om du sparar igen skrivs den över.',
    row: (income, costs) => `inkomst ${income} · kostnader ${costs}`,
    real: (amount) => ` · faktiskt ${amount}`,
  },
  data: {
    title: 'Dina data',
    subtitle: 'Sparas i den här webbläsaren. Exportera en fil för en backup som du själv har koll på.',
    export: 'Exportera JSON',
    import: 'Importera JSON',
    rerun: 'Gör planeringen igen',
  },
  demo: {
    title: 'Demo & nollställning',
    loadSample: 'Ladda exempeldata',
    sampleLoadedSynced:
      'Exempelplanen är laddad och synken är avstängd på den här enheten. Din molnkopia och dina andra enheter behåller din plan.',
    sampleLoaded: 'Exempelplanen är laddad. Din tidigare plan ersattes.',
    confirmResetSynced: 'Ja, radera allt på den här enheten',
    confirmReset: 'Ja, radera allt',
    cancel: 'Avbryt',
    reset: 'Nollställ all data',
    exportFirst: 'Exportera först om du vill spara en kopia.',
  },
} satisfies Messages['settings'];
