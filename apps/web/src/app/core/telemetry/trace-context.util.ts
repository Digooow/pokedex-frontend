export interface TraceparentContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceparent: string;
}

let fallbackSequence = 0;

function generateFallbackHexId(byteLength: 16 | 8): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    const uuidHex = globalThis.crypto.randomUUID().replaceAll('-', '');
    return uuidHex.slice(0, byteLength * 2);
  }
  fallbackSequence = (fallbackSequence + 1) >>> 0;
  const seqHex = fallbackSequence.toString(16).padStart(8, '0');
  const timeHex = Date.now().toString(16).padStart(12, '0').slice(-12);
  return `${seqHex}${timeHex}${seqHex}`.slice(0, byteLength * 2).padEnd(byteLength * 2, '0');
}

export function generateHexId(byteLength: 16 | 8): string {
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    return generateFallbackHexId(byteLength);
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);

  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

export function createTraceparentHeader(): TraceparentContext {
  const traceId = generateHexId(16);
  const spanId = generateHexId(8);
  return {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`,
  };
}
