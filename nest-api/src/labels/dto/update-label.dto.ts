import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { COLOR_MESSAGE, COLOR_PATTERN } from "@labels/dto/create-label.dto";

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(FIELD_LIMITS.labelName)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(COLOR_PATTERN, { message: COLOR_MESSAGE })
  color?: string;
}
