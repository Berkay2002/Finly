import type { Messages } from '../en';

export default {
  title: 'Nu planerar vi din ekonomi',
  subtitle: 'Några enkla steg till en tydlig bild och en plan som passar dig.',
  skipForNow: 'Hoppa över tills vidare',
  stepOf: (step, total) => `Steg ${step} av ${total}`,
  aboutYou: {
    title: 'Om dig',
    description: 'Var du bor avgör din nettolön och dina elkostnader. Ditt födelseår avgör hur länge du betalar CSN.',
    languageHint: 'Vilket språk vill du använda Finly på?',
  },
  loans: {
    title: 'Lån',
    description:
      'CSN, bolån, billån och krediter. Betalningarna räknas som nödvändiga kostnader, och skulden och räntan visar vad lånet faktiskt kostar dig.',
  },
  bankingInsurance: 'Bank och försäkringar',
  accuracyTip: 'Var så exakt du kan. Du kan alltid ändra det senare.',
  back: 'Tillbaka',
  addLater: 'Jag lägger till det senare',
  confirm: 'Bekräfta planen och öppna översikten',
  continueTo: (step) => `Fortsätt till ${step.toLocaleLowerCase('sv-SE')}`,
  progress: 'Din planering hittills',
  progressCount: (done, total) => `${done} av ${total}`,
  progressNote: 'Du är på väg mot en tydligare framtid.',
} satisfies Messages['onboarding'];
