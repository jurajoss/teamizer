import { Global, Module } from '@nestjs/common';

import { AvatarController } from './avatar.controller';
import { AvatarImageService } from './avatar-image.service';
import { AvatarService } from './avatar.service';
import { AVATAR_STORAGE, LocalAvatarStorage } from './avatar-storage';

@Global()
@Module({
  controllers: [AvatarController],
  providers: [
    AvatarImageService,
    AvatarService,
    LocalAvatarStorage,
    { provide: AVATAR_STORAGE, useExisting: LocalAvatarStorage },
  ],
  exports: [AvatarService, AVATAR_STORAGE],
})
export class AvatarModule {}
