import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Spinner } from "./ui";
import mapa from "../navody-mapa.json";

// Návody dodavatele: manifesty a výkresy scrapované z veřejného webu výrobce,
// servírované staticky z /navody/*. Overlay se otevírá nad formulářem položky
// (vpravo nahoře při zaměřování) — rozepsaná položka zůstává uložená.
//
// Datový formát: index.json (katalog), <slug>/<manifest>.json (sekce
// s výkresy). `popisky` jsou jen pro fulltext (na výkresu už jsou), sekce
// s `pokracovani` se lepí k předchozí, `prevzato_z` značí dokument sdílený
// mezi produkty.

interface NavodyDoc {
  soubor: string;
  nazev: string;
  manifest: string;
  sekci: number;
  prevzato_z?: string;
}
interface NavodyProduct {
  slug: string;
  nazev: string;
  kategorie: string;
  dokumenty: NavodyDoc[];
}
interface NavodSekce {
  id: string;
  strana: number;
  pokracovani: boolean;
  h1: string | null;
  h2: string | null;
  krok: string | null;
  varianta: string | null;
  nadpis: string | null;
  popisky: string[];
  poznamky: string[];
  kotace: string[];
  obrazek: string;
}
interface FulltextRow {
  produkt: string;
  dokument: string;
  sekce: string;
  nadpis: string;
  text: string;
}

const MAPA = mapa as Record<string, string[]>;

/** Návody napárované na podkategorii (konfig_key, u ručních definic kód). */
export function navodySlugsFor(sub?: { konfig_key?: string | null; code: string }): string[] {
  if (!sub) return [];
  return (sub.konfig_key ? MAPA[sub.konfig_key] : undefined) ?? MAPA[sub.code] ?? [];
}

/** Statický JSON; SPA fallback vrací index.html — to je „soubor chybí". */
async function fetchStatic<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) throw new Error("Soubor návodu není nahraný.");
  return (await res.json()) as T;
}

