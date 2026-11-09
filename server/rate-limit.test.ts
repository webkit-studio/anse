import { describe, expect, it } from "vitest";
import { limitPokusu } from "./rate-limit";

// S04 #5: neplatné tokeny kalendáře per IP. Počítají se jen neúspěchy,
// po uplynutí okna se IP sama odblokuje.

describe("limit pokusů", () => {
  it("zablokuje IP po max neúspěších a jiné IP nechá být", () => {
    const l = limitPokusu(3, 60_000, () => 0);
    for (let i = 0; i < 3; i++) {
      expect(l.blokovano("1.1.1.1")).toBe(false);
      l.neuspech("1.1.1.1");
    }
    expect(l.blokovano("1.1.1.1")).toBe(true);
    expect(l.blokovano("2.2.2.2")).toBe(false);
  });

  it("po uplynutí okna se IP odblokuje a počítá se znovu", () => {
    let t = 0;
    const l = limitPokusu(2, 1000, () => t);
    l.neuspech("ip");
    l.neuspech("ip");
    expect(l.blokovano("ip")).toBe(true);
    t = 1001;
    expect(l.blokovano("ip")).toBe(false);
    l.neuspech("ip");
    expect(l.blokovano("ip")).toBe(false);
  });
});
