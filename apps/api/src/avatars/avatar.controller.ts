import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { Public } from '../auth/auth.decorators';
import { AVATAR_STORAGE, type AvatarStorage } from './avatar-storage';

@Controller('player-avatars')
export class AvatarController {
  constructor(
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  @Get(':storageKey')
  @Public()
  async read(
    @Param('storageKey') storageKey: string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    if (!expires || !signature) {
      response.sendStatus(HttpStatus.NOT_FOUND);
      return;
    }
    const avatar = await this.storage.readSigned(
      storageKey,
      expires,
      signature,
    );
    if (!avatar) {
      response.sendStatus(HttpStatus.NOT_FOUND);
      return;
    }
    const remainingSeconds = Math.max(
      0,
      Number(expires) - Math.floor(Date.now() / 1_000),
    );
    response
      .status(HttpStatus.OK)
      .set({
        'Cache-Control': `private, max-age=${remainingSeconds}`,
        'Content-Type': avatar.contentType,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(avatar.data);
  }
}
