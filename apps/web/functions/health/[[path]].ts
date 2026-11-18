import {
  type PagesFunctionContext,
  proxyToApiOrigin,
} from '../../cloudflare/api-proxy';

export function onRequest(context: PagesFunctionContext): Promise<Response> {
  return proxyToApiOrigin(context);
}
