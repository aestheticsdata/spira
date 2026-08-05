import { Transform } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { PROJECT_KEY_PATTERN, normaliseProjectKeyValue } from "@projects/project-key.util";

export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low — Linear's order, shared with issues. */
export const MAX_PRIORITY = 4;

export class CreateProjectDto {
  @Transform(normaliseProjectKeyValue)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "key must be 2 to 5 letters or digits" })
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.projectName)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.icon)
  icon?: string | null;

  @IsOptional()
  @Matches(COLOR_PATTERN, { message: "color must be #rrggbb or #rrggbbaa" })
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(FIELD_LIMITS.summary)
  summary?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  statusId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRIORITY)
  priority?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  targetDate?: string | null;
}
