// Přihlašovací kódy. Login je jen kód, bez jména — kód zároveň určuje, kdo se
// přihlašuje, proto je unikátní. Dva druhy:
// - vygenerovaný: přesně 6 číslic, vydává server (nový účet, reset kanceláří),
// - vlastní (S05 #7): 8–64 znaků, nastaví si ho uživatel v Nastavení.
// Ukládá se a porovnává v normalizovaném tvaru (malá písmena), takže při
// přihlášení na velikosti písmen nezáleží.

/** Vygenerovaný kód: přesně 6 číslic. */
export const CODE_REGEX = /^\d{6}$/;

export const VLASTNI_KOD_MIN = 8;
export const VLASTNI_KOD_MAX = 64;

/** Znaky vlastního kódu: viditelné ASCII — písmena bez diakritiky, číslice,
 *  znaky. Bez mezer a diakritiky (česká klávesnice má na číslicích háčky). */
const VLASTNI_ZNAKY = /^[\x21-\x7e]+$/;

/**
 * Jedna hláška pro slabý i obsazený kód. Kdyby se lišily, hláška „obsazený"
 * by prozradila, že takový kód má někdo jiný — a s ním by se šlo přihlásit.
 */
export const KOD_NEJDE_POUZIT = "Tento kód nejde použít, zvol jiný.";

/** Tvar, ve kterém se kód ukládá a porovnává. */
export function normalizujKod(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Vygenerovaný kód (6 číslic) — kancelář ho vidí. Vlastní kód ne. */
export function jeVygenerovanyKod(code: string): boolean {
  return CODE_REGEX.test(code);
}

/** Může to být kód (vygenerovaný nebo vlastní)? Vstup normalizovaný. */
export function maTvarKodu(code: string): boolean {
  return (
    CODE_REGEX.test(code) ||
    (code.length >= VLASTNI_KOD_MIN && code.length <= VLASTNI_KOD_MAX && VLASTNI_ZNAKY.test(code))
  );
}

/** Hláška u pole přihlášení, když zadaná hodnota kódem být nemůže. */
export function chybaPrihlasovacihoKodu(raw: string): string | null {
  const code = normalizujKod(raw);
  if (maTvarKodu(code)) return null;
  if (/[^\x21-\x7e]/.test(code)) return "Kód je bez diakritiky — zkontroluj klávesnici.";
  if (/^\d{0,6}$/.test(code)) return "Kód má 6 číslic.";
  return "Vlastní kód má aspoň 8 znaků.";
}

/** Chyba tvaru nového vlastního kódu (u pole), nebo null. Tvar tajemství
 *  není — slabost a obsazenost mají společnou hlášku KOD_NEJDE_POUZIT. */
export function chybaTvaruVlastnihoKodu(code: string): string | null {
  if (code.length < VLASTNI_KOD_MIN) return `Kód musí mít aspoň ${VLASTNI_KOD_MIN} znaků.`;
  if (code.length > VLASTNI_KOD_MAX) return `Kód může mít nejvýš ${VLASTNI_KOD_MAX} znaků.`;
  if (/\s/.test(code)) return "Kód nesmí obsahovat mezery.";
  if (!VLASTNI_ZNAKY.test(code)) return "Použij jen písmena bez diakritiky, číslice a znaky.";
  return null;
}

// --- slabé kódy ----------------------------------------------------------------

/** Řady na klávesnici (i QWERTZ) — kód, který je jejich kusem, je slabý. */
const RADY = [
  "1234567890",
  "qwertzuiop",
  "qwertyuiop",
  "asdfghjkl",
  "yxcvbnm",
  "zxcvbnm",
  "abcdefghijklmnopqrstuvwxyz",
  "1qaz2wsx3edc4rfv5tgb",
  "1qay2wsx3edc4rfv5tgb",
  "qaywsxedcrfvtgbzhnujm",
  "qazwsxedcrfvtgbyhnujm",
];

/** Nejčastější hesla (normalizovaná), která pravidla níž nechytí. */
const CASTA = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "iloveyou",
  "heslo123",
  "heslo1234",
  "hesloheslo",
  "abcd1234",
  "1234abcd",
  "qwerty123",
  "qwertz123",
  "qwer1234",
  "1234qwer",
  "asdf1234",
  "1q2w3e4r",
  "1q2w3e4r5t",
  "q1w2e3r4",
  "zaq12wsx",
  "anse1234",
  "anse2026",
  "anseanse",
  "aa123456",
  "a1b2c3d4",
  "1a2b3c4d",
]);

