import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateManualMatchRequestDto {
  @IsUUID()
  sportId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  localDate!: string;

  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/)
  localStartTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string | null;
}
