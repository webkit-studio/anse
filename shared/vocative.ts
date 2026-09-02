// 5. pád křestního jména („Dobré ráno, Marku").
//
// Proč vůbec: čeština oslovuje pátým pádem, a „Dobré ráno, Marek" zní jako
// z automatu. Seznam všech jmen se ale nahrát nedá — je to otevřená množina.
// Řeší se to tedy PRAVIDLY podle zakončení (ta pokrývají drtivou většinu
// českých křestních jmen) a krátkým seznamem NEPRAVIDELNÝCH, kam patří:
//   1. jména s vypadávajícím -e- (Karel → Karle, Pavel → Pavle),
//   2. ženská jména zakončená na souhlásku (Dagmar, Ester…), kde by pravidlo
//      pro mužský rod udělalo „Dagmare".
// Když se objeví jméno, které pravidla zkomolí, přidá se jeden řádek sem.

/** Jména, která pravidla netrefí. Klíč je malými písmeny bez ohledu na zápis. */
const NEPRAVIDELNA: Record<string, string> = {
  // vypadávající -e- v kmeni
  karel: "Karle",
  pavel: "Pavle",
  havel: "Havle",
  vavřinec: "Vavřinče",
  // ženská jména na souhlásku — pátý pád se u nich neliší od prvního
  dagmar: "Dagmar",
  ester: "Ester",
  karin: "Karin",
  miriam: "Miriam",
  ingrid: "Ingrid",
  rút: "Rút",
  ruth: "Ruth",
  nikol: "Nikol",
  rachel: "Rachel",
  sarah: "Sarah",
  jasmin: "Jasmín",
  doris: "Doris",
  // mužská jména, která zůstávají beze změny
  ivo: "Ivo",
  hugo: "Hugo",
  oto: "Oto",
  otto: "Otto",
  bruno: "Bruno",
};

const SAMOHLASKY = "aáeéěiíoóuúůyý";

/** Zakončení, po kterých se přidává -i (měkké souhlásky). */
const MEKKE = ["š", "ž", "č", "ř", "j", "ď", "ť", "ň", "c", "s"];

/**
 * Vrátí jméno v 5. pádu. Nezná-li si rady, vrátí jméno beze změny —
 * oslovit prvním pádem je pořád lepší než vyrobit patvar.
 */
export function vokativ(jmeno: string): string {
  const n = jmeno.trim();
  if (n === "") return "";

  const zvlast = NEPRAVIDELNA[n.toLowerCase()];
  if (zvlast) return zvlast;

  const posledni = n.slice(-1).toLowerCase();
  const predposledni = n.slice(-2, -1).toLowerCase();

  // Samohláskové konce
  if (posledni === "a") return `${n.slice(0, -1)}o`; // Jana → Jano, Honza → Honzo
  if (SAMOHLASKY.includes(posledni)) return n; // Marie, Jiří, Ivo, Hugo

  // Zakončení, která mění kmen
  if (n.toLowerCase().endsWith("něk")) return `${n.slice(0, -3)}ňku`; // Zdeněk → Zdeňku
  if (n.toLowerCase().endsWith("ek")) return `${n.slice(0, -2)}ku`; // Marek → Marku
  if (n.toLowerCase().endsWith("ec")) return `${n.slice(0, -2)}če`; // Kupec → Kupče
  if (n.toLowerCase().endsWith("ch")) return `${n}u`; // Vojtěch → Vojtěchu
  if (n.toLowerCase().endsWith("el")) return `${n}i`; // Daniel → Danieli

  // Tvrdé zadopatrové: -k, -g, -h → -u
  if (posledni === "k" || posledni === "g" || posledni === "h") return `${n}u`;

  // -r: po souhlásce měkne (Petr → Petře), po samohlásce ne (Viktor → Viktore)
  if (posledni === "r") {
    return SAMOHLASKY.includes(predposledni) ? `${n}e` : `${n.slice(0, -1)}ře`;
  }

  // Měkké souhlásky → -i
  if (MEKKE.includes(posledni)) return `${n}i`;

  // Ostatní souhlásky → -e (Jakub → Jakube, Martin → Martine, Michal → Michale)
  if (/[a-záčďéěíňóřšťúůýž]/i.test(posledni)) return `${n}e`;

  return n;
}

/** Křestní jméno z celého jména („Jakub Svoboda" → „Jakub"). */
export function krestni(celeJmeno: string): string {
  return celeJmeno.trim().split(/\s+/)[0] ?? "";
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
