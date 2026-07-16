/** Formát přihlašovacího kódu: přesně 6 číslic. */
export const CODE_REGEX = /^\d{6}$/;

/**
 * Triviální kódy, které při RUČNÍM zadávání odmítáme (admin může kódy
 * upravovat, ale tyhle by prolomil první pokus): samá stejná číslice,
 * 123456 a 654321. Náhodně generované kódy sem nikdy nespadnou.
 */
export function isTrivialCode(code: string): boolean {
  return /^(\d)\1{5}$/.test(code) || code === "123456" || code === "654321";
}
