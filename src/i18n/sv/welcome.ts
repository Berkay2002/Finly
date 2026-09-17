import type { Messages } from '../en';

export default {
  eyebrow: 'Gjord för svenska hushåll',
  headline: 'Vet vad du kan spendera. Varje månad.',
  intro:
    'Finly samlar din inkomst, dina räkningar, ditt sparande och dina saldon i en tydlig siffra: hur mycket du kan spendera den här månaden utan att röra det du lagt undan.',
  plan: {
    title: 'Planera min ekonomi',
    description: 'En guidad genomgång i tio korta steg. Hoppa över det som inte gäller dig.',
    cta: 'Börja planera',
  },
  demo: {
    title: 'Utforska med exempeldata',
    description: 'Se hela översikten med en exempelplan. Du kan ändra allt eller nollställa det senare.',
    cta: 'Utforska med exempeldata',
  },
  skip: 'Hoppa över tills vidare',
  privacy: 'Allt stannar i den här webbläsaren om du inte slår på synk, och även då krypteras det innan det lämnar enheten.',
  preview: {
    caption: 'Exempelplan',
    safeToSpend: 'Kvar att spendera',
    usually: (range: string) => `Oftast ${range}`,
    income: 'Inkomst',
    cost: 'Normal månad',
    saving: 'Sparande',
    legend: {
      essential: 'Nödvändigt',
      optional: 'Valfritt',
      saving: 'Sparande',
      left: 'Kvar',
    },
  },
  features: [
    {
      title: 'En ärlig siffra',
      body: 'Räkningar, abonnemang, lån och sparande dras av innan du ser vad som är kvar, så siffran du får är den du faktiskt kan använda.',
    },
    {
      title: 'Räkningar som varierar',
      body: 'El, mat och andra kostnader som svänger planeras som ett spann, och den riktiga räkningen ersätter uppskattningen när den kommer.',
    },
    {
      title: 'Månader framåt',
      body: 'Stega framåt och se hur en löneökning, ett nytt lån eller ett större sparmål slår innan du bestämmer dig.',
    },
  ],
} satisfies Messages['welcome'];
