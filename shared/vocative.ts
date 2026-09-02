// 5. pád křestního jména („Dobré ráno, Marku").
//
// Proč vůbec: čeština oslovuje pátým pádem, a „Dobré ráno, Marek" zní jako
// z automatu. Seznam všech jmen se ale nahrát nedá — je to otevřená množina.
// Řeší se to tedy PRAVIDLY podle zakončení a krátkým seznamem NEPRAVIDELNÝCH.
//
// Zásada, která rozhoduje spory: OSLOVIT PRVNÍM PÁDEM JE LEPŠÍ NEŽ VYROBIT
// PATVAR. Proto se skloňuje jen tam, kde je zakončení jednoznačně mužské.
// Zakončení, které nese i spousta nesklonných ženských jmen (-l, -m, -n, -t,
// -d, -b, -v, -z), se nechává být: „Nicole" místo Nicol nebo „Judite" místo
// Judit je horší chyba než neskloněné „Michal" — zmrší jméno, a ještě to
// vypadá jako záměna osoby. Mužská jména s takovým zakončením jsou v seznamu
// MUZSKA níž; je konečný a krátký, na rozdíl od seznamu všech ženských jmen.
//
// Když se objeví jméno, které pravidla zkomolí, přidá se jeden řádek sem.

/** Jména, která pravidla netrefí. Klíč je malými písmeny bez diakritiky. */
const VYJIMKY: Record<string, string> = {
  // vypadávající -e- v kmeni
  karel: "Karle",
  pavel: "Pavle",
  havel: "Havle",
  // cizí jména na -ek/-ec, kde se -e- NEvypouští (jinak „Derku", „Alče")
  derek: "Dereku",
  alec: "Alecu",
  // mužská jména, která zůstávají beze změny
  ivo: "Ivo",
  hugo: "Hugo",
  oto: "Oto",
  otto: "Otto",
  bruno: "Bruno",
  // cizí jména, kde by pravidla sáhla vedle výslovnosti
  rajesh: "Rajeshi",
  joseph: "Josephe",
  ralph: "Ralphe",
  minh: "Minh",
  nam: "Nam",
  duc: "Ducu",
};

/**
 * Mužská jména se zakončením, které nese i ženská nesklonná jména. Bez tohohle
 * seznamu by se neskloňovala (viz zásada v hlavičce). Doplňuje se podle toho,
 * koho aplikace potká — je to konečná množina, ženská jména nejsou.
 */
const MUZSKA = new Set([
  "adam", "alan", "albert", "ales", "alexandr", "alois", "andrej", "antonin", "arnost",
  "bedrich", "bohumil", "bohumir", "bohuslav", "boleslav", "borivoj", "bretislav",
  "ctirad", "cestmir", "dalibor", "dalimil", "damian", "daniel", "david", "denis",
  "dominik", "drahomir", "dusan", "edvard", "emanuel", "emil", "erik", "evzen",
  "felix", "ferdinand", "filip", "frantisek", "gabriel", "gustav", "hubert", "hynek",
  "ivan", "jachym", "jakub", "jan", "jaromir", "jaroslav", "jindrich", "jiri", "josef",
  "julius", "kamil", "karel", "kristian", "kvetoslav", "ladislav", "leos", "libor",
  "lubomir", "lubos", "ludek", "ludvik", "lukas", "lumir", "marcel", "marek", "marian",
  "marin", "martin", "matej", "matyas", "maxmilian", "medard", "metodej", "michael",
  "michal", "milan", "milos", "miloslav", "miloval", "miran", "miroslav", "mojmir",
  "norbert", "oldrich", "oliver", "ondrej", "otakar", "oskar", "patrik", "pavel",
  "petr", "premysl", "prokop", "radek", "radim", "radomir", "radoslav", "radovan",
  "rene", "richard", "robert", "roman", "rostislav", "rudolf", "samuel", "sebastian",
  "silvestr", "simon", "slavomir", "stanislav", "stepan", "svatopluk", "sebestian",
  "nikolas", "tobias", "matias", "kryspin",
  "tadeas", "teodor", "tibor", "tomas", "vaclav", "valentin", "vendelin", "viktor",
  "vilem", "vit", "vitezslav", "vladan", "vladimir", "vladislav", "vlastimil",
  "vojtech", "vratislav", "zbynek", "zdenek", "zikmund",
]);

const SAMOHLASKY = "aáeéěiíoóuúůyý";

/** Zakončení, po kterých se přidává -i (měkké souhlásky). */
const MEKKE = ["š", "ž", "č", "ř", "j", "ď", "ť", "ň", "c", "s"];

/** Po ď/ť/ň se v češtině píše tvrdé i — „Miloňi" neexistuje, je to Miloni. */
const ZTVRDNUTI: Record<string, string> = { ň: "n", ť: "t", ď: "d" };

/** Změkčení kmene před -ku u zakončení -ěk (Zdeněk → Zdeňku, Luděk → Luďku). */
const ZMEKCENI: Record<string, string> = { n: "ň", d: "ď", t: "ť" };

/** Akademické tituly — nejsou to jména, do oslovení nepatří. */
const TITULY = new Set([
  "ing", "mgr", "bc", "mudr", "judr", "phdr", "rndr", "paeddr", "mvdr", "thdr",
  "doc", "prof", "dis", "ph", "csc", "drsc", "mba", "phd",
]);

