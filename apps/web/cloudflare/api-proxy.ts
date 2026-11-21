export interface PagesProxyEnv {
  readonly API_ORIGIN?: string;
}

export interface PagesFunctionContext {
  readonly request: Request;
  readonly env: PagesProxyEnv;
}

function resolveUpstreamOrigin(rawOrigin: string | undefined): URL | null {
  const trimmed = rawOrigin?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

interface HeadersWithOptionalSetCookie {
  readonly getSetCookie?: () => string[];
}

export function stripUpstreamDomainAttribute(rawSetCookie: string): string {
  return rawSetCookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !/^domain=/i.test(part))
    .join('; ');
}

function readAllSetCookieHeaders(headers: Headers): string[] {
  const extended = headers as unknown as HeadersWithOptionalSetCookie;
  if (typeof extended.getSetCookie === 'function') {
    return extended.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export async function proxyToApiOrigin(
  context: PagesFunctionContext,
): Promise<Response> {
  const { request, env } = context;
  const upstreamBase = resolveUpstreamOrigin(env.API_ORIGIN);
  if (!upstreamBase) {
    return new Response(
      JSON.stringify({
        error: 'API_ORIGIN_UNCONFIGURED',
        message: 'Configure API_ORIGIN no Cloudflare Pages para conectar à API na Azure.',
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    );
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(
    `${incomingUrl.pathname}${incomingUrl.search}`,
    upstreamBase,
  );

  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete('host');
  upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
  upstreamHeaders.set(
    'x-forwarded-proto',
    incomingUrl.protocol.replace(':', ''),
  );

  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return fetch(
      new Request(targetUrl.toString(), {
        method: request.method,
        headers: upstreamHeaders,
      }),
    );
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const upstreamResponse = await fetch(targetUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  const location = responseHeaders.get('location');
  if (location?.startsWith(upstreamBase.origin)) {
    responseHeaders.set(
      'location',
      `${incomingUrl.origin}${location.slice(upstreamBase.origin.length)}`,
    );
  }

  const setCookies = readAllSetCookieHeaders(upstreamResponse.headers);
  if (setCookies.length > 0 && upstreamBase.hostname !== incomingUrl.hostname) {
    responseHeaders.delete('set-cookie');
    for (const cookieHeader of setCookies) {
      responseHeaders.append(
        'set-cookie',
        stripUpstreamDomainAttribute(cookieHeader),
      );
    }
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}
