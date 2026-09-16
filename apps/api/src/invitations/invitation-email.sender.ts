export type InvitationEmail = {
  recipientEmail: string;
  playerName: string;
  passwordSetupUrl?: string;
  idempotencyKey: string;
};

export abstract class InvitationEmailSender {
  abstract readonly requiresGeneratedPasswordSetupLink: boolean;

  abstract send(invitation: InvitationEmail): Promise<void>;
}

export class InvitationEmailDeliveryError extends Error {
  constructor(readonly code: 'PROVIDER_REJECTED' | 'PROVIDER_UNAVAILABLE') {
    super('The invitation email provider did not accept the message.');
    this.name = 'InvitationEmailDeliveryError';
  }
}
