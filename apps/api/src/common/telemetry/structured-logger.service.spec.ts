import { StructuredLoggerService } from './structured-logger.service';

describe('StructuredLoggerService (PII & secret log scrubbing)', () => {
  it('redacts sensitive object keys while preserving normal metadata fields', () => {
    const logger = new StructuredLoggerService();
    const writes: string[] = [];
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });

    try {
      logger.log(
        {
          event: 'auth_debug',
          authorization: 'Bearer sample-access-value',
          cookie: 'pokeverse_session=sample-sid',
          password: 'PlainPassword123',
          refreshToken: 'refresh-value-1',
          otpCode: '123456',
          nested: {
            codeVerifier: 'verifier-abc',
            safeField: 'pikachu',
          },
        },
        'AuthDebug',
      );
    } finally {
      spy.mockRestore();
    }

    expect(writes).toHaveLength(1);
    const entry = JSON.parse(writes[0] ?? '{}') as {
      readonly context: string;
      readonly message: string;
      readonly service_name: string;
    };
    expect(entry.context).toBe('AuthDebug');
    expect(entry.service_name).toBe('pokeverse-api');
    const parsedMessage = JSON.parse(entry.message) as {
      readonly event: string;
      readonly authorization: string;
      readonly cookie: string;
      readonly password: string;
      readonly refreshToken: string;
      readonly otpCode: string;
      readonly nested: {
        readonly codeVerifier: string;
        readonly safeField: string;
      };
    };
    expect(parsedMessage).toEqual({
      event: 'auth_debug',
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      password: '[REDACTED]',
      refreshToken: '[REDACTED]',
      otpCode: '[REDACTED]',
      nested: {
        codeVerifier: '[REDACTED]',
        safeField: 'pikachu',
      },
    });
  });

  it('redacts Bearer tokens, auth header pairs, and OAuth query strings in text logs', () => {
    const logger = new StructuredLoggerService();
    const writes: string[] = [];
    const spy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      });

    try {
      logger.emitEvent(
        'warn',
        'Callback GET /api/v1/auth/google/callback?code=4/sample-code&state=sample-state failed with Bearer sample-bearer-xyz and cookie=sid123',
        {
          context: 'GoogleOAuth',
          errorCode: 'OAUTH_WARN',
          traceId: '0123456789abcdef0123456789abcdef',
        },
      );
    } finally {
      spy.mockRestore();
    }

    expect(writes).toHaveLength(1);
    const entry = JSON.parse(writes[0] ?? '{}') as {
      readonly trace_id: string | null;
      readonly error_code: string | null;
      readonly message: string;
    };
    expect(entry.trace_id).toBe('0123456789abcdef0123456789abcdef');
    expect(entry.error_code).toBe('OAUTH_WARN');
    expect(entry.message).not.toContain('sample-code');
    expect(entry.message).not.toContain('sample-state');
    expect(entry.message).not.toContain('sample-bearer-xyz');
    expect(entry.message).not.toContain('sid123');
    expect(entry.message).toContain('code=[REDACTED]');
    expect(entry.message).toContain('state=[REDACTED]');
    expect(entry.message).toContain('Bearer [REDACTED]');
    expect(entry.message).toContain('cookie=[REDACTED]');
  });

  it('preserves ordinary messages and truncates deeply nested objects', () => {
    const logger = new StructuredLoggerService();
    const errWrites: string[] = [];
    const spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        errWrites.push(String(chunk));
        return true;
      });

    try {
      logger.emitEvent('info', 'PokéVerse API listening on port 3000');
      logger.error(
        { l1: { l2: { l3: { l4: { l5: { deep: 'x' } } } } } },
        '0123456789abcdef0123456789abcdef',
        'DeepCtx',
      );
    } finally {
      spy.mockRestore();
    }

    expect(errWrites).toHaveLength(1);
    const errEntry = JSON.parse(errWrites[0] ?? '{}') as {
      readonly error_code: string;
      readonly message: string;
    };
    expect(errEntry.error_code).toBe('INTERNAL_LOG_ERROR');
    expect(errEntry.message).toContain('[TRUNCATED]');
  });
});
