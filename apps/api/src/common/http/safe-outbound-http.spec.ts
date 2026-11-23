import { BadGatewayException } from '@nestjs/common';
import {
  assertSafeOutboundUrl,
  isBlockedIpAddress,
} from './safe-outbound-http';

describe('safe-outbound-http', () => {
  it('blocks private, loopback and metadata IP addresses', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('169.254.169.254')).toBe(true);
    expect(isBlockedIpAddress('192.168.1.10')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
    expect(isBlockedIpAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('104.26.10.233')).toBe(false);
  });

  it('rejects non-https protocols and hosts outside allowlist', async () => {
    await expect(
      assertSafeOutboundUrl('http://pokeapi.co/api/v2/pokemon/1', [
        'pokeapi.co',
      ]),
    ).rejects.toThrow(BadGatewayException);

    await expect(
      assertSafeOutboundUrl('https://evil.example.com/hook', ['pokeapi.co']),
    ).rejects.toThrow(BadGatewayException);

    await expect(
      assertSafeOutboundUrl('https://169.254.169.254/latest/meta-data', [
        '169.254.169.254',
      ]),
    ).rejects.toThrow(BadGatewayException);
  });
});
