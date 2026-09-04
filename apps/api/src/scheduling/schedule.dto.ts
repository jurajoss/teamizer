import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Weekday } from '@prisma/client';

export class UpdateScheduleRequestDto {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  localStartTime!: string;

  @IsString()
  @MaxLength(64)
  timeZone!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  generationHorizonDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  registrationReminderMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalReminderMinutes!: number;
}

export type ScheduleDto = {
  id: string;
  weekday: Weekday;
  localStartTime: string;
  timeZone: string;
  enabled: boolean;
  sportId: string;
  location: string | null;
  generationHorizonDays: number;
  registrationReminderMinutes: number;
  finalReminderMinutes: number;
};
