import { IsNotEmpty, IsString, MaxLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { trim } from "@config/transforms";
import { Transform } from "class-transformer";

export class SignInDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.username)
  username: string;

  // No minimum length here on purpose — see PASSWORD_MIN_LENGTH. Sign-in
  // verifies a credential; it is not where the strength policy belongs.
  @IsString()
  @IsNotEmpty()
  password: string;
}
