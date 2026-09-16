import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PlayerInvitationActivationService } from '../invitations/player-invitation-activation.service';

import { ActivePlayerGuard } from './active-player.guard';
import { AuthenticationGuard } from './authentication.guard';
import { FirebaseIdentityLookup } from './firebase-identity-lookup.service';
import { firebaseAdminAuthProvider } from './firebase-admin-auth.provider';
import { FirebaseTokenVerifier } from './firebase-token-verifier.service';
import { RolesGuard } from './roles.guard';

@Global()
@Module({
  providers: [
    FirebaseIdentityLookup,
    firebaseAdminAuthProvider,
    FirebaseTokenVerifier,
    PlayerInvitationActivationService,
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ActivePlayerGuard },
  ],
  exports: [FirebaseIdentityLookup, FirebaseTokenVerifier],
})
export class AuthModule {}
