import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export type HealthResponse = {
  status: 'ok';
};

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async readiness(): Promise<HealthResponse> {
    try {
      await this.prisma.verifyConnection();
    } catch {
      throw new ServiceUnavailableException('The Teamizer API is not ready.');
    }

    return { status: 'ok' };
  }
}
