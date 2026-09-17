import { afterEach, describe, expect, it, vi } from 'vitest';
import { logoUrlForDomain } from '../brandLogo';
import { parseBrands as parseClientBrands, searchBrands } from '../logoSearch';
import { parseBrands as parseApiBrands } from '../../../api/logo-search';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const PAYLOAD = [
  { name: 'Sweetgreen', domain: 'sweetgreen.com', logo_url: 'https://img.logo.dev/sweetgreen.com?token=pk_x' },
  { name: 'Sweet Green Hotel', domain: 'sweetgreenhotel.com' },
  { name: 'Sweetgreen', domain: 'sweetgreen.com' },
  { domain: '' },
  { name: 'No domain' },
  null,
];

describe('parseBrands', () => {
  it('trims to name and domain, deduplicated, in the api proxy', () => {
    expect(parseApiBrands(PAYLOAD)).toEqual([
      { name: 'Sweetgreen', domain: 'sweetgreen.com' },
      { name: 'Sweet Green Hotel', domain: 'sweetgreenhotel.com' },
    ]);
  });

  it('accepts a bare array or a results envelope in the client', () => {
    expect(parseClientBrands(PAYLOAD)).toHaveLength(2);
    expect(parseClientBrands({ results: PAYLOAD })).toHaveLength(2);
    expect(parseClientBrands({ error: 'nope' })).toEqual([]);
    expect(parseClientBrands(null)).toEqual([]);
  });
});

describe('searchBrands', () => {
  it('asks the proxy and returns parsed matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(PAYLOAD.slice(0, 2)), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchBrands('Sweetgreen')).resolves.toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/logo-search?q=Sweetgreen');
  });

  it('answers null, not an error, when the endpoint is missing or unconfigured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"not configured"}', { status: 503 })));
    await expect(searchBrands('Sweetgreen')).resolves.toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    );
    await expect(searchBrands('Sweetgreen')).resolves.toBeNull();
  });

  it('answers null for an empty result set from the search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
    await expect(searchBrands('Zxqvw Nonexistent')).resolves.toEqual([]);
  });

  it('does not fetch for short queries', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(searchBrands(' s ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('logoUrlForDomain', () => {
  it('builds a domain lookup URL, stripping scheme and path', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', 'pk_test');
    const url = logoUrlForDomain('https://spotify.com/intl/sv/');
    expect(url).toMatch(/^https:\/\/img\.logo\.dev\/spotify\.com\?/);
    expect(url).toContain('token=pk_test');
    expect(url).toContain('format=png');
  });

  it('returns nothing without a key', () => {
    vi.stubEnv('VITE_LOGO_DEV_PUBLISHABLE_KEY', '');
    expect(logoUrlForDomain('spotify.com')).toBeUndefined();
  });
});
