import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    clearMocks: true,
    environment: 'node',
    env: {
      DATABASE_URL:
        'postgresql://teamizer:teamizer@localhost:5433/teamizer_test?schema=public',
      FIREBASE_PROJECT_ID: 'teamizer-test',
      PROPOSAL_RECEIPT_SECRET: 'test-proposal-receipt-secret-32-characters',
      SCHEDULER_ENABLED: 'false',
      AVATAR_MAX_UPLOAD_BYTES: '2048',
    },
    fileParallelism: false,
    include: ['test/**/*.spec.ts'],
  },
});
