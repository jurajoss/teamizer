import { z } from 'zod';

const mobileEnvironmentSchema = z.object({
  apiUrl: z.url(),
  firebase: z.object({
    apiKey: z.string().min(1),
    authDomain: z.string().min(1),
    projectId: z.string().min(1),
    appId: z.string().min(1),
  }),
  easProjectId: z.string().min(1).optional(),
});

export type MobileEnvironment = z.infer<typeof mobileEnvironmentSchema>;

export function parseMobileEnvironment(input: unknown): MobileEnvironment {
  const environment = mobileEnvironmentSchema.parse(input);

  return {
    ...environment,
    apiUrl: environment.apiUrl.replace(/\/+$/, ''),
  };
}

export function loadMobileEnvironment(): MobileEnvironment {
  return parseMobileEnvironment({
    apiUrl: process.env.EXPO_PUBLIC_API_URL,
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    },
    easProjectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
  });
}
