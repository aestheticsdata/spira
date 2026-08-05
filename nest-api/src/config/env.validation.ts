import { plainToInstance } from "class-transformer";
import { IsNumberString, IsString, validateSync, ValidationError } from "class-validator";

class EnvironmentVariables {
  @IsNumberString()
  PORT: string;

  @IsString()
  SESSION_SECRET: string;

  @IsString()
  DATABASE_URL: string;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance<EnvironmentVariables, Record<string, unknown>>(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors: ValidationError[] = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Config validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
