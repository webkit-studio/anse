import { describe, expect, it } from "vitest";
import { CODE_REGEX, isTrivialCode } from "./codes";

describe("přihlašovací kódy", () => {
  it("formát: přesně 6 číslic", () => {
    expect(CODE_REGEX.test("047913")).toBe(true);
    expect(CODE_REGEX.test("12345")).toBe(false);
    expect(CODE_REGEX.test("1234567")).toBe(false);
    expect(CODE_REGEX.test("12a456")).toBe(false);
  });

  it("triviální kódy se odmítají", () => {
    expect(isTrivialCode("000000")).toBe(true);
    expect(isTrivialCode("111111")).toBe(true);
    expect(isTrivialCode("999999")).toBe(true);
    expect(isTrivialCode("123456")).toBe(true);
    expect(isTrivialCode("654321")).toBe(true);
  });

  it("běžné kódy projdou", () => {
    expect(isTrivialCode("047913")).toBe(false);
    expect(isTrivialCode("121212")).toBe(false);
    expect(isTrivialCode("100000")).toBe(false);
  });
});
