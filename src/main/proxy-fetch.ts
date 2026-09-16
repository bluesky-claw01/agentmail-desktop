import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

function getProxyUrl(): string | undefined {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || undefined;
}

function shouldBypassProxy(hostname: string): boolean {
  const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
  if (!noProxy.trim()) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  const host = hostname.toLowerCase();
  return noProxy
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') return true;
      if (entry.startsWith('.')) {
        return host.endsWith(entry) || host === entry.slice(1);
      }
      return host === entry;
    });
}

function headersToObject(headers?: HeadersInit): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result[key] = String(value);
    }
  }
  return result;
}

async function readBody(init?: RequestInit): Promise<Buffer | undefined> {
  if (!init?.body) return undefined;
  if (typeof init.body === 'string') return Buffer.from(init.body);
  if (Buffer.isBuffer(init.body)) return init.body;
  if (init.body instanceof Uint8Array) return Buffer.from(init.body);
  if (init.body instanceof ArrayBuffer) return Buffer.from(init.body);
  if (typeof Blob !== 'undefined' && init.body instanceof Blob) {
    return Buffer.from(await init.body.arrayBuffer());
  }
  return Buffer.from(String(init.body));
}

function directFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(input, init);
}

function fetchViaHttpProxy(
  target: URL,
  proxy: URL,
  init: RequestInit | undefined,
  body: Buffer | undefined
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();
  const headers = headersToObject(init?.headers);
  if (!headers.Host && !headers.host) {
    headers.Host = target.host;
  }

  return new Promise((resolve, reject) => {
    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      timeout: 30000
    });

    connectReq.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed (${res.statusCode})`));
        return;
      }

      const requestOptions = {
        host: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        socket,
        agent: false,
        servername: target.hostname,
        timeout: 30000
      } as https.RequestOptions;

      const req = https.request(requestOptions, (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        incoming.on('error', reject);
        incoming.on('end', () => {
          try {
            const status = incoming.statusCode || 502;
            const noBody =
              method === 'HEAD' ||
              status === 204 ||
              status === 205 ||
              status === 304;

            const responseHeaders = new Headers();
            for (const [key, value] of Object.entries(incoming.headers)) {
              if (value === undefined) continue;
              if (Array.isArray(value)) {
                for (const item of value) responseHeaders.append(key, item);
              } else {
                responseHeaders.set(key, value);
              }
            }

            // Undici forbids a body for null-body statuses (e.g. 204), even if empty.
            const responseBody = noBody ? null : Buffer.concat(chunks);

            resolve(
              new Response(responseBody, {
                status,
                statusText: incoming.statusMessage,
                headers: responseHeaders
              })
            );
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('ETIMEDOUT'));
      });
      req.on('error', reject);

      if (body && method !== 'GET' && method !== 'HEAD') {
        req.write(body);
      }
      req.end();
    });

    connectReq.on('timeout', () => {
      connectReq.destroy(new Error('ETIMEDOUT'));
    });
    connectReq.on('error', reject);
    connectReq.end();
  });
}

/**
 * Fetch that honors HTTPS_PROXY/HTTP_PROXY/ALL_PROXY and NO_PROXY.
 * Node/Electron built-in fetch does not use these env vars by itself.
 */
export function createProxyAwareFetch(): typeof fetch {
  const proxyAwareFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const proxy = getProxyUrl();
    const request = new Request(input, init);
    const target = new URL(request.url);

    if (!proxy || target.protocol !== 'https:' || shouldBypassProxy(target.hostname)) {
      return directFetch(input, init);
    }

    const body = await readBody(init);
    return fetchViaHttpProxy(target, new URL(proxy), init, body);
  };

  return proxyAwareFetch as typeof fetch;
}

export function isProxyConfigured(): boolean {
  return !!getProxyUrl();
}
