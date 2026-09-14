import { describe, expect, it } from 'vitest';

import { validateEnvironment } from '../src/environment';

const validEnvironment = {
  DATABASE_URL:
    'postgresql://teamizer:teamizer@localhost:5432/teamizer?schema=public',
  FIREBASE_PROJECT_ID: 'teamizer-test',
  PROPOSAL_RECEIPT_SECRET: 'test-proposal-receipt-secret-32-characters',
};

describe('validateEnvironment', () => {
  it('provides safe development defaults', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      FIREBASE_PROJECT_ID: 'teamizer-test',
      SCHEDULER_ENABLED: true,
      SCHEDULER_TICK_INTERVAL_MS: 60_000,
      PUSH_PROVIDER_TIMEOUT_MS: 30_000,
      AVATAR_STORAGE_DRIVER: 'local',
      AVATAR_STORAGE_DIRECTORY: '.data/avatars',
      AVATAR_PUBLIC_BASE_URL: 'http://localhost:3000',
      AVATAR_URL_SECRET: validEnvironment.PROPOSAL_RECEIPT_SECRET,
      AVATAR_MAX_UPLOAD_BYTES: 5_000_000,
      AVATAR_URL_TTL_SECONDS: 3_600,
    });
  });

  it('rejects an invalid port', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PORT: 'invalid',
      }),
    ).toThrow('PORT must be an integer between 1 and 65535.');
  });

  it('requires a valid PostgreSQL DATABASE_URL', () => {
    const { DATABASE_URL: _, ...withoutDatabaseUrl } = validEnvironment;

    expect(() => validateEnvironment(withoutDatabaseUrl)).toThrow(
      'DATABASE_URL is required.',
    );
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://localhost/teamizer',
      }),
    ).toThrow('DATABASE_URL must be a valid PostgreSQL URL.');
  });

  it('requires a Firebase project ID', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        PROPOSAL_RECEIPT_SECRET: validEnvironment.PROPOSAL_RECEIPT_SECRET,
      }),
    ).toThrow('FIREBASE_PROJECT_ID is required.');
  });

  it('requires a sufficiently long proposal receipt secret', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        FIREBASE_PROJECT_ID: 'teamizer-test',
        PROPOSAL_RECEIPT_SECRET: 'too-short',
      }),
    ).toThrow('PROPOSAL_RECEIPT_SECRET must be at least 32 characters.');
  });

  it('validates explicit scheduler configuration', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        SCHEDULER_ENABLED: 'false',
        SCHEDULER_TICK_INTERVAL_MS: '5000',
      }),
    ).toMatchObject({
      SCHEDULER_ENABLED: false,
      SCHEDULER_TICK_INTERVAL_MS: 5_000,
    });
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SCHEDULER_ENABLED: 'sometimes',
      }),
    ).toThrow('SCHEDULER_ENABLED must be true or false.');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SCHEDULER_TICK_INTERVAL_MS: '999',
      }),
    ).toThrow(
      'SCHEDULER_TICK_INTERVAL_MS must be an integer of at least 1000.',
    );
  });

  it('rejects an unsafe push-provider timeout', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PUSH_PROVIDER_TIMEOUT_MS: '99',
      }),
    ).toThrow('PUSH_PROVIDER_TIMEOUT_MS must be an integer of at least 100.');
  });

  it('validates avatar storage and signed-URL configuration', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_STORAGE_DRIVER: 's3',
      }),
    ).toThrow('AVATAR_STORAGE_DRIVER must be local or gcs.');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_STORAGE_DRIVER: 'gcs',
      }),
    ).toThrow(
      'AVATAR_GCS_BUCKET_NAME is required when AVATAR_STORAGE_DRIVER is gcs.',
    );
    expect(
      validateEnvironment({
        ...validEnvironment,
        AVATAR_STORAGE_DRIVER: 'gcs',
        AVATAR_GCS_BUCKET_NAME: 'teamizer-test-avatars',
        AVATAR_GCS_OBJECT_PREFIX: 'environments/test',
      }),
    ).toMatchObject({
      AVATAR_STORAGE_DRIVER: 'gcs',
      AVATAR_GCS_BUCKET_NAME: 'teamizer-test-avatars',
      AVATAR_GCS_OBJECT_PREFIX: 'environments/test',
    });
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_STORAGE_DRIVER: 'gcs',
        AVATAR_GCS_BUCKET_NAME: 'gs://teamizer-test-avatars',
      }),
    ).toThrow('AVATAR_GCS_BUCKET_NAME must be a bare valid GCS bucket name.');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_GCS_OBJECT_PREFIX: '../test',
      }),
    ).toThrow(
      'AVATAR_GCS_OBJECT_PREFIX must be slash-separated safe path segments without leading or trailing slashes.',
    );
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_PUBLIC_BASE_URL: 'file:///tmp/avatars',
      }),
    ).toThrow('AVATAR_PUBLIC_BASE_URL must be an HTTP(S) URL.');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_URL_SECRET: 'too-short',
      }),
    ).toThrow('AVATAR_URL_SECRET must be at least 32 characters.');
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_MAX_UPLOAD_BYTES: '10000001',
      }),
    ).toThrow(
      'AVATAR_MAX_UPLOAD_BYTES must be an integer between 1024 and 10000000.',
    );
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AVATAR_URL_TTL_SECONDS: '59',
      }),
    ).toThrow(
      'AVATAR_URL_TTL_SECONDS must be an integer between 60 and 604800.',
    );
  });
});
