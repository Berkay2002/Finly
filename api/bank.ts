/**
 * /api/bank?path=/…: a pass-through to the Enable Banking API, which sends no CORS headers and so
 * cannot be called from the browser. Finly holds no bank credentials: each person registers their own
 * application at Enable Banking, the private key stays in their browser, and the browser signs a
 * short-lived token that this function forwards untouched. Nothing is stored or logged here.
 *
 * Only the handful of read calls the app makes are let through, to that one host. Bank data is
 * personal, so nothing is cached. The caller's address and browser are passed on as the PSU headers,
 * which tells the bank a person is present (unattended reads are capped at a few per day).
 *
 * Kept free of imports so Vercel can run it as-is; tested in src/engine/__tests__/bankProxy.test.ts.
 */

const UPSTREAM = 'https://api.enablebanking.com';
const MAX_BODY = 16_384;

const ALLOWED: [method: string, path: RegExp][] = [
  ['GET', /^\/aspsps$/],
  ['POST', /^\/auth$/],
  ['POST', /^\/sessions$/],
  ['GET', /^\/sessions\/[\w-]+$/],
  ['DELETE', /^\/sessions\/[\w-]+$/],
  ['GET', /^\/accounts\/[\w-]+\/(balances|transactions)$/],
];

const refuse = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

export async function handle(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') ?? '';
  if (!ALLOWED.some(([method, re]) => method === request.method && re.test(path))) return refuse(403, 'Not allowed');

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return refuse(401, 'Missing token');

  // Browsers send Origin on every POST and DELETE; another site's page has no business here.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== (request.headers.get('host') ?? url.host)) return refuse(403, 'Foreign origin');

  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > MAX_BODY) return refuse(413, 'Body too large');

  const query = new URLSearchParams(url.searchParams);
  query.delete('path');
  const target = `${UPSTREAM}${path}${query.size ? `?${query}` : ''}`;

  const headers: Record<string, string> = { authorization, accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const agent = request.headers.get('user-agent');
  // The PSU headers go together or not at all.
  if (ip && agent) {
    headers['psu-ip-address'] = ip;
    headers['psu-user-agent'] = agent;
  }

  try {
    const res = await fetcher(target, { method: request.method, headers, body });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return refuse(502, 'Bank service unreachable');
  }
}

export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request);
export const DELETE = (request: Request) => handle(request);
