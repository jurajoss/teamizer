import { readFile } from 'node:fs/promises';

import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DevelopmentInvitationEmailSender } from '../src/invitations/development-invitation-email.sender';
import { FirebaseInvitationEmailSender } from '../src/invitations/firebase-invitation-email.sender';
import type { InvitationEmailDeliveryError } from '../src/invitations/invitation-email.sender';
import { ResendInvitationEmailSender } from '../src/invitations/resend-invitation-email.sender';

const invitation = {
  recipientEmail: 'player@example.com',
  playerName: 'Player <One>',
  passwordSetupUrl: 'https://firebase.example.test/setup?oobCode=secret',
  idempotencyKey: '85da37cb-bd7b-4da3-892c-52c561ad2b51',
};

describe('invitation email senders', () => {
  it('asks Firebase Authentication to send a hosted-web password-reset email using ADC', async () => {
    const credential = {
      getAccessToken: vi.fn().mockResolvedValue({
        access_token: 'firebase-access-token',
        expires_in: 3_600,
      }),
    };
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    const sender = new FirebaseInvitationEmailSender(
      {
        credential,
        projectId: 'teamizer-eb26f',
        timeoutMs: 5_000,
      },
      fetchImplementation,
    );

    await sender.send({
      recipientEmail: invitation.recipientEmail,
      playerName: invitation.playerName,
      idempotencyKey: invitation.idempotencyKey,
    });

    expect(sender.requiresGeneratedPasswordSetupLink).toBe(false);
    expect(credential.getAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://identitytoolkit.googleapis.com/v1/projects/teamizer-eb26f/accounts:sendOobCode',
    );
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer firebase-access-token',
        'Content-Type': 'application/json',
      },
    });
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      requestType: 'PASSWORD_RESET',
      email: invitation.recipientEmail,
      canHandleCodeInApp: false,
      returnOobLink: false,
    });
    expect(String(request?.body)).not.toContain('oobCode');
    expect(String(request?.body)).not.toContain('passwordSetupUrl');
    expect(String(request?.body)).not.toContain(invitation.idempotencyKey);
  });

  it('submits a bilingual Resend email with an idempotency key', async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    const sender = new ResendInvitationEmailSender(
      {
        apiKey: 'resend-secret',
        from: 'Teamizer <invite@example.com>',
        replyTo: 'support@example.com',
        timeoutMs: 5_000,
      },
      fetchImplementation,
    );

    await sender.send(invitation);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(request).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer resend-secret',
        'Content-Type': 'application/json',
        'Idempotency-Key': invitation.idempotencyKey,
      },
    });
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: 'Teamizer <invite@example.com>',
      to: ['player@example.com'],
      reply_to: 'support@example.com',
    });
    expect(String(body.text)).toContain('Nastav si vlastní heslo');
    expect(String(body.text)).toContain('Choose your own password');
    expect(String(body.html)).toContain('Player &lt;One&gt;');
    expect(String(body.html)).toContain('oobCode=secret');
  });

  it('returns stable delivery errors for provider and transport failures', async () => {
    const rejected = new ResendInvitationEmailSender(
      {
        apiKey: 'secret',
        from: 'invite@example.com',
        timeoutMs: 5_000,
      },
      vi.fn().mockResolvedValue(new Response(null, { status: 429 })),
    );
    const unavailable = new ResendInvitationEmailSender(
      {
        apiKey: 'secret',
        from: 'invite@example.com',
        timeoutMs: 5_000,
      },
      vi.fn().mockRejectedValue(new Error('private transport detail')),
    );

    await expect(rejected.send(invitation)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
    } satisfies Partial<InvitationEmailDeliveryError>);
    await expect(unavailable.send(invitation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    } satisfies Partial<InvitationEmailDeliveryError>);
  });

  it('maps Firebase credential, transport, and provider failures without logging sensitive data', async () => {
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const credentialFailure = new FirebaseInvitationEmailSender(
      {
        credential: {
          getAccessToken: vi
            .fn()
            .mockRejectedValue(new Error('credential-json')),
        },
        projectId: 'teamizer-eb26f',
        timeoutMs: 5_000,
      },
      vi.fn(),
    );
    const transportFailure = new FirebaseInvitationEmailSender(
      {
        credential: {
          getAccessToken: vi.fn().mockResolvedValue({
            access_token: 'firebase-access-token',
            expires_in: 3_600,
          }),
        },
        projectId: 'teamizer-eb26f',
        timeoutMs: 5_000,
      },
      vi.fn().mockRejectedValue(new Error('transport-bearer-token')),
    );
    const providerFailure = new FirebaseInvitationEmailSender(
      {
        credential: {
          getAccessToken: vi.fn().mockResolvedValue({
            access_token: 'firebase-access-token',
            expires_in: 3_600,
          }),
        },
        projectId: 'teamizer-eb26f',
        timeoutMs: 5_000,
      },
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              status: 'PERMISSION_DENIED',
              message:
                'player@example.com oobCode=private access-token=private',
            },
          },
          { status: 403 },
        ),
      ),
    );

    await expect(credentialFailure.send(invitation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    } satisfies Partial<InvitationEmailDeliveryError>);
    await expect(transportFailure.send(invitation)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    } satisfies Partial<InvitationEmailDeliveryError>);
    await expect(providerFailure.send(invitation)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED',
    } satisfies Partial<InvitationEmailDeliveryError>);

    const loggedValues = errorLog.mock.calls.flat().map(String).join('\n');
    expect(loggedValues).toContain('PERMISSION_DENIED');
    expect(loggedValues).toContain('HTTP status: 403');
    expect(loggedValues).not.toContain(invitation.recipientEmail);
    expect(loggedValues).not.toContain(invitation.passwordSetupUrl);
    expect(loggedValues).not.toContain('firebase-access-token');
    expect(loggedValues).not.toContain('credential-json');
    expect(loggedValues).not.toContain('transport-bearer-token');
    expect(loggedValues).not.toContain('oobCode');
    errorLog.mockRestore();
  });

  it('keeps Firebase delivery code independent of Dynamic Links and email-link sign-in', async () => {
    const source = await readFile(
      'src/invitations/firebase-invitation-email.sender.ts',
      'utf8',
    );
    const apiPackage = await readFile('package.json', 'utf8');
    const mobilePackage = await readFile('../mobile/package.json', 'utf8');
    const mobileConfig = await readFile('../mobile/app.json', 'utf8');

    expect(source).not.toMatch(/dynamicLinkDomain/i);
    expect(source).not.toMatch(/\.page\.link/i);
    expect(source).not.toMatch(/firebasedynamiclinks\.googleapis\.com/i);
    expect(source).not.toMatch(/signInWithEmailLink/i);
    expect(apiPackage).not.toMatch(/dynamic-links/i);
    expect(mobilePackage).not.toMatch(/dynamic-links/i);
    expect(mobileConfig).not.toMatch(/dynamicLinkDomain|\.page\.link/i);
  });

  it('keeps recipient and action-link data out of development logs', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const sender = new DevelopmentInvitationEmailSender();

    await sender.send(invitation);

    const loggedValue = String(log.mock.calls[0]?.[0]);
    expect(loggedValue).toContain('no email was transmitted');
    expect(loggedValue).not.toContain(invitation.recipientEmail);
    expect(loggedValue).not.toContain(invitation.passwordSetupUrl);
    log.mockRestore();
  });
});
