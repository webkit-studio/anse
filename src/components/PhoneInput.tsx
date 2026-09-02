import { useMemo } from "react";
import { SelectSheet } from "./ui";

// Lehký telefonní input: předvolba s vlaječkou + číslo s mezerami po
// trojčíslích. Ukládá se jako jeden string, např. "+420 777 123 456".
// „Jiná" předvolba = volný zápis čísla tak, jak je.

interface Prefix {
  cc: string;
  flag: string;
  label: string;
  /** Očekávaný počet číslic národního čísla (základní kontrola). */
  digits?: number;
}

const PREFIXES: Prefix[] = [
  { cc: "+420", flag: "🇨🇿", label: "Česko", digits: 9 },
  { cc: "+421", flag: "🇸🇰", label: "Slovensko", digits: 9 },
  { cc: "+48", flag: "🇵🇱", label: "Polsko", digits: 9 },
  { cc: "+49", flag: "🇩🇪", label: "Německo" },
  { cc: "+43", flag: "🇦🇹", label: "Rakousko" },
  { cc: "", flag: "🌐", label: "Jiná" },
];

function groupDigits(digits: string): string {
  return digits.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}

/** Rozloží uloženou hodnotu na předvolbu + národní číslo. */
function parse(value: string): { prefix: Prefix; national: string } {
  const trimmed = value.trim();
  for (const p of PREFIXES) {
    if (p.cc && trimmed.startsWith(p.cc)) {
      return { prefix: p, national: trimmed.slice(p.cc.length).replace(/\D/g, "") };
    }
  }
  if (trimmed.startsWith("+")) {
    return { prefix: PREFIXES[PREFIXES.length - 1]!, national: trimmed };
  }
  // holé číslo bez předvolby → výchozí ČR
  return { prefix: PREFIXES[0]!, national: trimmed.replace(/\D/g, "") };
}

/** Základní kontrola: prázdné = ok (nepovinné), jinak délka dle předvolby. */
export function phoneIssue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const { prefix, national } = parse(trimmed);
  if (prefix.digits) {
    const digits = national.replace(/\D/g, "");
    if (digits.length !== prefix.digits) {
      return `Číslo pro ${prefix.label.toLowerCase()} má ${prefix.digits} číslic.`;
    }
  }
  return null;
}

export function emailIssue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed) ? null : "Zkontroluj formát e-mailu.";
}

export function PhoneInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { prefix, national } = useMemo(() => parse(value), [value]);
  const isOther = prefix.cc === "";

  function emit(nextPrefix: Prefix, nextNational: string) {
    if (nextPrefix.cc === "") {
      onChange(nextNational.trim());
    } else {
      const digits = nextNational.replace(/\D/g, "");
      onChange(digits ? `${nextPrefix.cc} ${groupDigits(digits)}` : "");
    }
  }

  return (
    <div className="phone-input">
      <div className="phone-prefix">
        <SelectSheet
          id={`${id}-prefix`}
          value={prefix.cc || "__other__"}
          placeholder="Předvolba"
          options={PREFIXES.map((p) => ({
            value: p.cc || "__other__",
            label: `${p.flag} ${p.cc || p.label}`,
          }))}
          onChange={(v) => {
            const next = PREFIXES.find((p) => (p.cc || "__other__") === v)!;
            emit(next, isOther ? "" : national);
          }}
        />
      </div>
      <input
        id={id}
        type="tel"
        inputMode={isOther ? "tel" : "numeric"}
        autoComplete="tel"
        placeholder={isOther ? "+31 612 345 678" : "777 123 456"}
        value={isOther ? national : groupDigits(national)}
        onChange={(e) => emit(prefix, e.target.value)}
      />
    </div>
  );
}
