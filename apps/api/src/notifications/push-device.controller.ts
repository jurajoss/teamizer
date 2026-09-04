import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';

import { createDtoValidationPipe } from '../app.setup';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  NotificationPreferenceRequestDto,
  type PushDeviceDto,
  RegisterPushDeviceRequestDto,
} from './push-device.dto';
import { PushDeviceService } from './push-device.service';

@Controller('me')
export class PushDeviceController {
  constructor(
    @Inject(PushDeviceService) private readonly devices: PushDeviceService,
  ) {}

  @Put('push-devices')
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body(createDtoValidationPipe(RegisterPushDeviceRequestDto))
    request: RegisterPushDeviceRequestDto,
  ): Promise<PushDeviceDto> {
    return this.devices.register(user.id, request);
  }

  @Delete('push-devices/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  invalidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('deviceId', new ParseUUIDPipe()) deviceId: string,
  ): Promise<void> {
    return this.devices.invalidate(user.id, deviceId);
  }

  @Patch('notification-preferences')
  preference(
    @CurrentUser() user: AuthenticatedUser,
    @Body(createDtoValidationPipe(NotificationPreferenceRequestDto))
    request: NotificationPreferenceRequestDto,
  ): Promise<{ notificationsEnabled: boolean }> {
    return this.devices.updatePreference(user.id, request);
  }
}
