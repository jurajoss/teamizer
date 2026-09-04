import { Body, Controller, Get, Inject, Post, Put } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { createDtoValidationPipe } from '../app.setup';
import { ActivePlayerRequired, Roles } from '../auth/auth.decorators';
import type { MatchSummaryDto } from '../matches/match.dto';
import type { ScheduleDto } from './schedule.dto';
import { UpdateScheduleRequestDto } from './schedule.dto';
import { ScheduleService } from './schedule.service';

@Controller('admin/schedule')
@Roles(UserRole.ADMIN)
@ActivePlayerRequired()
export class ScheduleController {
  constructor(
    @Inject(ScheduleService) private readonly schedules: ScheduleService,
  ) {}

  @Get()
  get(): Promise<ScheduleDto> {
    return this.schedules.getConfiguredSchedule();
  }

  @Put()
  update(
    @Body(createDtoValidationPipe(UpdateScheduleRequestDto))
    request: UpdateScheduleRequestDto,
  ): Promise<ScheduleDto> {
    return this.schedules.updateConfiguredSchedule(request);
  }

  @Post('generate-matches')
  generate(): Promise<{ match: MatchSummaryDto; created: boolean }> {
    return this.schedules.materializeConfigured();
  }
}