/** Kód složený z opakování krátkého kusu: 12121212, abcabcab, 12341234. */
function jeOpakovani(code: string): boolean {
  for (let k = 1; k <= code.length / 2; k++) {
    const kus = code.slice(0, k);
    if (kus.repeat(Math.ceil(code.length / k)).slice(0, code.length) === code) return true;
  }
  return false;
}

/** Řada se stálým krokem: 12345678, 87654321, 13579135, abcdefgh. */
function jeRada(code: string): boolean {
  if (/^\d+$/.test(code)) {
    const krok = (Number(code[1]) - Number(code[0]) + 10) % 10;
    for (let i = 1; i < code.length; i++) {
      if ((Number(code[i]) - Number(code[i - 1]) + 10) % 10 !== krok) return false;
    }
    return true;
  }
  if (/^[a-z]+$/.test(code)) {
    const krok = code.charCodeAt(1) - code.charCodeAt(0);
    if (Math.abs(krok) !== 1) return false;
    for (let i = 1; i < code.length; i++) {
      if (code.charCodeAt(i) - code.charCodeAt(i - 1) !== krok) return false;
    }
    return true;
  }
  return false;
}

function jeVzorec(code: string): boolean {
  return (
    new Set(code).size < 3 ||
    jeOpakovani(code) ||
    jeRada(code) ||
    RADY.some((r) => r.includes(code) || [...r].reverse().join("").includes(code))
  );
}

/**
 * Vlastní kód, který jde uhodnout: opakování (00000000, 12121212), řady
 * (12345678, abcdefgh, qwertzui), málo různých znaků, nejčastější hesla
 * a totéž s jedním znakem navíc na začátku nebo na konci (12345678a).
 * Data narození (DDMMRRRR) zadání neřeší. Vstup normalizovaný.
 */
export function jeSlabyVlastniKod(code: string): boolean {
  return (
    CASTA.has(code) || jeVzorec(code) || jeVzorec(code.slice(1)) || jeVzorec(code.slice(0, -1))
  );
}

// --- 6místné kódy zadané kanceláří ručně ----------------------------------------

/**
 * Triviální kódy, které při RUČNÍM zadávání odmítáme (admin může kódy
 * upravovat, ale tyhle by prolomil první pokus): samá stejná číslice,
 * 123456 a 654321. Náhodně generované kódy sem nikdy nespadnou.
 */
export function isTrivialCode(code: string): boolean {
  return /^(\d)\1{5}$/.test(code) || code === "123456" || code === "654321";
}

// --- automatické odeslání přihlášení ---------------------------------------------

/** Jak dlouho po ručně dopsané 6. číslici počkat, jestli se píše dál. */
export const PAUZA_PRED_ODESLANIM_MS = 800;

/**
 * Kdy přihlášení odeslat samo, bez Enteru:
 * - "hned": hodnota přibyla najednou (správce hesel, vložení) a má tvar kódu,
 * - "po-pauze": ručně dopsaná 6. číslice — vlastní kód může mít víc číslic
 *   (např. 8), tak se chvíli počká, jestli se píše dál,
 * - null: neodesílat (delší kód potvrdí Enter nebo tlačítko).
 */
export function samoOdeslani(predtim: string, ted: string): "hned" | "po-pauze" | null {
  const kod = normalizujKod(ted);
  if (ted.length - predtim.length >= 2 && maTvarKodu(kod)) return "hned";
  if (ted.length > predtim.length && CODE_REGEX.test(kod)) return "po-pauze";
  return null;
}
