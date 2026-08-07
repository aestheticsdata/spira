import { IDENTIFIER_PATTERN, formatIdentifier } from "@issues/identifier.util";

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
