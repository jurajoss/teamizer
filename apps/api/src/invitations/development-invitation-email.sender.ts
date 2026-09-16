import { Logger } from '@nestjs/common';

import {
  InvitationEmailSender,
  type InvitationEmail,
} from './invitation-email.sender';

export class DevelopmentInvitationEmailSender extends InvitationEmailSender {
  readonly requiresGeneratedPasswordSetupLink = false;

  private readonly logger = new Logger(DevelopmentInvitationEmailSender.name);

  async send(_invitation: InvitationEmail): Promise<void> {
    this.logger.log(
      'Invitation email accepted by the safe development sender; no email was transmitted.',
    );
  }
}
