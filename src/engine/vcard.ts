/** A Swedish mobile number the way Swish sends it: the nine digits after the trunk 0 or +46. */
export function mobileKey(raw: string | undefined): string | undefined {
  return (raw ?? '').replace(/^tel:/i, '').replace(/[\s()-]/g, '').match(/^(?:\+?46|0)(7\d{8})$/)?.[1];
}

/**
 * Names by mobile number from a vCard file, which is what Contacts exports. Numbers that are not
 * Swedish mobiles are left out, since only those turn up on Swish lines.
 */
/** Words of a name, as the bank would write them: capitals, no accents. */
function nameWords(s: string): string[] {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
}

/**
 * The contact a transfer's sender name is, when exactly one fits: the bank cuts the name at 12 characters, so
 * the last word may be the start of the contact's ("JONATAN FRED" is Jonatan Fredriksson), and a contact kept
 * by first name only fits a sender who starts with it ("Ludwig" is LUDWIG BOGE). Returns their mobile key.
 */
export function matchContact(sender: string | undefined, contacts: Record<string, string>): string | undefined {
  const a = nameWords(sender ?? '');
  if (!a.length) return undefined;
  const hits = Object.keys(contacts).filter((key) => {
    const b = nameWords(contacts[key]);
    if (!b.length) return false;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i] && !(i === a.length - 1 && b[i].startsWith(a[i]))) return false;
    }
    return true;
  });
  return hits.length === 1 ? hits[0] : undefined;
}

export function parseContacts(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const card of text.replace(/\r?\n[ \t]/g, '').split(/^BEGIN:VCARD/im).slice(1)) {
    const fn = /^FN[^:]*:(.+)$/im.exec(card)?.[1];
    const n = /^N[^:]*:([^;]*);([^;]*)/im.exec(card);
    const name = (fn || [n?.[2], n?.[1]].join(' ')).replace(/\\([,;\\])/g, '$1').trim();
    if (!name) continue;
    for (const m of card.matchAll(/^(?:[\w-]+\.)?TEL[^:]*:(.+)$/gim)) {
      const key = mobileKey(m[1].trim());
      if (key && !out[key]) out[key] = name;
    }
  }
  return out;
}
