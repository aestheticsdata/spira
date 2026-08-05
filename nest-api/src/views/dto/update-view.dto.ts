import { Transform } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateIf } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { trim } from "@config/transforms";

/** `@IsOptional()` waves `null` through, which only `icon` may receive. */
const whenPresent = (_dto: unknown, value: unknown): boolean => value !== undefined;

/**
 * Rename, re-icon, re-query, reorder — the four things COS-278 offers.
 *
 * The scope is deliberately not among them. A view's project is half of what it
 * means, and moving a project view to the workspace would silently widen every
 * list it draws; that is a new view, not an edit.
 */
export class UpdateViewDto {
  @ValidateIf(whenPresent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.viewName)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FIELD_LIMITS.icon)
  icon?: string | null;

  @ValidateIf(whenPresent)
  @IsString()
  @MaxLength(FIELD_LIMITS.viewQuery)
  query?: string;

  @ValidateIf(whenPresent)
  @IsInt()
  @Min(0)
  position?: number;
}
