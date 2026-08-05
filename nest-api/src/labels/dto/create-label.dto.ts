import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";

/** `#rrggbb`, or `#rrggbbaa` when the label carries an alpha channel. */
export const COLOR_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export const COLOR_MESSAGE = "color must be a hex value like #7c3aed or #7c3aedff";

export class CreateLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(FIELD_LIMITS.labelName)
  name: string;

  @IsString()
  @Matches(COLOR_PATTERN, { message: COLOR_MESSAGE })
  color: string;
}
