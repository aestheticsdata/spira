import { IsString, MinLength } from "class-validator";
import { PASSWORD_MIN_LENGTH } from "@config/field-limits";

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, { message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` })
  newPassword: string;
}
