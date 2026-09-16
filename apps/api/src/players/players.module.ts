import { Module } from '@nestjs/common';

import { invitationEmailSenderProvider } from '../invitations/invitation-email.provider';
import { PlayerInvitationService } from '../invitations/player-invitation.service';

import { MeController } from './me.controller';
import { OnboardingController } from './onboarding.controller';
import { PlayerIdentityService } from './player-identity.service';
import { PlayerProfileService } from './player-profile.service';
import { PlayerStatisticsService } from './player-statistics.service';
import { PlayersController } from './players.controller';
import { RankingsController } from './rankings.controller';

@Module({
  controllers: [
    MeController,
    OnboardingController,
    PlayersController,
    RankingsController,
  ],
  providers: [
    invitationEmailSenderProvider,
    PlayerIdentityService,
    PlayerInvitationService,
    PlayerProfileService,
    PlayerStatisticsService,
  ],
})
export class PlayersModule {}
