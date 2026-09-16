import { Logger } from '@nestjs/common';
import type { Credential } from 'firebase-admin/app';

import {
  InvitationEmailDeliveryError,
  InvitationEmailSender,
  type InvitationEmail,
} from './invitation-email.sender';

const IDENTITY_TOOLKIT_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1';

export type FirebaseInvitationEmailOptions = {
  credential: Credential;
  projectId: string;
  timeoutMs: number;
};

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class FirebaseInvitationEmailSender extends InvitationEmailSender {
  readonly requiresGeneratedPasswordSetupLink = false;

  private readonly logger = new Logger(FirebaseInvitationEmailSender.name);

  constructor(
    private readonly options: FirebaseInvitationEmailOptions,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    super();
  }

  async send(invitation: InvitationEmail): Promise<void> {
    const accessToken = await this.getAccessToken();
    let response: Response;

    try {
      response = await this.fetchImplementation(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: invitation.recipientEmail,
          canHandleCodeInApp: false,
          returnOobLink: false,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      this.logFailure('transport', null, null);
      throw new InvitationEmailDeliveryError('PROVIDER_UNAVAILABLE');
    }

    if (!response.ok) {
      const providerStatus = await safeProviderStatus(response);
      this.logFailure('provider', response.status, providerStatus);
      throw new InvitationEmailDeliveryError('PROVIDER_REJECTED');
    }
  }

  private async getAccessToken(): Promise<string> {
    try {
      const token = await this.options.credential.getAccessToken();
      if (!token.access_token.trim()) throw new Error('Empty access token');
      return token.access_token;
    } catch {
      this.logFailure('credential', null, null);
      throw new InvitationEmailDeliveryError('PROVIDER_UNAVAILABLE');
    }
  }

  private endpoint(): string {
    return `${IDENTITY_TOOLKIT_ENDPOINT}/projects/${encodeURIComponent(this.options.projectId)}/accounts:sendOobCode`;
  }

  private logFailure(
    stage: 'credential' | 'provider' | 'transport',
    httpStatus: number | null,
    providerStatus: string | null,
  ): void {
    this.logger.error(
      `Firebase invitation email failed (stage: ${stage}; HTTP status: ${httpStatus ?? 'unavailable'}; provider status: ${providerStatus ?? 'unavailable'}).`,
    );
  }
}

async function safeProviderStatus(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') return null;
    const error = (body as { error?: unknown }).error;
    if (!error || typeof error !== 'object') return null;
    const status = (error as { status?: unknown }).status;
    return typeof status === 'string' && /^[A-Z0-9_]{1,64}$/.test(status)
      ? status
      : null;
  } catch {
    return null;
  }
}
