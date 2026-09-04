import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';

import { ApiError } from '../common/errors/api-error';

export const AVATAR_OUTPUT_SIZE = 512;
export const AVATAR_MULTER_HARD_LIMIT_BYTES = 10_000_000;

const SUPPORTED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);

@Injectable()
export class AvatarImageService {
  private readonly maximumUploadBytes: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.maximumUploadBytes = config.getOrThrow<number>(
      'AVATAR_MAX_UPLOAD_BYTES',
    );
  }

  async normalize(file: Express.Multer.File | undefined): Promise<Buffer> {
    if (!file) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'An avatar image file is required.',
      );
    }
    if (file.buffer.length > this.maximumUploadBytes) {
      throw new ApiError(
        413,
        'AVATAR_TOO_LARGE',
        `Avatar images must not exceed ${this.maximumUploadBytes} bytes.`,
      );
    }

    const source = sharp(file.buffer, {
      animated: false,
      failOn: 'error',
      limitInputPixels: 40_000_000,
    });
    let decodedFormat: string | undefined;
    try {
      decodedFormat = (await source.metadata()).format;
    } catch {
      throw this.invalidImage();
    }
    if (!decodedFormat || !SUPPORTED_IMAGE_FORMATS.has(decodedFormat)) {
      throw new ApiError(
        400,
        'UNSUPPORTED_AVATAR_MEDIA_TYPE',
        'Use a JPEG, PNG, WebP, HEIC, or HEIF image.',
      );
    }

    try {
      return await source
        .rotate()
        .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw this.invalidImage();
    }
  }

  private invalidImage(): ApiError {
    return new ApiError(
      400,
      'INVALID_AVATAR_IMAGE',
      'The uploaded file is not a readable supported image.',
    );
  }
}
