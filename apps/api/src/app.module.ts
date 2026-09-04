import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { AvatarModule } from './avatars/avatar.module';
import { validateEnvironment } from './environment';
import { HealthModule } from './health/health.module';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { PrismaModule } from './prisma/prisma.module';
import { SchedulingModule } from './scheduling/scheduling.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PrismaModule,
    AuthModule,
    AvatarModule,
    HealthModule,
    PlayersModule,
    MatchesModule,
    SchedulingModule,
  ],
})
export class AppModule {}
