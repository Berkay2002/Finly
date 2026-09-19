import { Car, Gift, GraduationCap, Umbrella, Utensils, Zap } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { expenseIcon } from './icons';

describe('expenseIcon', () => {
  it('reads the name first, in either language', () => {
    expect(expenseIcon({ name: 'Gift to 070-262 79 30', category: 'planned' })).toBe(Gift);
    expect(expenseIcon({ name: 'Julklappar', category: 'planned' })).toBe(Gift);
    expect(expenseIcon({ name: 'Work lunches', category: 'living' })).toBe(Utensils);
    expect(expenseIcon({ name: 'CSN', category: 'finance' })).toBe(GraduationCap);
    expect(expenseIcon({ name: 'Bilförsäkring', category: 'transport' })).toBe(Umbrella);
  });
  it('falls back to the tag, then the category', () => {
    expect(expenseIcon({ name: 'Volvo', category: 'transport', tags: ['car'] })).toBe(Car);
    expect(expenseIcon({ name: 'Vattenfall', category: 'home', tags: ['utility'] })).toBe(Zap);
    expect(expenseIcon({ name: 'Something', category: 'leisure', tags: [] })).toBe('nav-leisure');
  });
  it('does not match inside unrelated words', () => {
    expect(expenseIcon({ name: 'Medical', category: 'living' })).toBe('nav-living');
    expect(expenseIcon({ name: 'Elsa daycare', category: 'planned' })).not.toBe(Zap);
  });
});
