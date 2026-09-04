import { ApiClientError } from '../api/authenticated-api-client';
import type { CurrentUser, OnboardingInput } from '../api/contracts';
import type {
  FirebaseAuthClient,
  FirebaseSessionUser,
} from '../auth/auth-client';
import type { TeamizerIdentityClient } from '../identity/teamizer-identity-client';

export type AppSessionState =
  | { status: 'RESTORING' }
  | { status: 'SIGNED_OUT' }
  | { status: 'CHECKING_IDENTITY'; firebaseUid: string }
  | { status: 'ONBOARDING_REQUIRED'; firebaseUid: string }
  | {
      status: 'AUTHENTICATED';
      firebaseUid: string;
      currentUser: CurrentUser;
    }
  | {
      status: 'ERROR';
      firebaseUid: string;
      phase: 'BOOTSTRAP' | 'ONBOARDING';
      message: string;
    };

type StateListener = (state: AppSessionState) => void;

export class SessionController {
  private state: AppSessionState = { status: 'RESTORING' };
  private readonly listeners = new Set<StateListener>();
  private unsubscribeFromAuth: (() => void) | null = null;
  private revision = 0;
  private currentFirebaseUid: string | null = null;

  constructor(
    private readonly authClient: FirebaseAuthClient,
    private readonly identityClient: TeamizerIdentityClient,
  ) {}

  get currentState(): AppSessionState {
    return this.state;
  }

  start(): void {
    if (this.unsubscribeFromAuth) {
      return;
    }

    this.unsubscribeFromAuth = this.authClient.observeAuthState((user) => {
      this.handleAuthState(user);
    });
  }

  stop(): void {
    this.revision += 1;
    this.unsubscribeFromAuth?.();
    this.unsubscribeFromAuth = null;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  signIn(email: string, password: string): Promise<void> {
    return this.authClient.signIn(email, password);
  }

  signOut(): Promise<void> {
    return this.authClient.signOut();
  }

  async refreshCurrentUser(): Promise<void> {
    if (this.state.status !== 'AUTHENTICATED') {
      throw new Error('Refreshing the profile requires an authenticated user.');
    }
    const firebaseUid = this.state.firebaseUid;
    const operationRevision = ++this.revision;
    const currentUser = await this.identityClient.getCurrentUser(firebaseUid);
    if (operationRevision !== this.revision) return;
    this.setState({ status: 'AUTHENTICATED', firebaseUid, currentUser });
  }

  async onboard(input: OnboardingInput): Promise<void> {
    const firebaseUid = this.onboardingFirebaseUid();

    if (!firebaseUid) {
      throw new Error('Onboarding requires an authenticated Firebase user.');
    }

    const operationRevision = ++this.revision;

    try {
      const currentUser = await this.identityClient.onboard(firebaseUid, input);

      if (operationRevision !== this.revision) {
        return;
      }

      this.setState({ status: 'AUTHENTICATED', firebaseUid, currentUser });
    } catch (error) {
      if (operationRevision !== this.revision) {
        return;
      }

      this.setState({
        status: 'ERROR',
        firebaseUid,
        phase: 'ONBOARDING',
        message: this.safeErrorMessage(error),
      });
      throw error;
    }
  }

  retry(): void {
    if (this.state.status !== 'ERROR') {
      return;
    }

    if (this.state.phase === 'ONBOARDING') {
      this.setState({
        status: 'ONBOARDING_REQUIRED',
        firebaseUid: this.state.firebaseUid,
      });
      return;
    }

    this.beginIdentityBootstrap({ uid: this.state.firebaseUid });
  }

  private handleAuthState(user: FirebaseSessionUser | null): void {
    this.revision += 1;

    if (!user) {
      if (this.currentFirebaseUid) {
        this.identityClient.clear(this.currentFirebaseUid);
      }

      this.currentFirebaseUid = null;
      this.setState({ status: 'SIGNED_OUT' });
      return;
    }

    if (this.currentFirebaseUid && this.currentFirebaseUid !== user.uid) {
      this.identityClient.clear(this.currentFirebaseUid);
    }

    this.currentFirebaseUid = user.uid;
    this.beginIdentityBootstrap(user);
  }

  private beginIdentityBootstrap(user: FirebaseSessionUser): void {
    const operationRevision = ++this.revision;
    this.setState({
      status: 'CHECKING_IDENTITY',
      firebaseUid: user.uid,
    });
    void this.bootstrapIdentity(user, operationRevision);
  }

  private async bootstrapIdentity(
    user: FirebaseSessionUser,
    operationRevision: number,
  ): Promise<void> {
    try {
      const currentUser = await this.identityClient.getCurrentUser(user.uid);

      if (operationRevision !== this.revision) {
        return;
      }

      this.setState({
        status: 'AUTHENTICATED',
        firebaseUid: user.uid,
        currentUser,
      });
    } catch (error) {
      if (operationRevision !== this.revision) {
        return;
      }

      if (
        error instanceof ApiClientError &&
        error.code === 'ONBOARDING_REQUIRED'
      ) {
        this.setState({
          status: 'ONBOARDING_REQUIRED',
          firebaseUid: user.uid,
        });
        return;
      }

      this.setState({
        status: 'ERROR',
        firebaseUid: user.uid,
        phase: 'BOOTSTRAP',
        message: this.safeErrorMessage(error),
      });
    }
  }

  private onboardingFirebaseUid(): string | null {
    if (this.state.status === 'ONBOARDING_REQUIRED') {
      return this.state.firebaseUid;
    }

    if (this.state.status === 'ERROR' && this.state.phase === 'ONBOARDING') {
      return this.state.firebaseUid;
    }

    return null;
  }

  private safeErrorMessage(error: unknown): string {
    if (error instanceof ApiClientError) {
      return error.message;
    }

    return 'Teamizer could not verify your application account.';
  }

  private setState(state: AppSessionState): void {
    this.state = state;

    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
