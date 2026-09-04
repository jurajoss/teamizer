import { Controller, Get, Inject, Query } from '@nestjs/common';

import { createDtoValidationPipe } from '../app.setup';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { RankingsPageDto } from './player.dto';
import { RankingsQueryDto } from './player.dto';
import { PlayerStatisticsService } from './player-statistics.service';

@Controller('rankings')
export class RankingsController {
  constructor(
    @Inject(PlayerStatisticsService)
    private readonly playerStatistics: PlayerStatisticsService,
  ) {}

  @Get()
  list(
    @Query(createDtoValidationPipe(RankingsQueryDto)) query: RankingsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RankingsPageDto> {
    return this.playerStatistics.rankings(query, user);
  }
}
