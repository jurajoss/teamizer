import {
  InvitationEmailDeliveryError,
  InvitationEmailSender,
  type InvitationEmail,
} from './invitation-email.sender';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

export type ResendInvitationEmailOptions = {
  apiKey: string;
  from: string;
  replyTo?: string;
  timeoutMs: number;
};

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type InvitationEmailWithSetupUrl = InvitationEmail & {
  passwordSetupUrl: string;
};

export class ResendInvitationEmailSender extends InvitationEmailSender {
  readonly requiresGeneratedPasswordSetupLink = true;

  constructor(
    private readonly options: ResendInvitationEmailOptions,
    private readonly fetchImplementation: FetchImplementation = fetch,
  ) {
    super();
  }

  async send(invitation: InvitationEmail): Promise<void> {
    if (!invitation.passwordSetupUrl) {
      throw new InvitationEmailDeliveryError('PROVIDER_REJECTED');
    }
    const invitationWithSetupUrl: InvitationEmailWithSetupUrl = {
      ...invitation,
      passwordSetupUrl: invitation.passwordSetupUrl,
    };

    let response: Response;

    try {
      response = await this.fetchImplementation(RESEND_EMAILS_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': invitation.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [invitation.recipientEmail],
          ...(this.options.replyTo ? { reply_to: this.options.replyTo } : {}),
          subject: 'Teamizer — pozvánka k účtu / account invitation',
          text: invitationText(invitationWithSetupUrl),
          html: invitationHtml(invitationWithSetupUrl),
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch {
      throw new InvitationEmailDeliveryError('PROVIDER_UNAVAILABLE');
    }

    if (!response.ok) {
      throw new InvitationEmailDeliveryError('PROVIDER_REJECTED');
    }
  }
}

function invitationText(invitation: InvitationEmailWithSetupUrl): string {
  return [
    'Teamizer',
    '',
    `Ahoj ${invitation.playerName},`,
    'správce tě pozval k aktivaci účtu Teamizer. Nastav si vlastní heslo pomocí bezpečného odkazu:',
    invitation.passwordSetupUrl,
    'Odkaz spravuje Firebase Authentication a z bezpečnostních důvodů vyprší. Pokud už nefunguje, požádej správce o nové zaslání.',
    'Potom otevři Teamizer a přihlas se touto e-mailovou adresou a novým heslem.',
    '',
    `Hello ${invitation.playerName},`,
    'an administrator invited you to activate your Teamizer account. Choose your own password using this secure link:',
    invitation.passwordSetupUrl,
    'Firebase Authentication manages the link and it expires for security. If it no longer works, ask an administrator to resend the invitation.',
    'Then open Teamizer and sign in with this email address and your new password.',
    '',
    'If you did not expect this invitation, you can ignore this email.',
  ].join('\n');
}

function invitationHtml(invitation: InvitationEmailWithSetupUrl): string {
  const playerName = escapeHtml(invitation.playerName);
  const setupUrl = escapeHtml(invitation.passwordSetupUrl);

  return `<!doctype html>
<html lang="cs">
  <body style="background:#f5f7fa;color:#17202a;font-family:Arial,sans-serif;margin:0;padding:24px">
    <main style="background:#ffffff;border-radius:12px;margin:0 auto;max-width:560px;padding:32px">
      <h1 style="margin-top:0">Teamizer</h1>
      <p>Ahoj ${playerName}, správce tě pozval k aktivaci účtu Teamizer.</p>
      <p><a href="${setupUrl}" style="background:#1769aa;border-radius:8px;color:#ffffff;display:inline-block;padding:12px 18px;text-decoration:none">Nastavit heslo</a></p>
      <p>Odkaz spravuje Firebase Authentication a z bezpečnostních důvodů vyprší. Pokud už nefunguje, požádej správce o nové zaslání. Potom otevři Teamizer a přihlas se touto e-mailovou adresou a novým heslem.</p>
      <hr style="border:0;border-top:1px solid #d8dee6;margin:28px 0" />
      <p>Hello ${playerName}, an administrator invited you to activate your Teamizer account.</p>
      <p><a href="${setupUrl}" style="background:#1769aa;border-radius:8px;color:#ffffff;display:inline-block;padding:12px 18px;text-decoration:none">Choose password</a></p>
      <p>Firebase Authentication manages the link and it expires for security. If it no longer works, ask an administrator to resend the invitation. Then open Teamizer and sign in with this email address and your new password.</p>
      <p style="color:#667085;font-size:13px">If you did not expect this invitation, you can ignore this email.</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return replacements[character] ?? character;
  });
}
