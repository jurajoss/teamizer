import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Auth } from 'firebase-admin/auth';
import { describe, expect, it, vi } from 'vitest';

import {
  firebaseAdminErrorCode,
  firebaseAdminErrorReason,
  firebaseAdminFailureCategory,
  FirebaseIdentityLookup,
} from '../src/auth/firebase-identity-lookup.service';

describe('Firebase Admin identity lookup diagnostics', () => {
  it('extracts only safe provider codes and categorizes credential failures', () => {
    expect(
      firebaseAdminErrorCode({
        code: 'app/invalid-credential',
        message: 'sensitive provider detail',
      }),
    ).toBe('app/invalid-credential');
    expect(firebaseAdminFailureCategory('app/invalid-credential')).toBe(
      'INVALID_CREDENTIAL',
    );
    expect(firebaseAdminFailureCategory('auth/insufficient-permission')).toBe(
      'INSUFFICIENT_PERMISSION',
    );
    expect(firebaseAdminFailureCategory('auth/project-not-found')).toBe(
      'PROJECT_CONFIGURATION',
    );
    expect(firebaseAdminFailureCategory(null)).toBe('UNKNOWN');
  });

  it('reads nested Firebase error codes without exposing error messages', () => {
    expect(
      firebaseAdminErrorCode({
        errorInfo: {
          code: 'auth/user-not-found',
          message: 'provider implementation detail',
        },
      }),
    ).toBe('auth/user-not-found');
    expect(firebaseAdminErrorCode(new Error('private credential path'))).toBe(
      null,
    );
  });

  it('detects the ADC quota-project permission failure without copying provider messages', () => {
    const error = {
      code: 'auth/internal-error',
      message: 'sensitive provider response',
      httpResponse: {
        data: {
          error: {
            details: [{ reason: 'USER_PROJECT_DENIED' }],
          },
        },
      },
    };

    expect(firebaseAdminErrorReason(error)).toBe('USER_PROJECT_DENIED');
    expect(
      firebaseAdminFailureCategory(
        firebaseAdminErrorCode(error),
        firebaseAdminErrorReason(error),
      ),
    ).toBe('SERVICE_USAGE_PERMISSION');
    expect(
      firebaseAdminErrorReason({
        httpResponse: {
          data: { error: { details: [{ reason: 'unsafe value!' }] } },
        },
      }),
    ).toBeNull();
  });

  it('gets by email, creates a passwordless identity, and generates a password setup link', async () => {
    const firebaseAuth = {
      getUserByEmail: vi.fn().mockResolvedValue({ uid: 'existing-uid' }),
      createUser: vi.fn().mockResolvedValue({ uid: 'created-uid' }),
      generatePasswordResetLink: vi
        .fn()
        .mockResolvedValue('https://firebase.example.test/setup-token'),
    };
    const lookup = createLookup(firebaseAuth);

    await expect(lookup.findByEmail('player@example.com')).resolves.toEqual({
      authProviderId: 'existing-uid',
    });
    await expect(
      lookup.createEmailPasswordIdentity('new@example.com', 'New Player'),
    ).resolves.toEqual({ authProviderId: 'created-uid' });
    await expect(
      lookup.generatePasswordSetupLink('new@example.com'),
    ).resolves.toBe('https://firebase.example.test/setup-token');

    expect(firebaseAuth.createUser).toHaveBeenCalledWith({
      email: 'new@example.com',
      emailVerified: false,
      displayName: 'New Player',
      disabled: false,
    });
    expect(firebaseAuth.createUser.mock.calls[0]?.[0]).not.toHaveProperty(
      'password',
    );
    expect(firebaseAuth.generatePasswordResetLink).toHaveBeenCalledWith(
      'new@example.com',
    );
  });

  it('maps a missing email to null and logs only safe failure metadata', async () => {
    const missingLookup = createLookup({
      getUserByEmail: vi
        .fn()
        .mockRejectedValue({ code: 'auth/user-not-found' }),
    });
    await expect(
      missingLookup.findByEmail('missing@example.com'),
    ).resolves.toBeNull();

    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const failingLookup = createLookup({
      getUserByEmail: vi.fn().mockRejectedValue({
        code: 'auth/internal-error',
        message: 'credential=/private/secret.json recipient=secret@example.com',
        httpResponse: {
          data: {
            error: { details: [{ reason: 'USER_PROJECT_DENIED' }] },
          },
        },
      }),
    });

    await expect(
      failingLookup.findByEmail('secret@example.com'),
    ).rejects.toBeDefined();
    const loggedValue = String(log.mock.calls[0]?.[0]);
    expect(loggedValue).toContain('SERVICE_USAGE_PERMISSION');
    expect(loggedValue).not.toContain('secret@example.com');
    expect(loggedValue).not.toContain('/private/secret.json');
    log.mockRestore();
  });
});

function createLookup(firebaseAuth: Partial<Auth>): FirebaseIdentityLookup {
  const config = {
    getOrThrow: vi.fn().mockReturnValue('teamizer-test'),
  } as unknown as ConfigService;
  return new FirebaseIdentityLookup(config, firebaseAuth as Auth);
}
