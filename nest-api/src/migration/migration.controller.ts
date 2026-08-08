import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CsrfGuard } from "@auth/guards/csrf.guard";
import { GetUserId } from "@auth/decorators/get-user.decorator";
import { SessionAuthGuard } from "@auth/guards/session-auth.guard";
import { CommitImportDto, PreviewImportDto } from "@migration/dto/import-linear.dto";
import { MigrationService } from "@migration/migration.service";

import type { ImportPreviewDto, ImportResultDto } from "@migration/dto/import-response.interface";

/**
 * Cookie session only — deliberately not `ApiAuthGuard` (COS-455).
 *
 * A leaked API token can already read and write issues, which is its job. It
 * has no business running a one-shot, irreversible migration into the
 * workspace, and the same containment argument keeps the token routes
 * cookie-only.
 */
@Controller("migration/linear")
@UseGuards(SessionAuthGuard, CsrfGuard)
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  /** The dry run. Computes the plan, writes nothing, answers the report. */
  @Post("preview")
  @HttpCode(200)
  preview(@GetUserId() ownerId: string, @Body() dto: PreviewImportDto): Promise<ImportPreviewDto> {
    return this.migrationService.preview(ownerId, dto);
  }

  /** The write. Refuses unless the file matches the one previewed. */
  @Post("commit")
  @HttpCode(200)
  commit(@GetUserId() ownerId: string, @Body() dto: CommitImportDto): Promise<ImportResultDto> {
    return this.migrationService.commit(ownerId, dto);
  }
}
