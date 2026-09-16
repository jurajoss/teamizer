import {
  applicationDefault,
  getApps,
  initializeApp,
  type App,
} from 'firebase-admin/app';

const FIREBASE_APP_NAME = 'teamizer-api';

export function getTeamizerFirebaseApp(projectId: string): App {
  const existingApp = getApps().find(({ name }) => name === FIREBASE_APP_NAME);
  return (
    existingApp ??
    initializeApp(
      { credential: applicationDefault(), projectId },
      FIREBASE_APP_NAME,
    )
  );
}
