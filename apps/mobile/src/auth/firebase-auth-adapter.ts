import type { Auth } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';

import type { FirebaseAuthClient } from './auth-client';
import { FirebaseSessionRequiredError } from './auth-client';

export function createFirebaseAuthAdapter(auth: Auth): FirebaseAuthClient {
  return {
    observeAuthState(listener) {
      return onAuthStateChanged(auth, (user) => {
        listener(user ? { uid: user.uid } : null);
      });
    },

    async signIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },

    async signOut() {
      await firebaseSignOut(auth);
    },

    async getIdToken() {
      const user = auth.currentUser;

      if (!user) {
        throw new FirebaseSessionRequiredError();
      }

      return user.getIdToken();
    },
  };
}
