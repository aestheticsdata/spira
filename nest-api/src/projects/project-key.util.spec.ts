import { PROJECT_KEY_PATTERN, normaliseProjectKey, suggestProjectKey } from "@projects/project-key.util";

describe("normaliseProjectKey", () => {
  it("trims and uppercases", () => {
    expect(normaliseProjectKey("  pfa \n")).toBe("PFA");
  });

  it("leaves an already-normalised key alone", () => {
    expect(normaliseProjectKey("3DE")).toBe("3DE");
  });
});

describe("suggestProjectKey", () => {
  it("takes the first three alphanumeric characters, uppercased", () => {
    expect(suggestProjectKey("PFA", [])).toBe("PFA");
    expect(suggestProjectKey("Zeus", [])).toBe("ZEU");
    expect(suggestProjectKey("Exalus", [])).toBe("EXA");
    expect(suggestProjectKey("Iknos", [])).toBe("IKN");
    expect(suggestProjectKey("Spira", [])).toBe("SPI");
  });

  it("keeps a leading digit when the result is not all digits", () => {
    expect(suggestProjectKey("3D engine", [])).toBe("3DE");
  });

  it("skips punctuation and whitespace", () => {
    expect(suggestProjectKey("  my-great app ", [])).toBe("MYG");
  });

  it("accepts a two-character name", () => {
    expect(suggestProjectKey("Go", [])).toBe("GO");
  });

  it("falls back to consonants when the first three characters are all digits", () => {
    const key = suggestProjectKey("1991chat", []);

    expect(key).toBe("CHT");
    expect(key).not.toMatch(/^\d+$/);
  });

  it("falls back to the first letters when there are too few consonants", () => {
    expect(suggestProjectKey("1991aeiou", [])).toBe("AEI");
  });

  it("returns PRJ when the name holds nothing usable", () => {
    expect(suggestProjectKey("1991", [])).toBe("PRJ");
    expect(suggestProjectKey("!!!", [])).toBe("PRJ");
    expect(suggestProjectKey("A", [])).toBe("PRJ");
  });

  it("appends 2, 3, 4… on a collision", () => {
    expect(suggestProjectKey("PFA", ["PFA"])).toBe("PFA2");
    expect(suggestProjectKey("PFA", ["PFA", "PFA2"])).toBe("PFA3");
    expect(suggestProjectKey("PFA", ["PFA", "PFA2", "PFA3"])).toBe("PFA4");
  });

  it("compares against taken keys case-insensitively", () => {
    expect(suggestProjectKey("PFA", ["pfa"])).toBe("PFA2");
  });

  it("does not treat an unrelated key as a collision", () => {
    expect(suggestProjectKey("PFA", ["ZEU", "SPI"])).toBe("PFA");
  });

  it("caps the suffixed key at five characters", () => {
    const taken = ["PFA", "PFA2", "PFA3", "PFA4", "PFA5", "PFA6", "PFA7", "PFA8", "PFA9"];

    expect(suggestProjectKey("PFA", taken)).toBe("PFA10");
  });

  it("only ever produces a valid key", () => {
    const names = ["PFA", "3D engine", "1991chat", "1991", "!!!", "Alphabet", "Go"];
    const taken = ["PFA", "3DE", "CHT", "PRJ", "ALPHA", "GO"];

    for (const name of names) {
      expect(suggestProjectKey(name, taken)).toMatch(PROJECT_KEY_PATTERN);
    }
  });
});

describe("PROJECT_KEY_PATTERN", () => {
  it("accepts two to five uppercase alphanumerics", () => {
    expect("GO").toMatch(PROJECT_KEY_PATTERN);
    expect("3DE").toMatch(PROJECT_KEY_PATTERN);
    expect("ALPHA").toMatch(PROJECT_KEY_PATTERN);
  });

  it("rejects anything else", () => {
    expect("A").not.toMatch(PROJECT_KEY_PATTERN);
    expect("ALPHAS").not.toMatch(PROJECT_KEY_PATTERN);
    expect("pfa").not.toMatch(PROJECT_KEY_PATTERN);
    expect("PF-A").not.toMatch(PROJECT_KEY_PATTERN);
  });
});
