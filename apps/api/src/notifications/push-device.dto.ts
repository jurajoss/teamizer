import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DevicePlatform, PushProvider } from '@prisma/client';

export class RegisterPushDeviceRequestDto {
  @IsEnum(PushProvider)
  provider!: PushProvider;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  pushToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceLabel?: string;
}

export class NotificationPreferenceRequestDto {
  @IsBoolean()
  notificationsEnabled!: boolean;
}

export type PushDeviceDto = {
  id: string;
  provider: PushProvider;
  platform: DevicePlatform;
  isActive: boolean;
  tokenSuffix: string;
  deviceLabel: string | null;
};
