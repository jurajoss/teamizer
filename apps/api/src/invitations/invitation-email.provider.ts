import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { getTeamizerFirebaseApp } from '../auth/firebase-app';
import { DevelopmentInvitationEmailSender } from './development-invitation-email.sender';
import { FirebaseInvitationEmailSender } from './firebase-invitation-email.sender';
import { InvitationEmailSender } from './invitation-email.sender';
import { ResendInvitationEmailSender } from './resend-invitation-email.sender';

export const invitationEmailSenderProvider: Provider = {
  provide: InvitationEmailSender,
  inject: [ConfigService],
  useFactory: (config: ConfigService): InvitationEmailSender => {
    const driver = config.getOrThrow<'development' | 'firebase' | 'resend'>(
      'INVITATION_EMAIL_DRIVER',
    );
    if (driver === 'development') {
      return new DevelopmentInvitationEmailSender();
    }
    if (driver === 'firebase') {
      const projectId = config.getOrThrow<string>('FIREBASE_PROJECT_ID');
      const credential = getTeamizerFirebaseApp(projectId).options.credential;
      if (!credential) {
        throw new Error(
          'Firebase Application Default Credentials are unavailable.',
        );
      }
      return new FirebaseInvitationEmailSender({
        credential,
        projectId,
        timeoutMs: config.getOrThrow<number>('INVITATION_EMAIL_TIMEOUT_MS'),
      });
    }

    const replyTo = config.get<string>('INVITATION_EMAIL_REPLY_TO');
    return new ResendInvitationEmailSender({
      apiKey: config.getOrThrow<string>('RESEND_API_KEY'),
      from: config.getOrThrow<string>('INVITATION_EMAIL_FROM'),
      ...(replyTo ? { replyTo } : {}),
      timeoutMs: config.getOrThrow<number>('INVITATION_EMAIL_TIMEOUT_MS'),
    });
  },
};
