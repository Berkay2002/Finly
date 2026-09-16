import type { Messages } from '../en';

export default {
  card: {
    title: 'Synk mellan enheter',
    notConfigured: 'Synkronisering är inte aktiverad i den här versionen. Dina data stannar i den här webbläsaren.',
    subtitle: 'Inget konto behövs. En fras på 12 ord kopplar ihop dina enheter, och allt krypteras innan det lämnar den här.',
    somethingWentWrong: 'Något gick fel.',
    showPhrase: 'Visa fras',
    tryAgain: 'Försök igen',
    turnOff: 'Stäng av synk',
    confirmDelete: 'Ja, radera molnkopian',
    cancel: 'Avbryt',
    deleteCloud: 'Radera molnkopian',
    offExplainer:
      'Om du stänger av synk finns dina data kvar här och i molnet. Om du raderar molnkopian försvinner den för alla enheter, men varje enhet behåller sina lokala data.',
    turnOn: 'Slå på synk',
    havePhrase: 'Jag har en fras',
    deleted: 'Molnkopian är raderad. Dina data finns kvar här.',
    turnedOn: 'Synk är på. Använd samma fras på dina andra enheter.',
    downloaded: 'Din plan har hämtats från molnet.',
    uploaded: 'Det fanns ingen molnkopia för frasen än, så planen på den här enheten laddades upp.',
    conflict: 'Både den här enheten och molnet har en plan. Välj vilken du vill behålla högst upp på sidan.',
  },
  status: {
    syncing: 'Synkar…',
    needsDecision: 'Du behöver välja',
    couldNotSync: (error) => `Kunde inte synka: ${error}`,
    unknownError: 'okänt fel',
    synced: (when) => `Synkad ${when}`,
    waiting: 'Väntar på första synken',
  },
  copy: {
    copied: 'Kopierad',
    copyPhrase: 'Kopiera fras',
  },
  newPhrase: {
    title: 'Din synkfras',
    subtitle:
      'Skriv ner de här 12 orden eller spara dem i en lösenordshanterare. De är det enda sättet att läsa din molnkopia och kan inte återställas.',
    saved: 'Jag har sparat min fras på ett säkert ställe.',
    couldNotTurnOn: 'Kunde inte slå på synk.',
  },
  join: {
    title: 'Ange din synkfras',
    subtitle: 'De 12 ord som visades när du slog på synk på din andra enhet.',
    connect: 'Anslut',
    placeholder: 'ord ord ord …',
    pasteHint: 'Klistra in eller skriv orden i rätt ordning.',
    wordCount: (n, total) => `${n} av ${total} ord`,
  },
  show: {
    title: 'Din synkfras',
    subtitle: 'Ange de här orden på en annan enhet för att synka den med den här.',
    done: 'Klar',
  },
  banner: {
    title: 'En annan enhet har ändrat planen',
    keepMine: 'Behåll min',
    useTheirs: 'Använd molnkopian',
    body: (when, remoteNewer) =>
      `Molnkopian sparades ${when} och den här enheten har ändringar som inte har skickats än. ${remoteNewer ? 'Molnkopian är nyare.' : 'Kopian på den här enheten är nyare.'} Stängda månader från båda behålls oavsett vilken du väljer.`,
  },
  phraseError: {
    unreadable: 'Frasen kunde inte läsas.',
    length: (n) => `En synkfras består av ${n} ord.`,
    word: (word) => `”${word}” finns inte i ordlistan. Kontrollera stavningen.`,
    checksum: 'Frasen stämmer inte. Förmodligen är ett ord fel eller i fel ordning.',
  },
  errors: {
    notConfigured: 'Synkronisering är inte aktiverad i den här versionen.',
    generic: 'Något gick fel vid synkroniseringen.',
    cloudUnreadable: (reason) => `Molnkopian kunde inte läsas: ${reason}`,
    unrecognised: 'Synkdatan känns inte igen',
  },
} satisfies Messages['sync'];
