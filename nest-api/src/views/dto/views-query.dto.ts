import { Transform } from "class-transformer";
import { IsOptional, IsString, Matches } from "class-validator";
import { PROJECT_KEY_PATTERN } from "@issues/dto/create-issue.dto";
import { trimUpper } from "@config/transforms";

export class ViewsQueryDto {
  /**
   * Narrows the list to what applies on that project's pages: its own views
   * plus the workspace's. Absent returns every view, which is what the sidebar
   * asks for when it draws both groups at once.
   */
  @IsOptional()
  @Transform(trimUpper)
  @IsString()
  @Matches(PROJECT_KEY_PATTERN, { message: "project must be a 2 to 5 character project key" })
  project?: string;
}
