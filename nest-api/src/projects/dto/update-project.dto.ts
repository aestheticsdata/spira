import { Transform } from "class-transformer";
import {
  IsBoolean,
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
import { COLOR_PATTERN, MAX_PRIORITY } from "@projects/dto/create-project.dto";
import { PROJECT_KEY_PATTERN, normaliseProjectKeyValue } from "@projects/project-key.util";

export class UpdateProjectDto {
  @IsOptional()
  @Transform(normaliseProjectKeyValue)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "key must be 2 to 5 letters or digits" })
  key?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.projectName)
  name?: string;

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

  /** There is no DELETE /projects — archiving and restoring both ride on PATCH. */
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}
