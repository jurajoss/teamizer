const supportedNodeEnvironments = new Set([
  'development',
  'test',
  'production',
]);

export type NodeEnvironment = 'development' | 'test' | 'production';

export type AppEnvironment = Record<string, unknown> & {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  DATABASE_URL: string;
  FIREBASE_PROJECT_ID: string;
  PROPOSAL_RECEIPT_SECRET: string;
  SCHEDULER_ENABLED: boolean;
  SCHEDULER_TICK_INTERVAL_MS: number;
  PUSH_PROVIDER_TIMEOUT_MS: number;
  AVATAR_STORAGE_DIRECTORY: string;
  AVATAR_PUBLIC_BASE_URL: string;
  AVATAR_URL_SECRET: string;
  AVATAR_MAX_UPLOAD_BYTES: number;
  AVATAR_URL_TTL_SECONDS: number;
  EXPO_PUSH_ACCESS_TOKEN?: string;
};

export function validateEnvironment(
  environment: Record<string, unknown>,
): AppEnvironment {
  const nodeEnvironment = environment.NODE_ENV ?? 'development';

  if (
    typeof nodeEnvironment !== 'string' ||
    !supportedNodeEnvironments.has(nodeEnvironment)
  ) {
    throw new Error(
      'NODE_ENV must be one of development, test, or production.',
    );
  }

  const port = Number(environment.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const databaseUrl = postgresqlUrl(environment.DATABASE_URL, 'DATABASE_URL');

  const firebaseProjectId = environment.FIREBASE_PROJECT_ID;

  if (
    typeof firebaseProjectId !== 'string' ||
    firebaseProjectId.trim().length === 0
  ) {
    throw new Error('FIREBASE_PROJECT_ID is required.');
  }

  const proposalReceiptSecret = environment.PROPOSAL_RECEIPT_SECRET;

  if (
    typeof proposalReceiptSecret !== 'string' ||
    proposalReceiptSecret.length < 32
  ) {
    throw new Error('PROPOSAL_RECEIPT_SECRET must be at least 32 characters.');
  }

  const schedulerEnabled = parseBoolean(
    environment.SCHEDULER_ENABLED,
    nodeEnvironment !== 'test',
    'SCHEDULER_ENABLED',
  );
  const schedulerTickIntervalMs = Number(
    environment.SCHEDULER_TICK_INTERVAL_MS ?? 60_000,
  );
  if (
    !Number.isInteger(schedulerTickIntervalMs) ||
    schedulerTickIntervalMs < 1_000
  ) {
    throw new Error(
      'SCHEDULER_TICK_INTERVAL_MS must be an integer of at least 1000.',
    );
  }
  const rawExpoPushAccessToken = environment.EXPO_PUSH_ACCESS_TOKEN;
  const pushProviderTimeoutMs = Number(
    environment.PUSH_PROVIDER_TIMEOUT_MS ?? 30_000,
  );
  if (!Number.isInteger(pushProviderTimeoutMs) || pushProviderTimeoutMs < 100) {
    throw new Error(
      'PUSH_PROVIDER_TIMEOUT_MS must be an integer of at least 100.',
    );
  }
  const expoPushAccessToken =
    typeof rawExpoPushAccessToken === 'string' &&
    rawExpoPushAccessToken.trim().length === 0
      ? undefined
      : rawExpoPushAccessToken;
  if (
    expoPushAccessToken !== undefined &&
    (typeof expoPushAccessToken !== 'string' ||
      expoPushAccessToken.trim().length === 0)
  ) {
    throw new Error('EXPO_PUSH_ACCESS_TOKEN must be a nonblank string.');
  }

  const avatarStorageDirectory = stringValue(
    environment.AVATAR_STORAGE_DIRECTORY ?? '.data/avatars',
    'AVATAR_STORAGE_DIRECTORY',
  );
  const avatarPublicBaseUrl = stringValue(
    environment.AVATAR_PUBLIC_BASE_URL ?? `http://localhost:${port}`,
    'AVATAR_PUBLIC_BASE_URL',
  );
  try {
    const parsedAvatarBaseUrl = new URL(avatarPublicBaseUrl);
    if (!['http:', 'https:'].includes(parsedAvatarBaseUrl.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error('AVATAR_PUBLIC_BASE_URL must be an HTTP(S) URL.');
  }
  const avatarUrlSecret =
    environment.AVATAR_URL_SECRET ?? proposalReceiptSecret;
  if (typeof avatarUrlSecret !== 'string' || avatarUrlSecret.length < 32) {
    throw new Error('AVATAR_URL_SECRET must be at least 32 characters.');
  }
  const avatarMaxUploadBytes = Number(
    environment.AVATAR_MAX_UPLOAD_BYTES ?? 5_000_000,
  );
  if (
    !Number.isInteger(avatarMaxUploadBytes) ||
    avatarMaxUploadBytes < 1_024 ||
    avatarMaxUploadBytes > 10_000_000
  ) {
    throw new Error(
      'AVATAR_MAX_UPLOAD_BYTES must be an integer between 1024 and 10000000.',
    );
  }
  const avatarUrlTtlSeconds = Number(
    environment.AVATAR_URL_TTL_SECONDS ?? 3_600,
  );
  if (
    !Number.isInteger(avatarUrlTtlSeconds) ||
    avatarUrlTtlSeconds < 60 ||
    avatarUrlTtlSeconds > 604_800
  ) {
    throw new Error(
      'AVATAR_URL_TTL_SECONDS must be an integer between 60 and 604800.',
    );
  }

  return {
    ...environment,
    NODE_ENV: nodeEnvironment as NodeEnvironment,
    PORT: port,
    DATABASE_URL: databaseUrl,
    FIREBASE_PROJECT_ID: firebaseProjectId.trim(),
    PROPOSAL_RECEIPT_SECRET: proposalReceiptSecret,
    SCHEDULER_ENABLED: schedulerEnabled,
    SCHEDULER_TICK_INTERVAL_MS: schedulerTickIntervalMs,
    PUSH_PROVIDER_TIMEOUT_MS: pushProviderTimeoutMs,
    AVATAR_STORAGE_DIRECTORY: avatarStorageDirectory,
    AVATAR_PUBLIC_BASE_URL: avatarPublicBaseUrl.replace(/\/$/, ''),
    AVATAR_URL_SECRET: avatarUrlSecret,
    AVATAR_MAX_UPLOAD_BYTES: avatarMaxUploadBytes,
    AVATAR_URL_TTL_SECONDS: avatarUrlTtlSeconds,
    ...(typeof expoPushAccessToken === 'string'
      ? { EXPO_PUSH_ACCESS_TOKEN: expoPushAccessToken.trim() }
      : {}),
  };
}

function postgresqlUrl(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  const normalized = value.trim();

  try {
    const parsed = new URL(normalized);
    if (
      !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
      parsed.hostname.length === 0 ||
      parsed.pathname.length <= 1
    ) {
      throw new Error();
    }
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  return normalized;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be a nonblank string.`);
  }
  return value.trim();
}

function parseBoolean(
  value: unknown,
  defaultValue: boolean,
  name: string,
): boolean {
  if (value === undefined) return defaultValue;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}
