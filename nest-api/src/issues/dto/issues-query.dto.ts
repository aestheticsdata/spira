import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { trim } from "@config/transforms";
import { MAX_PRIORITY, PROJECT_KEY_PATTERN } from "@issues/dto/create-issue.dto";

import type { TransformFnParams } from "class-transformer";

export const ISSUE_ORDER_BY = ["manual", "created", "updated", "priority", "title"] as const;
export type IssueOrderBy = (typeof ISSUE_ORDER_BY)[number];

/** A repeatable param arrives as one string, an array, or a comma-joined list. */
export function toList({ value }: TransformFnParams): string[] | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const entries = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return entries.length > 0 ? entries : undefined;
}

function toIntList(params: TransformFnParams): number[] | undefined {
  return toList(params)?.map((entry) => Number(entry));
}

export function toBoolean({ value }: TransformFnParams): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalised = String(value).trim().toLowerCase();
  return normalised === "true" || normalised === "1";
}

/**
 * Query params get their own transforms rather than `@config/transforms`: a
 * filter the UI has just cleared arrives as `?project=`, and that has to mean
 * "no filter" instead of failing the pattern.
 */
function toUpperCase({ value }: TransformFnParams): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class IssuesQueryDto {
  @IsOptional()
  @Transform(toUpperCase)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "project must be a 2 to 5 character project key" })
  project?: string;

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsUUID("all", { each: true })
  state?: string[];

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsUUID("all", { each: true })
  label?: string[];

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsUUID("all", { each: true })
  excludeLabel?: string[];

  @IsOptional()
  @Transform(toIntList)
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_PRIORITY, { each: true })
  priority?: number[];

  /** Live or legacy identifier of the epic whose children are wanted. */
  @IsOptional()
  @Transform(toUpperCase)
  @IsString()
  @MaxLength(FIELD_LIMITS.identifier)
  epic?: string;

  /** Live or legacy identifier of an epic whose children are *not* wanted. */
  @IsOptional()
  @Transform(toUpperCase)
  @IsString()
  @MaxLength(FIELD_LIMITS.identifier)
  excludeEpic?: string;

  /**
   * Cardinality rather than identity: `true` keeps only issues that sit in some
   * epic, `false` only issues that sit in none. `epic` and `excludeEpic` name
   * one; this asks whether there is one at all, which no identifier can express.
   */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasEpic?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isEpic?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeArchived?: boolean;

  /**
   * Free text over title, description and both identifier columns (C2).
   *
   * Distinct from `GET /search`, which ranks a global result set and answers a different question.
   * This one is a *filter*: it composes with project, state, label and epic, so "open issues in PFA
   * mentioning redis" is one query rather than an intersection the caller has to compute.
   */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FIELD_LIMITS.issueTitle)
  q?: string;

  @IsOptional()
  @IsIn(ISSUE_ORDER_BY)
  orderBy?: IssueOrderBy;
}
