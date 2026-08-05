import { checkViewQuery } from "@views/view-query.util";

const STATE_A = "11111111-1111-4111-8111-111111111111";
const STATE_B = "22222222-2222-4222-8222-222222222222";
const LABEL = "33333333-3333-4333-8333-333333333333";

/** The canonical form, or the failure — whichever the check produced. */
function canonical(raw: string): string {
  const { query, error } = checkViewQuery(raw);
  if (error !== null) {
    throw new Error(error);
  }
  return query as string;
}

describe("checkViewQuery — what a view may hold", () => {
  it("accepts the empty query: the plain list is a view worth saving", () => {
    expect(checkViewQuery("")).toEqual({ query: "", error: null });
  });

  it("accepts every filter the issues endpoint takes", () => {
    const raw = `state=${STATE_A}&label=${LABEL}&priority=1,2&hasEpic=true&includeArchived=true&isEpic=false`;

    expect(checkViewQuery(raw).error).toBeNull();
  });

  it("accepts the display half, which never reaches the issues endpoint", () => {
    expect(checkViewQuery("group=epic&order=created&cols=identifier,title&empty=true&legacy=false").error).toContain(
      "cols",
    );
    expect(checkViewQuery("group=epic&order=created&cols=identifier,status&empty=true&legacy=false").error).toBeNull();
  });

  it("takes a leading ?, because that is what window.location.search hands over", () => {
    expect(canonical("?group=epic")).toBe("group=epic");
  });
});

describe("checkViewQuery — what it refuses", () => {
  it("refuses a key that is not in the vocabulary at all", () => {
    const { query, error } = checkViewQuery("sortBy=title");

    expect(query).toBeNull();
    expect(error).toContain("sortBy");
  });

  it("refuses a value outside a closed vocabulary, naming the key", () => {
    expect(checkViewQuery("group=milestone").error).toContain("group");
    expect(checkViewQuery("order=title").error).toContain("order");
    expect(checkViewQuery("cols=description").error).toContain("cols");
  });

  it("refuses a state id that is not a uuid", () => {
    expect(checkViewQuery("state=not-a-uuid").error).toContain("state");
  });

  it("refuses a priority outside the scale", () => {
    expect(checkViewQuery("priority=9").error).toContain("priority");
  });

  it("refuses `project`, because the scope is a column and not a param", () => {
    const { error } = checkViewQuery("project=SPI");

    expect(error).toContain("project");
    expect(error).toContain("scope");
  });

  it("refuses `orderBy`, so a view cannot disagree with its own `order`", () => {
    const { error } = checkViewQuery("orderBy=created");

    expect(error).toContain("orderBy");
  });

  it("refuses a query longer than the column", () => {
    expect(checkViewQuery(`epic=${"A".repeat(3000)}`).error).toContain("2000");
  });
});

describe("checkViewQuery — canonical form", () => {
  it("sorts the keys, so the order they were written in cannot matter", () => {
    expect(canonical("legacy=false&group=epic&empty=true")).toBe("empty=true&group=epic&legacy=false");
  });

  it("sorts and de-duplicates a list", () => {
    expect(canonical(`state=${STATE_B},${STATE_A},${STATE_B}`)).toBe(`state=${STATE_A}%2C${STATE_B}`);
  });

  it("reads a repeated key and a comma-joined one as the same view", () => {
    expect(canonical(`state=${STATE_A}&state=${STATE_B}`)).toBe(canonical(`state=${STATE_A},${STATE_B}`));
  });

  it("sorts priorities numerically rather than lexically", () => {
    expect(canonical("priority=4,1,2")).toBe("priority=1%2C2%2C4");
  });

  it("keeps a false flag, which is a filter and not an absence", () => {
    // `hasEpic=false` means "in no epic" — dropping it as falsy would turn a
    // real filter into no filter at all.
    expect(canonical("hasEpic=false")).toBe("hasEpic=false");
  });

  it("drops an empty value rather than storing a key that filters nothing", () => {
    expect(canonical("epic=&state=")).toBe("");
  });

  it("uppercases an epic identifier, as the issues endpoint does", () => {
    expect(canonical("epic=spi-1")).toBe("epic=SPI-1");
  });

  it("is idempotent: canonicalising a canonical query changes nothing", () => {
    const once = canonical(`priority=2,1&group=priority&state=${STATE_B},${STATE_A}`);

    expect(canonical(once)).toBe(once);
  });

  it("round-trips a full view unchanged", () => {
    const raw = `state=${STATE_A}&priority=1&label=${LABEL}&hasEpic=true&group=epic&order=updated&cols=identifier,status&empty=true&legacy=false`;

    expect(canonical(canonical(raw))).toBe(canonical(raw));
  });
});
