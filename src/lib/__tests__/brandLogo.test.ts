import { afterEach, describe, expect, it, vi } from 'vitest';
import { brandedExpenseName, logoDevEnabled, logoUrlForName } from '../brandLogo';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('logoUrlForName', () => {
  it('builds a name lookup URL with the publishable key', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', 'pk_test');
    const url = logoUrlForName('Spotify');
    expect(url).toMatch(/^https:\/\/img\.logo\.dev\/name\/Spotify\?/);
    expect(url).toContain('token=pk_test');
    expect(url).toContain('format=png');
    expect(url).toContain('size=128');
  });

  it('URL-encodes spaces and special characters', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', 'pk_test');
    expect(logoUrlForName('The Home Depot')).toContain('/name/The%20Home%20Depot');
    expect(logoUrlForName('AT&T')).toContain('/name/AT%26T');
  });

  it('returns nothing without a key or a name', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', '');
    expect(logoUrlForName('Spotify')).toBeUndefined();
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', 'pk_test');
    expect(logoUrlForName('  ')).toBeUndefined();
  });

  it('is disabled without a key', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', '');
    expect(logoDevEnabled()).toBe(false);
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', 'pk_test');
    expect(logoDevEnabled()).toBe(true);
  });
});

describe('brandedExpenseName', () => {
  it('brands a custom item by its name', () => {
    expect(brandedExpenseName({ name: 'Spotify', subcategory: 'custom' })).toBe('Spotify');
  });

  it('brands a custom item with surrounding whitespace trimmed', () => {
    expect(brandedExpenseName({ name: '  Netflix  ', subcategory: 'custom' })).toBe('Netflix');
  });

  it('skips a suggested item still carrying its default name', () => {
    expect(brandedExpenseName({ name: 'Streaming services', subcategory: 'streaming' })).toBeNull();
  });

  it('brands a suggested item the person renamed', () => {
    expect(brandedExpenseName({ name: 'Spotify', subcategory: 'streaming' })).toBe('Spotify');
  });

  it('returns nothing for an empty name', () => {
    expect(brandedExpenseName({ name: '   ', subcategory: 'custom' })).toBeNull();
  });
});
