import { describe, expect, it, vi } from 'vitest';
import { handle } from '../../../api/bank';

const upstream = (status = 200, body: unknown = { ok: true }) =>
  vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    Response.json(body, { status, headers: { 'content-encoding': 'x', 'set-cookie': 'a=b' } }),
  );

const req = (method: string, path: string, init: { headers?: Record<string, string>; body?: string; query?: string } = {}) =>
  new Request(`https://finly.test/api/bank?path=${encodeURIComponent(path)}${init.query ?? ''}`, {
    method,
    headers: { authorization: 'Bearer jwt', host: 'finly.test', ...init.headers },
    body: init.body,
  });

describe('/api/bank', () => {
  it('refuses anything off the list without calling the bank service', async () => {
    const fetcher = upstream();
    for (const [method, path] of [
      ['GET', '/payments'],
      ['POST', '/payments'],
      ['DELETE', '/accounts/abc/balances'],
      ['POST', '/accounts/abc/transactions'],
      ['GET', '/accounts/abc/balances/../../payments'],
      ['GET', 'https://evil.example/aspsps'],
      ['GET', ''],
    ]) {
      expect((await handle(req(method, path), fetcher)).status).toBe(403);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('wants a token', async () => {
    const fetcher = upstream();
    expect((await handle(req('GET', '/aspsps', { headers: { authorization: '' } }), fetcher)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('turns away a page from another site and an oversized body', async () => {
    const fetcher = upstream();
    expect((await handle(req('POST', '/auth', { headers: { origin: 'https://evil.example' }, body: '{}' }), fetcher)).status).toBe(403);
    expect((await handle(req('POST', '/auth', { body: 'x'.repeat(20_000) }), fetcher)).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes the call on with the token, the query and the PSU headers, and nothing else', async () => {
    const fetcher = upstream();
    const res = await handle(
      req('GET', '/accounts/u-1/transactions', {
        query: '&date_from=2026-09-01',
        headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Firefox', cookie: 'secret=1', origin: 'https://finly.test' },
      }),
      fetcher,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.enablebanking.com/accounts/u-1/transactions?date_from=2026-09-01');
    expect(init?.headers).toEqual({
      authorization: 'Bearer jwt',
      accept: 'application/json',
      'psu-ip-address': '203.0.113.7',
      'psu-user-agent': 'Firefox',
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(await res.json()).toEqual({ ok: true });
  });

  it('hands back the status the bank service gave, and 502 when it cannot be reached', async () => {
    expect((await handle(req('GET', '/aspsps'), upstream(401, { message: 'expired' }))).status).toBe(401);
    const down = vi.fn(async () => {
      throw new Error('offline');
    });
    expect((await handle(req('POST', '/sessions', { body: '{"code":"c"}' }), down)).status).toBe(502);
  });
});
