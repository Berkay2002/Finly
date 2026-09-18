/** A Swedish mobile number the way Swish sends it: the nine digits after the trunk 0 or +46. */
export function mobileKey(raw: string | undefined): string | undefined {
  return (raw ?? '').replace(/^tel:/i, '').replace(/[\s()-]/g, '').match(/^(?:\+?46|0)(7\d{8})$/)?.[1];
}

/**
 * Names by mobile number from a vCard file, which is what Contacts exports. Numbers that are not
 * Swedish mobiles are left out, since only those turn up on Swish lines.
 */
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
