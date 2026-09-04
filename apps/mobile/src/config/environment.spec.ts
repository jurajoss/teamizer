import { describe, expect, it } from 'vitest';

import { parseMobileEnvironment } from './environment';

describe('mobile environment', () => {
  it('loads only public API and Firebase client configuration', () => {
    expect(
      parseMobileEnvironment({
        apiUrl: 'https://api.example.test/',
        firebase: {
          apiKey: 'client-api-key',
          authDomain: 'teamizer.firebaseapp.com',
          projectId: 'teamizer',
          appId: 'firebase-app-id',
        },
      }),
    ).toEqual({
      apiUrl: 'https://api.example.test',
      firebase: {
        apiKey: 'client-api-key',
        authDomain: 'teamizer.firebaseapp.com',
        projectId: 'teamizer',
        appId: 'firebase-app-id',
      },
    });
  });

  it('rejects incomplete Firebase client configuration', () => {
    expect(() =>
      parseMobileEnvironment({
        apiUrl: 'https://api.example.test',
        firebase: { projectId: 'teamizer' },
      }),
    ).toThrow();
  });

  it('accepts an optional public EAS project identifier for Expo push tokens', () => {
    expect(
      parseMobileEnvironment({
        apiUrl: 'https://api.example.test',
        firebase: {
          apiKey: 'client-api-key',
          authDomain: 'teamizer.firebaseapp.com',
          projectId: 'teamizer',
          appId: 'firebase-app-id',
        },
        easProjectId: 'eas-project-id',
      }).easProjectId,
    ).toBe('eas-project-id');
  });
});
