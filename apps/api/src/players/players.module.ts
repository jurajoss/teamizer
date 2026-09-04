import { Module } from '@nestjs/common';

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
    PlayerIdentityService,
    PlayerProfileService,
    PlayerStatisticsService,
  ],
})
export class PlayersModule {}
