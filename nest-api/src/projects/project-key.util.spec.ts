import {
  PROJECT_KEY_PATTERN,
  RESERVED_PROJECT_KEYS,
  isReservedProjectKey,
  normaliseProjectKey,
  suggestProjectKey,
} from "@projects/project-key.util";

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

  it("never suggests a key the routes have taken", () => {
    // "New site" heads with NEW, "Issue tracker" with ISS-ue's first three,
    // "Login" with LOG — only the first two of those are reserved, and the
    // suggestion has to route around them without asking the owner.
    expect(suggestProjectKey("New site", [])).not.toBe("NEW");
    expect(suggestProjectKey("API gateway", [])).not.toBe("API");
    expect(suggestProjectKey("Login", [])).toBe("LOG");

    for (const name of ["New", "new", "API", "Api", "Issue", "issue"]) {
      expect(isReservedProjectKey(suggestProjectKey(name, []))).toBe(false);
    }
  });

  it("does not offer a reserved key as a collision suffix either", () => {
    // Nothing suffixed can collide today (every reserved key is letters-only),
    // so this pins the invariant rather than a current failure.
    const suggestion = suggestProjectKey("New site", ["NW", "NWS"]);

    expect(isReservedProjectKey(suggestion)).toBe(false);
    expect(suggestion).toMatch(PROJECT_KEY_PATTERN);
  });
});

describe("isReservedProjectKey", () => {
  it("matches the reserved list regardless of case or padding", () => {
    expect(isReservedProjectKey("ISSUE")).toBe(true);
    expect(isReservedProjectKey(" login ")).toBe(true);
    expect(isReservedProjectKey("api")).toBe(true);
    expect(isReservedProjectKey("New")).toBe(true);
  });

  it("leaves ordinary keys alone", () => {
    expect(isReservedProjectKey("SPI")).toBe(false);
    expect(isReservedProjectKey("PFA")).toBe(false);
    expect(isReservedProjectKey("APIS")).toBe(false);
  });

  it("only reserves keys a project could actually have held", () => {
    // PROJECTS and SETTINGS are absent on purpose: both are longer than the
    // column, so reserving them would only be noise.
    for (const key of RESERVED_PROJECT_KEYS) {
      expect(key).toMatch(PROJECT_KEY_PATTERN);
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
