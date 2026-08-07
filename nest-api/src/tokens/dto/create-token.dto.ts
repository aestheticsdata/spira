import { Transform } from "class-transformer";
import { IsString, Length } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { trim } from "@config/transforms";

export class CreateTokenDto {
  @Transform(trim)
  @IsString()
  @Length(1, FIELD_LIMITS.apiTokenName)
  name: string;
}
