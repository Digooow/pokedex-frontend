import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadGatewayException } from '@nestjs/common';

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  let acc = 0;
  for (const part of parts) {
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 255) {
      return null;
    }
    acc = (acc << 8) | num;
  }
  return acc >>> 0;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) {
    return true;
  }
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0x00000000, 0x00ffffff],
    [0x0a000000, 0x0affffff],
    [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff],
    [0xa9fe0000, 0xa9feffff],
    [0xac100000, 0xac1fffff],
    [0xc0000000, 0xc00000ff],
    [0xc0a80000, 0xc0a8ffff],
    [0xc6120000, 0xc613ffff],
    [0xe0000000, 0xffffffff],
  ];
  return ranges.some(([start, end]) => n >= start && n <= end);
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return isIP(mapped) === 4 ? isPrivateOrReservedIpv4(mapped) : true;
  }
  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('ff')
  );
}

export function isBlockedIpAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    return isPrivateOrReservedIpv4(ip);
  }
  if (family === 6) {
    return isPrivateOrReservedIpv6(ip);
  }
  return true;
}

export async function assertSafeOutboundUrl(
  rawUrl: string,
  allowedHosts: readonly string[],
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadGatewayException('URL externa inválida.');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadGatewayException('Apenas conexões HTTPS são permitidas.');
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) {
    throw new BadGatewayException(
      `Host externo não autorizado na allowlist: ${host}.`,
    );
  }

  if (isIP(host) !== 0 && isBlockedIpAddress(host)) {
    throw new BadGatewayException('Endereço IP de destino bloqueado (SSRF).');
  }

  const resolved = await lookup(host, { all: true });
  if (
    resolved.length === 0 ||
    resolved.some((entry) => isBlockedIpAddress(entry.address))
  ) {
    throw new BadGatewayException(
      'Resolução DNS apontou para endereço interno ou reservado (SSRF).',
    );
  }

  return parsed;
}
