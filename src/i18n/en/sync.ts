export default {
  card: {
    title: 'Sync between devices',
    notConfigured: 'Sync is not configured in this build. Your data stays in this browser.',
    subtitle: 'No account. A 12-word phrase links your devices; everything is encrypted before it leaves this one.',
    somethingWentWrong: 'Something went wrong.',
    showPhrase: 'Show phrase',
    tryAgain: 'Try again',
    turnOff: 'Turn off sync',
    confirmDelete: 'Yes, delete the cloud copy',
    cancel: 'Cancel',
    deleteCloud: 'Delete cloud copy',
    offExplainer:
      'Turning sync off keeps your data here and in the cloud. Deleting the cloud copy removes it for every device; each device keeps its own local data.',
    turnOn: 'Turn on sync',
    havePhrase: 'I have a phrase',
    deleted: 'The cloud copy was deleted. Your data is still here.',
    turnedOn: 'Sync is on. Use the same phrase on your other devices.',
    downloaded: 'Your plan was downloaded from the cloud.',
    uploaded: 'No cloud copy existed for that phrase yet, so this device’s plan was uploaded.',
    conflict: 'This device and the cloud both have a plan. Choose which one to keep at the top of the page.',
  },
  status: {
    syncing: 'Syncing…',
    needsDecision: 'Needs your decision',
    couldNotSync: (error: string) => `Could not sync: ${error}`,
    unknownError: 'unknown error',
    synced: (when: string) => `Synced ${when}`,
    waiting: 'Waiting for the first sync',
  },
  copy: {
    copied: 'Copied',
    copyPhrase: 'Copy phrase',
  },
  newPhrase: {
    title: 'Your sync phrase',
    subtitle:
      'Write these 12 words down or put them in a password manager. They are the only way to read your cloud copy, and they cannot be recovered.',
    saved: 'I have saved my phrase somewhere safe.',
    couldNotTurnOn: 'Could not turn on sync.',
  },
  join: {
    title: 'Enter your sync phrase',
    subtitle: 'The 12 words shown when sync was turned on on your other device.',
    connect: 'Connect',
    placeholder: 'word word word …',
    pasteHint: 'Paste or type the words, in order.',
    wordCount: (n: number, total: number) => `${n} of ${total} words`,
  },
  show: {
    title: 'Your sync phrase',
    subtitle: 'Enter these words on another device to sync it with this one.',
    done: 'Done',
  },
  banner: {
    title: 'Another device changed this plan',
    keepMine: 'Keep mine',
    useTheirs: 'Use theirs',
    body: (when: string, remoteNewer: boolean) =>
      `The cloud copy was saved ${when} and this device has edits it has not sent yet. ${remoteNewer ? 'The cloud copy is newer.' : 'This device’s copy is newer.'} Closed months from both are kept either way.`,
  },
  phraseError: {
    unreadable: 'That phrase could not be read.',
    length: (n: number) => `A sync phrase has ${n} words.`,
    word: (word: string) => `"${word}" is not a word from the list. Check the spelling.`,
    checksum: 'The phrase does not check out. One word is probably wrong or out of order.',
  },
  errors: {
    notConfigured: 'Sync is not configured in this build.',
    generic: 'Something went wrong while syncing.',
    cloudUnreadable: (reason: string) => `The cloud copy could not be read: ${reason}`,
    unrecognised: 'Unrecognised sync data',
  },
};
