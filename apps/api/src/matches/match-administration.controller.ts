import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { createDtoValidationPipe } from '../app.setup';
import { ActivePlayerRequired, Roles } from '../auth/auth.decorators';
import { CreateManualMatchRequestDto } from './match-administration.dto';
import { MatchAdministrationService } from './match-administration.service';
import type { MatchSummaryDto, SportSummaryDto } from './match.dto';

@Controller('admin')
@Roles(UserRole.ADMIN)
@ActivePlayerRequired()
export class MatchAdministrationController {
  constructor(
    @Inject(MatchAdministrationService)
    private readonly administration: MatchAdministrationService,
  ) {}

  @Get('sports')
  listSports(): Promise<SportSummaryDto[]> {
    return this.administration.listSupportedSports();
  }

  @Post('matches')
  @HttpCode(HttpStatus.CREATED)
  createManualMatch(
    @Body(createDtoValidationPipe(CreateManualMatchRequestDto))
    request: CreateManualMatchRequestDto,
  ): Promise<MatchSummaryDto> {
    return this.administration.createManualMatch(request);
  }
}
