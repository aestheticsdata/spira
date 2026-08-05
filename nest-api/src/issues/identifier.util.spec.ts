import { IDENTIFIER_PATTERN, formatIdentifier, parseIdentifier } from "@issues/identifier.util";

describe("formatIdentifier", () => {
  it("joins the uppercased key and the number", () => {
    expect(formatIdentifier("PFA", 12)).toBe("PFA-12");
    expect(formatIdentifier("pfa", 1)).toBe("PFA-1");
    expect(formatIdentifier("3DE", 1042)).toBe("3DE-1042");
  });
});

describe("IDENTIFIER_PATTERN", () => {
  it.each(["AB-1", "PFA-12", "3DE-1042", "ABCDE-7"])("matches %s", (identifier) => {
    expect(IDENTIFIER_PATTERN.test(identifier)).toBe(true);
  });

  it.each(["A-1", "ABCDEF-1", "pfa-1", "PFA-", "PFA", "PFA-1a", "PF A-1"])("rejects %s", (identifier) => {
    expect(IDENTIFIER_PATTERN.test(identifier)).toBe(false);
  });
});

describe("parseIdentifier", () => {
  it("splits a well formed identifier", () => {
    expect(parseIdentifier("PFA-12")).toEqual({ key: "PFA", number: 12 });
  });

  it("normalises case and surrounding whitespace", () => {
    expect(parseIdentifier("  pfa-12 ")).toEqual({ key: "PFA", number: 12 });
  });

  it("round-trips with formatIdentifier", () => {
    const parsed = parseIdentifier("3DE-1042") ?? { key: "", number: 0 };
    expect(formatIdentifier(parsed.key, parsed.number)).toBe("3DE-1042");
  });

  it.each([
    ["a one character key", "A-1"],
    ["a six character key", "ABCDEF-1"],
    ["a missing number", "PFA-"],
    ["a missing key", "-12"],
    ["a non-numeric suffix", "PFA-12a"],
    ["the zeroth issue", "PFA-0"],
    ["a padded number", "PFA-007"],
    ["a number beyond the safe integer range", "PFA-99999999999999999999"],
    ["free text", "not an identifier"],
    ["an empty string", ""],
  ])("returns null for %s", (_case, raw) => {
    expect(parseIdentifier(raw)).toBeNull();
  });
});
