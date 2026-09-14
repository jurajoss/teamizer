import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AvatarController } from './avatar.controller';
import { AvatarImageService } from './avatar-image.service';
import { AvatarService } from './avatar.service';
import {
  AVATAR_STORAGE,
  type AvatarStorage,
  LocalAvatarStorage,
} from './avatar-storage';
import { GcsAvatarStorage } from './gcs-avatar-storage';

export function createAvatarStorage(config: ConfigService): AvatarStorage {
  const driver = config.getOrThrow<'local' | 'gcs'>('AVATAR_STORAGE_DRIVER');
  return driver === 'gcs'
    ? new GcsAvatarStorage(config)
    : new LocalAvatarStorage(config);
}

@Global()
@Module({
  controllers: [AvatarController],
  providers: [
    AvatarImageService,
    AvatarService,
    {
      provide: AVATAR_STORAGE,
      inject: [ConfigService],
      useFactory: createAvatarStorage,
    },
  ],
  exports: [AvatarService, AVATAR_STORAGE],
})
export class AvatarModule {}
