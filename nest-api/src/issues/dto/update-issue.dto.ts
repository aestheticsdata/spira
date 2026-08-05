import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { MAX_LABELS_PER_ISSUE, MAX_PRIORITY } from "@issues/dto/create-issue.dto";
import { trim } from "@config/transforms";

/**
 * `@IsOptional()` also waves through `null`, which is what the nullable columns
 * want (`epicId: null` detaches an issue from its epic) and what the non-null
 * ones must not get — those are guarded so `null` fails as a 400 instead of
 * reaching MySQL.
 */
const whenPresent = (_dto: unknown, value: unknown): boolean => value !== undefined;

export class UpdateIssueDto {
  @ValidateIf(whenPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.issueTitle)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @ValidateIf(whenPresent)
  @IsUUID("all")
  stateId?: string;

  @ValidateIf(whenPresent)
  @IsInt()
  @Min(0)
  @Max(MAX_PRIORITY)
  priority?: number;

  @ValidateIf(whenPresent)
  @IsBoolean()
  isEpic?: boolean;

  @IsOptional()
  @IsUUID("all")
  epicId?: string | null;

  @ValidateIf(whenPresent)
  @IsArray()
  @ArrayMaxSize(MAX_LABELS_PER_ISSUE)
  @IsUUID("all", { each: true })
  labelIds?: string[];
}