function useNavodyIndex() {
  return useQuery({
    queryKey: ["navody", "index"],
    queryFn: () => fetchStatic<{ produkty: NavodyProduct[] }>("/navody/index.json"),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

function useNavodManifest(slug: string | null, manifest: string | null) {
  return useQuery({
    queryKey: ["navody", slug, manifest],
    queryFn: () => fetchStatic<{ sekce: NavodSekce[] }>(`/navody/${slug}/${manifest}`),
    enabled: Boolean(slug && manifest),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

function useFulltext(enabled: boolean) {
  return useQuery({
    queryKey: ["navody", "fulltext"],
    queryFn: () => fetchStatic<FulltextRow[]>("/navody/fulltext.json"),
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: 1,
  });
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Vyměřovací/montážní návod patří na první místo, příplatky a reklamace dozadu. */
function docWeight(d: NavodyDoc): number {
  const n = norm(d.nazev);
  if (n.includes("vymerovaci") || n.includes("montazni")) return 0;
  if (n.includes("priplatky")) return 2;
  if (n.includes("reklamac")) return 3;
  return 1;
}

function docLabel(d: NavodyDoc): string {
  return d.nazev.replace(/\s*\(pdf\)\s*$/i, "");
}

/** Sekce s pokračováním se slijí do jedné (obrázky za sebou). */
function mergeSekce(sekce: NavodSekce[]): (NavodSekce & { obrazky: string[] })[] {
  const out: (NavodSekce & { obrazky: string[] })[] = [];
  for (const s of sekce) {
    const last = out[out.length - 1];
    if (s.pokracovani && last) {
      last.obrazky.push(s.obrazek);
      last.poznamky = [...last.poznamky, ...s.poznamky];
      continue;
    }
    out.push({ ...s, obrazky: [s.obrazek], poznamky: [...s.poznamky] });
  }
  return out;
}

export function NavodOverlay({
  slugs,
  fallbackText,
  onClose,
}: {
  slugs: string[];
  /** Poznámka kanceláře k produktu — ukáže se nad návody (a když návody nejsou). */
  fallbackText?: string;
  onClose: () => void;
}) {
  const index = useNavodyIndex();
  const [slug, setSlug] = useState<string | null>(slugs[0] ?? null);
  const [manifest, setManifest] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const products = useMemo(() => {
    const all = index.data?.produkty ?? [];
    return slugs.map((s) => all.find((p) => p.slug === s)).filter((p): p is NavodyProduct => Boolean(p));
  }, [index.data, slugs]);

  const current = products.find((p) => p.slug === slug) ?? products[0];
  const docs = useMemo(
    () => [...(current?.dokumenty ?? [])].sort((a, b) => docWeight(a) - docWeight(b)),
    [current],
  );
  const activeManifest = manifest ?? docs[0]?.manifest ?? null;
  const doc = useNavodManifest(current?.slug ?? null, activeManifest);

  const fulltext = useFulltext(q.trim().length >= 2);
  const hits = useMemo(() => {
    const query = norm(q.trim());
    if (query.length < 2 || !fulltext.data) return null;
    const mine = new Set(slugs);
    return fulltext.data
      .filter((r) => mine.has(r.produkt) && norm(`${r.nadpis ?? ""} ${r.text ?? ""}`).includes(query))
      .slice(0, 30);
  }, [q, fulltext.data, slugs]);

  // skok na sekci z výsledku hledání — až po načtení manifestu
  useEffect(() => {
    if (!jumpTo || doc.isPending) return;
    const el = bodyRef.current?.querySelector(`[data-sekce="${jumpTo}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setJumpTo(null);
    }
  }, [jumpTo, doc.isPending, doc.data]);

  function openHit(r: FulltextRow) {
    const p = products.find((x) => x.slug === r.produkt);
    const d = p?.dokumenty.find((x) => x.soubor === r.dokument);
    if (!p || !d) return;
    setSlug(p.slug);
    setManifest(d.manifest);
    setJumpTo(r.sekce);
    setQ("");
  }

  const merged = doc.data ? mergeSekce(doc.data.sekce) : [];
  let lastH1: string | null = null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Návod k produktu">
      <div className="overlay-head">
        <strong>Návod</strong>
        <Button variant="ghost" onClick={onClose}>
          Zavřít
        </Button>
      </div>
      <div className="overlay-body" ref={bodyRef}>
        <p className="overlay-hint">Rozepsaná položka zůstává uložená.</p>

        {fallbackText && (
          <div className="card card-pad navod-note" style={{ whiteSpace: "pre-wrap" }}>
            {fallbackText}
          </div>
        )}

        {slugs.length > 0 && (
          <>
            <input
              type="search"
              className="sheet-search"
              placeholder="Hledat v návodech…"
              aria-label="Hledat v návodech"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            {hits && (
              <div className="navod-hits">
                {hits.map((r, i) => (
                  <button key={i} type="button" className="navod-hit" onClick={() => openHit(r)}>
                    <span className="navod-hit-title">{r.nadpis || "Bez nadpisu"}</span>
                    <span className="muted t-caption">
                      {products.find((p) => p.slug === r.produkt)?.nazev} ·{" "}
                      {docLabel(
                        products.find((p) => p.slug === r.produkt)?.dokumenty.find((d) => d.soubor === r.dokument) ?? {
                          nazev: r.dokument,
                        } as NavodyDoc,
                      )}
                    </span>
                  </button>
                ))}
                {hits.length === 0 && <p className="muted t-body-s">Nic nenalezeno.</p>}
              </div>
            )}
            {q.trim().length >= 2 && fulltext.isPending && <Spinner />}

            {!hits && (
              <>
                {index.isPending && <Spinner />}
                {index.isError && (
                  <p className="muted t-body-s">Katalog návodů se nepodařilo načíst.</p>
                )}
                {!index.isPending && !index.isError && products.length === 0 && (
                  <p className="muted t-body-s">Návod k tomuto produktu zatím není nahraný.</p>
                )}

                {products.length > 1 && (
                  <div className="chips chips-scroll" role="group" aria-label="Varianta produktu">
                    {products.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        className={`chip ${p.slug === current?.slug ? "chip-active" : ""}`}
                        onClick={() => {
                          setSlug(p.slug);
                          setManifest(null);
                        }}
                      >
                        {p.nazev}
                      </button>
                    ))}
                  </div>
                )}

                {docs.length > 1 && (
                  <div className="chips chips-scroll" role="group" aria-label="Dokument">
                    {docs.map((d) => (
                      <button
                        key={d.manifest}
                        type="button"
                        className={`chip ${d.manifest === activeManifest ? "chip-active" : ""}`}
                        onClick={() => setManifest(d.manifest)}
                      >
                        {docLabel(d)}
                      </button>
                    ))}
                  </div>
                )}

                {doc.isPending && activeManifest && <Spinner />}
                {doc.isError && (
                  <p className="muted t-body-s">
                    Tenhle dokument zatím není nahraný — doplní se s dalšími podklady.
                  </p>
                )}

                {merged.map((s) => {
                  const h1 = s.h1 && s.h1 !== lastH1 ? s.h1 : null;
                  if (s.h1) lastH1 = s.h1;
                  const title = s.krok ?? s.nadpis ?? s.h2 ?? "";
                  const notes = [...new Set(s.poznamky.filter((p) => p.trim().length >= 8))];
                  return (
                    <div key={s.id} data-sekce={s.id}>
                      {h1 && <h2 className="navod-h1">{h1}</h2>}
                      <section className="card navod-sekce">
                        {(title || s.varianta) && (
                          <div className="navod-sekce-head">
                            {title && <h3 className="navod-sekce-title">{title}</h3>}
                            {s.varianta && <span className="badge tone-wait">Varianta {s.varianta}</span>}
                          </div>
                        )}
                        {s.obrazky.map((img) => (
                          <img
                            key={img}
                            className="navod-img"
                            src={`/navody/${current!.slug}/${img}`}
                            alt={title || "Výkres"}
                            loading="lazy"
                          />
                        ))}
                        {notes.map((n, i) => (
                          <p key={i} className="muted t-body-s" style={{ margin: "6px 0 0" }}>
                            {n}
                          </p>
                        ))}
                      </section>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
