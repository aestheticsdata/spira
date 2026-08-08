import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { PrismaService } from "../prisma/prisma.service";
import { resolveColumns } from "@migration/linear-columns.util";
import { errorsIn, planImport, warningsIn } from "@migration/linear-plan.util";
import { withoutOrphans } from "@migration/linear-orphans.util";
import { readSideFile } from "@migration/linear-side-file.util";
import { readExisting, writeImport } from "@migration/linear-write.util";

import type { CommitImportDto, PreviewImportDto } from "@migration/dto/import-linear.dto";
import type { ImportPreviewDto, ImportResultDto } from "@migration/dto/import-response.interface";
import type { ImportPlan } from "@migration/linear-plan.util";
import type { Orphan } from "@migration/linear-orphans.util";
import type { SideFile } from "@migration/linear-side-file.util";

/**
 * The Linear CSV import, over HTTP (COS-455).
 *
 * A shell around `src/migration/*`, which is where the import actually lives
 * and which this does not fork: the same `planImport` produces the plan, the
 * same `errorsIn` decides whether it is importable, and the same `writeImport`
 * writes it, so a run from Settings and a run from `pnpm import:linear` cannot
 * disagree.
 *
 * Two steps, never one. `preview` computes the plan and answers the report;
 * `commit` recomputes the *same* plan from the same bytes and hands it to
 * Prisma. That is the CLI's rule — the dry run is about the run you are
 * actually going to make — and it is why nothing is cached between the two.
 */
@Injectable()
export class MigrationService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(ownerId: string, dto: PreviewImportDto): Promise<ImportPreviewDto> {
    const prepared = this.prepare(dto);
    const existing = await readExisting(this.prisma, ownerId);
    const plan = planImport(prepared.rows, prepared.columns.index, existing);
    const owner = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { username: true } });

    const errors = errorsIn(plan.report);

    return {
      checksum: checksum(dto.csv),
      target: owner.username,
      columns: {
        read: Object.entries(prepared.columns.index).map(([field, position]) => ({
          field,
          header: prepared.header[position] ?? "",
        })),
        ignored: prepared.columns.ignored,
        unrecognised: prepared.columns.unrecognised,
        missingRequired: prepared.columns.missingRequired,
        duplicated: prepared.columns.duplicated,
      },
      orphans: prepared.orphans,
      skippedOrphans: dto.skipOrphans === true,
      sideFile: prepared.side
        ? {
            relations: prepared.side.relations.length,
            comments: prepared.side.comments.length,
            problems: prepared.sideProblems,
          }
        : null,
      report: plan.report,
      errors,
      warnings: warningsIn(plan.report),
      clean: errors.length === 0,
      continuedNumbering: plan.report.continuedNumbering,
    };
  }

  async commit(ownerId: string, dto: CommitImportDto): Promise<ImportResultDto> {
    if (checksum(dto.csv) !== dto.checksum) {
      throw new ConflictException(
        "This is not the file that was previewed. Run the dry run again and read its report before committing.",
      );
    }

    const prepared = this.prepare(dto);
    const existing = await readExisting(this.prisma, ownerId);
    const plan: ImportPlan = planImport(prepared.rows, prepared.columns.index, existing);

    const errors = errorsIn(plan.report);
    if (errors.length > 0) {
      throw new UnprocessableEntityException(`The export is not clean, so nothing was written: ${errors.join("; ")}`);
    }

    // The CLI's refusal, for the CLI's reason: "renumbered from 1 under the project key" is the
    // rule, this is the one way to lose it silently, and it cannot be undone once written. Almost
    // always the demo data from `pnpm seed` — which is a thing to clear, not a thing to import on
    // top of.
    if (plan.report.continuedNumbering.length > 0 && dto.allowContinuedNumbering !== true) {
      throw new ConflictException(
        `Refusing to write: ${plan.report.continuedNumbering
          .map((project) => `${project.key} would start at ${project.key}-${project.from + 1}, not ${project.key}-1`)
          .join("; ")}. Clear the workspace, or allow continued numbering deliberately.`,
      );
    }

    return writeImport(this.prisma, ownerId, plan, prepared.side);
  }

  /**
   * Everything both steps do to the upload before the planner sees it: parse,
   * resolve the header, drop orphans if asked, read the side-file. Shared so
   * that a commit cannot possibly prepare its input differently from the
   * preview that authorised it.
   */
  private prepare(dto: PreviewImportDto): {
    header: string[];
    rows: string[][];
    columns: ReturnType<typeof resolveColumns>;
    orphans: Orphan[];
    side: SideFile | null;
    sideProblems: string[];
  } {
    // `relax_column_count` so a row with a stray extra comma is reported by the plan as a malformed
    // *issue* rather than killing the parse of the whole file; `bom` because a CSV downloaded on
    // Windows carries one and it would otherwise become part of the first column's name.
    let rows: string[][];
    try {
      rows = parse(dto.csv, { bom: true, relax_column_count: true, skip_empty_lines: false, trim: false });
    } catch (error) {
      throw new BadRequestException(`The file is not readable as CSV: ${(error as Error).message}`);
    }

    if (rows.length === 0) {
      throw new BadRequestException("The file has no rows at all.");
    }

    const [header, ...body] = rows;
    const columns = resolveColumns(header);

    if (columns.missingRequired.length > 0) {
      throw new UnprocessableEntityException(`The export is missing ${columns.missingRequired.join(", ")}.`);
    }

    // Dropped here rather than inside the planner so that nothing about how a row becomes an issue
    // changes: these rows simply never reach it.
    const planned = dto.skipOrphans === true ? withoutOrphans(body, columns.index) : { rows: body, orphans: [] };

    let side: SideFile | null = null;
    let sideProblems: string[] = [];
    if (dto.sideFile !== undefined && dto.sideFile.trim() !== "") {
      try {
        const read = readSideFile(dto.sideFile);
        side = read.side;
        sideProblems = read.problems;
      } catch (error) {
        throw new BadRequestException(`The side-file is not readable as JSON: ${(error as Error).message}`);
      }
    }

    return { header, rows: planned.rows, columns, orphans: planned.orphans, side, sideProblems };
  }
}

/** Binds a commit to the bytes its preview reported on. */
function checksum(csv: string): string {
  return createHash("sha256").update(csv, "utf8").digest("hex");
}
