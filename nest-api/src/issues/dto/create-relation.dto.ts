import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { FIELD_LIMITS } from "@config/field-limits";
import { RELATION_DIRECTIONS } from "@issues/relations.util";

import type { RelationDirection } from "@issues/relations.util";
import { trimUpper } from "@config/transforms";

export class CreateRelationDto {
  @IsIn(RELATION_DIRECTIONS)
  type: RelationDirection;

  /** Live or legacy identifier — resolved the same way as the route parameter. */
  @Transform(trimUpper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FIELD_LIMITS.identifier)
  targetIdentifier: string;
}
