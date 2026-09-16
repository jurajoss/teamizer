import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { memoryStorage } from 'multer';

import { createDtoValidationPipe } from '../app.setup';
import {
  ActivePlayerRequired,
  CurrentUser,
  Roles,
} from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AVATAR_MULTER_HARD_LIMIT_BYTES } from '../avatars/avatar-image.service';
import { AvatarService } from '../avatars/avatar.service';
import type {
  AdminPlayerDetailDto,
  ConvertedGuestResponseDto,
  PlayerDetailDto,
  PlayerMatchHistoryPageDto,
  PlayersPageDto,
  PlayerStatisticsDto,
  PlayerInvitationResponseDto,
} from './player.dto';
import {
  ConvertGuestRequestDto,
  InviteGuestRequestDto,
  PaginationQueryDto,
  PlayerListQueryDto,
  UpdatePlayerRequestDto,
} from './player.dto';
import { PlayerIdentityService } from './player-identity.service';
import { PlayerInvitationService } from '../invitations/player-invitation.service';
import { mapAdminPlayer, mapUser } from './player.mapper';
import { PlayerProfileService } from './player-profile.service';
import { PlayerStatisticsService } from './player-statistics.service';

@Controller('players')
export class PlayersController {
  constructor(
    @Inject(PlayerIdentityService)
    private readonly playerIdentityService: PlayerIdentityService,
    @Inject(PlayerStatisticsService)
    private readonly playerStatistics: PlayerStatisticsService,
    @Inject(PlayerProfileService)
    private readonly playerProfiles: PlayerProfileService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
    @Inject(PlayerInvitationService)
    private readonly playerInvitations: PlayerInvitationService,
  ) {}

  @Get()
  list(
    @Query(createDtoValidationPipe(PlayerListQueryDto))
    query: PlayerListQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlayersPageDto> {
    return this.playerProfiles.list(query, user);
  }

  @Get(':playerId/statistics')
  statistics(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
  ): Promise<PlayerStatisticsDto> {
    return this.playerStatistics.statistics(playerId);
  }

  @Get(':playerId/matches')
  history(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Query(createDtoValidationPipe(PaginationQueryDto))
    query: PaginationQueryDto,
  ): Promise<PlayerMatchHistoryPageDto> {
    return this.playerStatistics.history(playerId, query);
  }

  @Get(':playerId')
  detail(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlayerDetailDto | AdminPlayerDetailDto> {
    return this.playerStatistics.detail(playerId, user);
  }

  @Patch(':playerId')
  async update(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Body(createDtoValidationPipe(UpdatePlayerRequestDto))
    request: UpdatePlayerRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlayerDetailDto | AdminPlayerDetailDto> {
    await this.playerProfiles.update(playerId, request, user);
    return this.playerStatistics.detail(playerId, user);
  }

  @Post(':playerId/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MULTER_HARD_LIMIT_BYTES, files: 1 },
    }),
  )
  async uploadAvatar(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PlayerDetailDto | AdminPlayerDetailDto> {
    await this.avatars.replace(playerId, user, file);
    return this.playerStatistics.detail(playerId, user);
  }

  @Delete(':playerId/avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.avatars.remove(playerId, user);
  }

  @Post(':playerId/convert-to-user')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ActivePlayerRequired()
  async convertGuest(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Body(createDtoValidationPipe(ConvertGuestRequestDto))
    request: ConvertGuestRequestDto,
  ): Promise<ConvertedGuestResponseDto> {
    const user = await this.playerIdentityService.convertGuest(
      playerId,
      request,
    );

    return {
      user: mapUser(user),
      player: mapAdminPlayer(user.player, (key) => this.avatars.urlFor(key)),
    };
  }

  @Post(':playerId/invite')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN)
  @ActivePlayerRequired()
  inviteGuest(
    @Param('playerId', new ParseUUIDPipe()) playerId: string,
    @Body(createDtoValidationPipe(InviteGuestRequestDto))
    request: InviteGuestRequestDto,
  ): Promise<PlayerInvitationResponseDto> {
    return this.playerInvitations.invite(playerId, request.email);
  }
}
