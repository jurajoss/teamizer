import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../auth/auth.decorators';
import { HealthService, type HealthResponse } from './health.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @Public()
  getHealth(): Promise<HealthResponse> {
    return this.health.readiness();
  }
}
