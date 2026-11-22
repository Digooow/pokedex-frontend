import {
  validateAuthDialogSubmission,
  validateForgotPasswordEmail,
  validateResendVerificationEmail,
} from './auth-dialog-validator.util';

describe('auth-dialog-validator.util', () => {
  it('validates login, register and verify-email submissions cleanly', () => {
    const login = validateAuthDialogSubmission({
      mode: 'login',
      username: '',
      email: 'red@pokeverse.dev',
      password: 'Password1234!',
      otpCode: '',
      useBackupCode: false,
      resetCodeRequested: false,
    });
    expect(login).toEqual({
      ok: true,
      command: {
        kind: 'login',
        data: { email: 'red@pokeverse.dev', password: 'Password1234!' },
      },
    });

    const register = validateAuthDialogSubmission({
      mode: 'register',
      username: 'Red_Kanto',
      email: 'red@pokeverse.dev',
      password: 'Password1234!',
      otpCode: '',
      useBackupCode: false,
      resetCodeRequested: false,
    });
    expect(register.ok).toBe(true);

    const verify = validateAuthDialogSubmission({
      mode: 'verify-email',
      username: '',
      email: 'red@pokeverse.dev',
      password: '',
      otpCode: '123456',
      useBackupCode: false,
      resetCodeRequested: false,
    });
    expect(verify).toEqual({
      ok: true,
      command: {
        kind: 'verify-email',
        data: { email: 'red@pokeverse.dev', code: '123456' },
      },
    });
  });

  it('validates mfa-challenge (totp & backup_code) and forgot-password flows', () => {
    const mfaTotp = validateAuthDialogSubmission({
      mode: 'mfa-challenge',
      username: '',
      email: '',
      password: '',
      otpCode: '654321',
      useBackupCode: false,
      resetCodeRequested: false,
    });
    expect(mfaTotp).toEqual({
      ok: true,
      command: { kind: 'mfa-challenge', data: { method: 'totp', code: '654321' } },
    });

    const mfaBackup = validateAuthDialogSubmission({
      mode: 'mfa-challenge',
      username: '',
      email: '',
      password: '',
      otpCode: 'ABCD-EFGH',
      useBackupCode: true,
      resetCodeRequested: false,
    });
    expect(mfaBackup).toEqual({
      ok: true,
      command: { kind: 'mfa-challenge', data: { method: 'backup_code', code: 'ABCD-EFGH' } },
    });

    const forgotRequest = validateAuthDialogSubmission({
      mode: 'forgot',
      username: '',
      email: 'red@pokeverse.dev',
      password: '',
      otpCode: '',
      useBackupCode: false,
      resetCodeRequested: false,
    });
    expect(forgotRequest).toEqual({
      ok: true,
      command: { kind: 'forgot-request', data: { email: 'red@pokeverse.dev' } },
    });

    const forgotReset = validateAuthDialogSubmission({
      mode: 'forgot',
      username: '',
      email: 'red@pokeverse.dev',
      password: 'NewPassword123!',
      otpCode: '123456',
      useBackupCode: false,
      resetCodeRequested: true,
    });
    expect(forgotReset).toEqual({
      ok: true,
      command: {
        kind: 'forgot-reset',
        data: { email: 'red@pokeverse.dev', code: '123456', newPassword: 'NewPassword123!' },
      },
    });
  });

  it('rejects malformed email or short OTP codes with localized errors', () => {
    expect(validateResendVerificationEmail('invalido').ok).toBe(false);
    expect(validateForgotPasswordEmail('invalido').ok).toBe(false);
    expect(
      validateAuthDialogSubmission({
        mode: 'login',
        username: '',
        email: 'bad-email',
        password: '123',
        otpCode: '',
        useBackupCode: false,
        resetCodeRequested: false,
      }).ok,
    ).toBe(false);
  });
});
