import { describe, expect, it } from 'vitest';

import {
  firebaseAdminErrorCode,
  firebaseAdminFailureCategory,
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
});
