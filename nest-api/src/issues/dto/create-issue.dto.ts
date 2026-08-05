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
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { trim, trimUpper } from "@config/transforms";

export const PROJECT_KEY_PATTERN = /^[A-Z0-9]{2,5}$/;

/** 0 none, 1 urgent, 2 high, 3 medium, 4 low — Linear's order. */
export const MAX_PRIORITY = 4;

export const MAX_LABELS_PER_ISSUE = 20;

export class CreateIssueDto {
  @Transform(trimUpper)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "projectKey must be 2 to 5 letters or digits" })
  projectKey: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.issueTitle)
  title: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID("all")
  stateId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_PRIORITY)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isEpic?: boolean;

  @IsOptional()
  @IsUUID("all")
  epicId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LABELS_PER_ISSUE)
  @IsUUID("all", { each: true })
  labelIds?: string[];
}