/** Klíč do seznamů: malými písmeny a bez diakritiky (ráchel i rachel). */
function klic(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function velkePrvni(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Vrátí jméno v 5. pádu. Nezná-li si rady, vrátí jméno beze změny —
 * oslovit prvním pádem je pořád lepší než vyrobit patvar.
 *
 * Vstupem má být KŘESTNÍ jméno; celé jméno rozseká `krestni()`.
 */
export function vokativ(jmeno: string): string {
  if (typeof jmeno !== "string") return "";
  let n = jmeno.trim();
  if (n === "") return "";

  // Složené jméno se skloňuje po částech: Jan-Karel → Jane-Karle.
  if (n.includes("-")) {
    return n
      .split("-")
      .map((c) => vokativ(c))
      .join("-");
  }

  // Jméno psané verzálkami se nejdřív srovná, jinak vznikne „PETře".
  const verzalky = n === n.toUpperCase() && n !== n.toLowerCase() && n.length > 1;
  if (verzalky) n = velkePrvni(n.toLowerCase());

  const dokonci = (v: string) => (verzalky ? v.toUpperCase() : v);

  const k = klic(n);
  // hasOwn, ne prostý index — jinak by „constructor" vrátil funkci.
  if (Object.hasOwn(VYJIMKY, k)) return dokonci(VYJIMKY[k]!);

  // Jedno písmeno je iniciála nebo překlep, ne jméno ke skloňování.
  if (n.length < 2) return dokonci(n);

  const low = n.toLowerCase();
  const posledni = low.slice(-1);
  const predposledni = low.slice(-2, -1);

  // Samohláskové konce
  if (posledni === "a") return dokonci(`${n.slice(0, -1)}o`); // Jana → Jano, Honza → Honzo
  if (SAMOHLASKY.includes(posledni)) return dokonci(n); // Marie, Jiří, Ivo, Hugo

  // Zakončení, která mění kmen. Ta jsou u ženských jmen nemožná, takže se
  // uplatní na cokoli — seznam MUZSKA k nim není potřeba.
  if (low.endsWith("ěk")) {
    // Zdeněk → Zdeňku, Luděk → Luďku: -ě- vypadne a kmen změkne.
    const kmen = n.slice(0, -2);
    const p = kmen.slice(-1).toLowerCase();
    return dokonci(kmen.slice(0, -1) + (ZMEKCENI[p] ?? kmen.slice(-1)) + "ku");
  }
  if (low.endsWith("ek")) return dokonci(`${n.slice(0, -2)}ku`); // Marek → Marku
  if (low.endsWith("ec")) return dokonci(`${n.slice(0, -2)}če`); // Němec → Němče

  // Tvrdé zadopatrové → -u (Vojtěch → Vojtěchu, Dominik → Dominiku).
  // -h a -ch jen u známého mužského jména: Judith je taky na -h a „Judithu"
  // je 3. pád, ne oslovení.
  if (posledni === "k" || posledni === "g") return dokonci(`${n}u`);
  if (posledni === "h") return MUZSKA.has(k) ? dokonci(`${n}u`) : dokonci(n);

  // -r: po souhlásce měkne (Petr → Petře), po samohlásce ne (Viktor → Viktore).
  // Ženská jména na -r (Dagmar, Ester) se neskloňují, proto přes MUZSKA.
  if (posledni === "r") {
    if (!MUZSKA.has(k)) return dokonci(n);
    return dokonci(
      predposledni !== "" && SAMOHLASKY.includes(predposledni)
        ? `${n}e`
        : `${n.slice(0, -1)}ře`,
    );
  }

  // Měkké souhlásky → -i. Po ď/ť/ň se souhláska vrací na tvrdý zápis.
  // -s je jediné z nich, které nesou i ženská jména (Doris, Iris, Agnes),
  // proto se u něj ptáme na seznam; -š/-ž/-č/-ř/-j jsou bezpečné.
  if (MEKKE.includes(posledni)) {
    if (posledni === "s" && !MUZSKA.has(k)) return dokonci(n);
    const zt = ZTVRDNUTI[posledni];
    return dokonci(zt ? `${n.slice(0, -1)}${zt}i` : `${n}i`);
  }

  // Ostatní souhlásky (-l, -m, -n, -t, -d, -b, -v, -z, -p, -f, -w) → -e,
  // ale JEN u známého mužského jména. Jinak by se z Nicol stala „Nicole",
  // z Judit „Judite" a z Astrid „Astride“.
  if (MUZSKA.has(k)) {
    if (low.endsWith("el")) return dokonci(`${n}i`); // Daniel → Danieli
    return dokonci(`${n}e`); // Jakub → Jakube, Martin → Martine
  }

  return dokonci(n);
}

/**
 * Křestní jméno z celého jména („Jakub Svoboda" → „Jakub").
 * Přeskakuje tituly, ať se z „Ing. Jakub" nestane oslovení „Ing.".
 */
export function krestni(celeJmeno: string): string {
  if (typeof celeJmeno !== "string") return "";
  const slova = celeJmeno.trim().split(/\s+/);
  for (const s of slova) {
    const cisty = s.replace(/[.,]/g, "");
    if (cisty.length < 2) continue;
    if (TITULY.has(klic(cisty))) continue;
    if (!/^[\p{L}'-]+$/u.test(cisty)) continue;
    return cisty;
  }
  return "";
}

/**
 * Pozdrav podle denní doby. Hranice zadal Lukáš:
 * 0:00–7:59 ráno · 8:00–11:59 dopoledne · 12:00–17:59 odpoledne · 18:00–23:59 večer.
 */
export function pozdrav(hodina: number): string {
  if (hodina < 8) return "Dobré ráno";
  if (hodina < 12) return "Dobré dopoledne";
  if (hodina < 18) return "Dobré odpoledne";
  return "Dobrý večer";
}

/** Celé oslovení: „Dobré odpoledne, Marku". Bez jména jen pozdrav. */
export function osloveni(celeJmeno: string, hodina: number): string {
  const jmeno = vokativ(krestni(celeJmeno));
  return jmeno ? `${pozdrav(hodina)}, ${jmeno}` : pozdrav(hodina);
}
