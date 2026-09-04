import { Controller, Get, Inject } from '@nestjs/common';

import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import { AvatarService } from '../avatars/avatar.service';
import type { CurrentUserResponseDto } from './player.dto';
import { mapCurrentUser } from './player.mapper';

@Controller('me')
export class MeController {
  constructor(@Inject(AvatarService) private readonly avatars: AvatarService) {}

  @Get()
  getCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
  ): CurrentUserResponseDto {
    return mapCurrentUser(user, (key) => this.avatars.urlFor(key));
  }
}
