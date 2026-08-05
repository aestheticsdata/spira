import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsIn, IsOptional } from "class-validator";
import { IssuesQueryDto, toBoolean, toList } from "@issues/dto/issues-query.dto";

/**
 * Every key a saved view's query may carry (COS-265).
 *
 * It **extends** `IssuesQueryDto` rather than restating the filter keys, and
 * that is the whole design: a saved view is a stored `GET /issues` query, so
 * the filters it may hold are the filters that endpoint accepts, by
 * construction. Adding a filter there adds it here; changing one changes it
 * here; the two cannot drift, because there is only one of them.
 *
 * What is added is the display half — how the same rows are drawn. Those keys
 * never reach `GET /issues`; the front applies them when it renders. They are
 * validated all the same, because a view is only worth storing if the whole
 * thing can be replayed.
 *
 * One asymmetry, deliberate and documented: the URL says `order`, the issues
 * API says `orderBy`. `order` belongs to the display popover (COS-274) and
 * `orderBy` is the API's own param; the front translates the one key when it
 * builds the request. What is stored here is the *URL* query, so `order` is the
 * spelling a view uses.
 */

export const VIEW_GROUP_BY = ["status", "epic", "priority", "project", "none"] as const;
export type ViewGroupBy = (typeof VIEW_GROUP_BY)[number];

export const VIEW_ORDER = ["manual", "priority", "created", "updated"] as const;
export type ViewOrder = (typeof VIEW_ORDER)[number];

export const VIEW_COLUMNS = ["identifier", "status", "priority", "labels", "created", "updated"] as const;
export type ViewColumn = (typeof VIEW_COLUMNS)[number];

export class ViewQueryDto extends IssuesQueryDto {
  @IsOptional()
  @IsIn(VIEW_GROUP_BY)
  group?: ViewGroupBy;

  @IsOptional()
  @IsIn(VIEW_ORDER)
  order?: ViewOrder;

  @IsOptional()
  @Transform(toList)
  @IsArray()
  @IsIn(VIEW_COLUMNS, { each: true })
  cols?: ViewColumn[];

  /** Draw groups nothing is in. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  empty?: boolean;

  /** Show the Linear identifier beside the Spira one. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  legacy?: boolean;
}
