import { Transform } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";

export class ProjectsQueryDto {
  // A query string carries text, never a boolean: "true" and "1" both mean true,
  // anything else (including an absent parameter) means false.
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  includeArchived?: boolean;
}

export class SuggestKeyQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.projectName)
  name: string;
}
