import { Transform } from "class-transformer";
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { PROJECT_KEY_PATTERN } from "@issues/dto/create-issue.dto";
import { trim, trimUpper } from "@config/transforms";

export class CreateViewDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.viewName)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(FIELD_LIMITS.icon)
  icon?: string | null;

  /**
   * The project the view belongs to. Absent or null makes it workspace-wide,
   * which is the split the sidebar draws.
   *
   * A key rather than an id, like `CreateIssueDto`: the front is on
   * `/spi/issues` and knows `SPI`, and asking it to carry a uuid it never saw
   * would be a lookup invented for the sake of the request.
   */
  @IsOptional()
  @Transform(trimUpper)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "projectKey must be a 2 to 5 character project key" })
  projectKey?: string | null;

  /**
   * The list URL's query string — `state=…&group=epic`, with or without the
   * leading `?`. Empty means the plain list, which is a view worth saving:
   * "everything in this project, as it comes".
   *
   * Length is capped here so an oversized value is a 400 rather than a MySQL
   * error; what the keys may *be* is checked by the view vocabulary, which is
   * the issues query plus the display options and nothing else.
   */
  @IsString()
  @MaxLength(FIELD_LIMITS.viewQuery)
  query!: string;
}
