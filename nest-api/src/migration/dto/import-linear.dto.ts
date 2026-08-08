import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Roughly 16 MB of text. The real cutover export is a few hundred KB; this is
 * a ceiling on nonsense, not a target. `main.ts` sizes the body parser for
 * this route to match.
 */
export const MAX_CSV_CHARS = 16_000_000;

/**
 * The CSV arrives as text in a JSON body rather than as a multipart upload.
 *
 * It is text either way, the browser reads it with `File.text()`, and this
 * keeps the front's one request helper — which sets `content-type:
 * application/json` for everything — usable as it stands. The cost is a body
 * limit, raised for this route alone.
 */
export class PreviewImportDto {
  @IsString()
  @IsNotEmpty({ message: "The CSV is empty." })
  @MaxLength(MAX_CSV_CHARS, { message: "The CSV is too large to import in one go." })
  csv!: string;

  /** The optional `M1` connector dump: relations and comments. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CSV_CHARS, { message: "The side-file is too large." })
  sideFile?: string;

  /** Mirrors the CLI's `--skip-orphans`. */
  @IsOptional()
  @IsBoolean()
  skipOrphans?: boolean;
}

export class CommitImportDto extends PreviewImportDto {
  /**
   * The checksum the preview answered with. Preview and commit each send the
   * file, because holding a parsed plan server-side between two requests buys
   * an expiry and a store for no safety — but that does mean the two uploads
   * could differ, and this is what refuses when they do. Committing an import
   * whose report you never read is exactly the mistake the two steps exist to
   * prevent.
   */
  @IsString()
  @IsNotEmpty()
  checksum!: string;

  /** Mirrors the CLI's `--allow-continued-numbering`. */
  @IsOptional()
  @IsBoolean()
  allowContinuedNumbering?: boolean;
}
