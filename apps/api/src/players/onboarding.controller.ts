import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';

import { createDtoValidationPipe } from '../app.setup';
import {
  AllowUnonboarded,
  CurrentFirebaseIdentity,
} from '../auth/auth.decorators';
import type { VerifiedFirebaseIdentity } from '../auth/auth.types';
import { AvatarService } from '../avatars/avatar.service';
import { mapCurrentUser } from './player.mapper';
import {
  OnboardingRequestDto,
  type CurrentUserResponseDto,
} from './player.dto';
import { PlayerIdentityService } from './player-identity.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(
    @Inject(PlayerIdentityService)
    private readonly playerIdentityService: PlayerIdentityService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AllowUnonboarded()
  async onboard(
    @CurrentFirebaseIdentity() identity: VerifiedFirebaseIdentity,
    @Body(createDtoValidationPipe(OnboardingRequestDto))
    request: OnboardingRequestDto,
  ): Promise<CurrentUserResponseDto> {
    const user = await this.playerIdentityService.onboard(
      identity.authProviderId,
      request,
    );

    return mapCurrentUser(user, (key) => this.avatars.urlFor(key));
  }
}
