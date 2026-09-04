import { Inject, Injectable } from '@nestjs/common';

import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  NotificationPreferenceRequestDto,
  PushDeviceDto,
  RegisterPushDeviceRequestDto,
} from './push-device.dto';

@Injectable()
export class PushDeviceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    request: RegisterPushDeviceRequestDto,
    now = new Date(),
  ): Promise<PushDeviceDto> {
    const pushToken = request.pushToken.trim();
    if (!pushToken) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Push token is required.');
    }
    const device = await this.prisma.pushDevice.upsert({
      where: {
        provider_pushToken: { provider: request.provider, pushToken },
      },
      create: {
        userId,
        provider: request.provider,
        platform: request.platform,
        pushToken,
        deviceLabel: request.deviceLabel?.trim() || null,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: request.platform,
        deviceLabel: request.deviceLabel?.trim() || null,
        isActive: true,
        invalidatedAt: null,
        lastSeenAt: now,
      },
    });
    return this.map(device);
  }

  async invalidate(userId: string, deviceId: string): Promise<void> {
    const result = await this.prisma.pushDevice.updateMany({
      where: { id: deviceId, userId },
      data: { isActive: false, invalidatedAt: new Date() },
    });
    if (result.count === 0) {
      throw new ApiError(
        404,
        'RESOURCE_NOT_FOUND',
        'The push device does not exist.',
      );
    }
  }

  async updatePreference(
    userId: string,
    request: NotificationPreferenceRequestDto,
  ): Promise<{ notificationsEnabled: boolean }> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { notificationsEnabled: request.notificationsEnabled },
      select: { notificationsEnabled: true },
    });
    return user;
  }

  private map(device: {
    id: string;
    provider: PushDeviceDto['provider'];
    platform: PushDeviceDto['platform'];
    isActive: boolean;
    pushToken: string;
    deviceLabel: string | null;
  }): PushDeviceDto {
    return {
      id: device.id,
      provider: device.provider,
      platform: device.platform,
      isActive: device.isActive,
      tokenSuffix: device.pushToken.slice(-6),
      deviceLabel: device.deviceLabel,
    };
  }
}
