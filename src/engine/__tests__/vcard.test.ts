import { describe, expect, it } from 'vitest';
import { mobileKey, parseContacts } from '../vcard';

describe('contacts from a vCard file', () => {
  it('reads names by Swedish mobile number, the way iPhone exports them', () => {
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Berg;Anna;;;', 'FN:Anna Berg',
      'item1.TEL;type=pref:+46 70 233 02 53', 'item1.X-ABLabel:Mobil', 'TEL;type=HOME:08-123 45 67', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:Svensson;Bo;;;', 'FN:Bo Sven', ' sson', 'TEL;type=CELL:0731234567', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:3.0', 'N:;;;;', 'TEL:0709999999', 'END:VCARD',
      'BEGIN:VCARD', 'VERSION:4.0', 'N:Doe;Jo;;;', 'TEL;VALUE=uri:tel:+46-76-000-00-00', 'END:VCARD',
    ].join('\r\n');
    expect(parseContacts(vcf)).toEqual({ '702330253': 'Anna Berg', '731234567': 'Bo Svensson', '760000000': 'Jo Doe' });
  });

  it('keys a number the way a Swish line writes it', () => {
    expect(mobileKey('46702330253')).toBe('702330253');
    expect(mobileKey('070-233 02 53')).toBe('702330253');
    expect(mobileKey('1065578522 A')).toBeUndefined();
  });
});
