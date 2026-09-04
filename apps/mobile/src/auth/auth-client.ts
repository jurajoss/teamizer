export type FirebaseSessionUser = {
  uid: string;
};

export type AuthStateListener = (user: FirebaseSessionUser | null) => void;

export interface FirebaseAuthClient {
  observeAuthState(listener: AuthStateListener): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getIdToken(): Promise<string>;
}

export class FirebaseSessionRequiredError extends Error {
  constructor() {
    super('A Firebase session is required for this request.');
    this.name = 'FirebaseSessionRequiredError';
  }
}
