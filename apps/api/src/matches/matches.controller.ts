import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { createDtoValidationPipe } from '../app.setup';
import {
  ActivePlayerRequired,
  CurrentUser,
  Roles,
} from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  AddParticipantResponseDto,
  MatchDetailDto,
  MatchParticipantDto,
  PaginatedMatchesDto,
  TeamProposalDto,
  UpcomingMatchSummaryDto,
} from './match.dto';
import {
  AddParticipantRequestDto,
  AttendanceRequestDto,
  CompleteMatchRequestDto,
  EmptyRequestDto,
  MatchListQueryDto,
  StartMatchRequestDto,
} from './match.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(
    @Inject(MatchesService) private readonly matchesService: MatchesService,
  ) {}

  @Get()
  list(
    @Query(createDtoValidationPipe(MatchListQueryDto))
    query: MatchListQueryDto,
  ): Promise<PaginatedMatchesDto> {
    return this.matchesService.list(query);
  }

  @Get('upcoming')
  upcoming(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UpcomingMatchSummaryDto[]> {
    return this.matchesService.upcoming(user.player.id);
  }

  @Get(':matchId')
  detail(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MatchDetailDto> {
    return this.matchesService.detail(matchId, user.player.id);
  }

  @Post(':matchId/registration')
  @HttpCode(HttpStatus.OK)
  @ActivePlayerRequired()
  registerGoing(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body(createDtoValidationPipe(EmptyRequestDto)) _body: EmptyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ attendance: 'GOING' }> {
    return this.matchesService.registerGoing(matchId, user.player.id);
  }

  @Delete(':matchId/registration')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ActivePlayerRequired()
  async removeRegistration(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.matchesService.removeRegistration(matchId, user.player.id);
  }

  @Patch(':matchId/participants/:playerId')
  @ActivePlayerRequired()
  patchParticipant(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Body(createDtoValidationPipe(AttendanceRequestDto))
    request: AttendanceRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MatchParticipantDto> {
    return this.matchesService.patchParticipant(
      matchId,
      playerId,
      request,
      user,
    );
  }

  @Post(':matchId/participants')
  @HttpCode(HttpStatus.CREATED)
  @ActivePlayerRequired()
  addParticipant(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body(createDtoValidationPipe(AddParticipantRequestDto))
    request: AddParticipantRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AddParticipantResponseDto> {
    return this.matchesService.addParticipant(matchId, request, user);
  }

  @Post(':matchId/generate-teams')
  @HttpCode(HttpStatus.OK)
  @ActivePlayerRequired()
  generateTeams(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body(createDtoValidationPipe(EmptyRequestDto)) _body: EmptyRequestDto,
  ): Promise<TeamProposalDto> {
    return this.matchesService.generateTeamProposal(matchId);
  }

  @Post(':matchId/start')
  @HttpCode(HttpStatus.OK)
  @ActivePlayerRequired()
  start(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body(createDtoValidationPipe(StartMatchRequestDto))
    request: StartMatchRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MatchDetailDto> {
    return this.matchesService.start(matchId, request, user.player.id);
  }

  @Post(':matchId/complete')
  @ActivePlayerRequired()
  async complete(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(createDtoValidationPipe(CompleteMatchRequestDto))
    request: CompleteMatchRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MatchDetailDto> {
    const result = await this.matchesService.complete(
      matchId,
      idempotencyKey,
      request,
      user.player.id,
    );

    response.status(
      result.idempotentReplay ? HttpStatus.OK : HttpStatus.CREATED,
    );

    if (result.idempotentReplay) {
      response.setHeader('Idempotent-Replay', 'true');
    }

    return result.match;
  }

  @Post(':matchId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ActivePlayerRequired()
  cancel(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body(createDtoValidationPipe(EmptyRequestDto)) _body: EmptyRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MatchDetailDto> {
    return this.matchesService.cancel(matchId, user);
  }
}
