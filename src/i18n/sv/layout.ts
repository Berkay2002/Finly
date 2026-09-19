import type { Messages } from '../en';

export default {
  month: {
    previous: 'Föregående månad',
    next: 'Nästa månad',
    backToCurrent: 'Tillbaka till innevarande månad',
  },
  upcoming: {
    button: 'Kommande',
    needsYou: 'Behöver dig',
    title: 'På gång',
    subtitle: 'Oregelbundna kostnader de närmaste 30 dagarna',
    emptyTitle: 'Inget ovanligt framöver',
    emptyDescription: 'Inga oregelbundna utgifter infaller de närmaste 30 dagarna.',
  },
  theme: {
    toDark: 'Byt till mörkt läge',
    toLight: 'Byt till ljust läge',
  },
  bottomNav: {
    planning: 'Planering',
    add: 'Lägg till',
    more: 'Mer',
  },
  moreSheet: {
    title: 'Alla avsnitt',
  },
  quickAdd: {
    title: 'Vad vill du lägga till?',
    expense: { label: 'Utgift', description: 'En räkning, kostnad eller prenumeration' },
    income: { label: 'Inkomst', description: 'Lön, frilans, bidrag' },
    goal: { label: 'Sparmål', description: 'Något du sparar till' },
    account: { label: 'Konto', description: 'Ett bank- eller investeringskonto' },
    loan: { label: 'Lån', description: 'CSN, bolån, billån eller kredit' },
  },
  install: {
    title: 'Lägg till Finly på hemskärmen',
    body: 'Öppnas som en app, skyddar dina data från att webbläsaren rensar dem och kan påminna dig innan räkningar.',
    ios: 'Tryck på Dela och sedan Lägg till på hemskärmen. Öppnas som en app, skyddar dina data från att webbläsaren rensar dem och kan påminna dig innan räkningar.',
    install: 'Installera',
    later: 'Inte nu',
  },
  update: {
    title: 'En ny version av Finly är klar',
    body: 'Ladda om för att få de senaste ändringarna.',
    reload: 'Ladda om',
    later: 'Senare',
  },
  frozenMonth: {
    projectedTitle: (month) => `Prognos för ${month}`,
    projectedBody: 'Saldon inkluderar planerat sparande och pengar som blir över. Det här är uppskattningar, inte banksaldon. Ändringar gäller din nuvarande plan.',
    title: (month, closedOn) => `Så såg ${month} ut när den stängdes ${closedOn}`,
    back: 'Tillbaka till den här månaden',
    body: 'Ändringar av inkomster, kostnader och saldon gäller din nuvarande plan. Räkningsbelopp du fyller i här hör till den här månaden.',
  },
} satisfies Messages['layout'];
