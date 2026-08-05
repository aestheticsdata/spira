import { normaliseRelation } from "@issues/relations.util";

const LOWER = "11111111-1111-4111-8111-111111111111";
const HIGHER = "99999999-9999-4999-8999-999999999999";

describe("normaliseRelation", () => {
  it("stores a block exactly as given — the direction is the meaning", () => {
    expect(normaliseRelation({ fromId: HIGHER, toId: LOWER, type: "blocks" })).toEqual({
      fromIssueId: HIGHER,
      toIssueId: LOWER,
      type: "blocks",
    });
  });

  it("orders a related pair lower-id-first", () => {
    expect(normaliseRelation({ fromId: HIGHER, toId: LOWER, type: "related" })).toEqual({
      fromIssueId: LOWER,
      toIssueId: HIGHER,
      type: "related",
    });
  });

  it("leaves an already ordered related pair alone", () => {
    expect(normaliseRelation({ fromId: LOWER, toId: HIGHER, type: "related" })).toEqual({
      fromIssueId: LOWER,
      toIssueId: HIGHER,
      type: "related",
    });
  });

  it("collapses both directions of a related pair onto one row", () => {
    const forward = normaliseRelation({ fromId: LOWER, toId: HIGHER, type: "related" });
    const backward = normaliseRelation({ fromId: HIGHER, toId: LOWER, type: "related" });
    expect(forward).toEqual(backward);
  });

  it("keeps the two directions of a block apart", () => {
    const forward = normaliseRelation({ fromId: LOWER, toId: HIGHER, type: "blocks" });
    const backward = normaliseRelation({ fromId: HIGHER, toId: LOWER, type: "blocks" });
    expect(forward).not.toEqual(backward);
  });
});
