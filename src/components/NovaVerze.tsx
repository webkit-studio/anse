import { useEffect, useState } from "react";

const CHECK_EVERY_MS = 5 * 60_000;
const BUNDLE_RE = /\/assets\/index-[\w-]+\.js/;

/** Bundle, který tahle záložka opravdu běží (v dev režimu žádný není). */
function loadedBundle(): string | null {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.src;
  return src ? (BUNDLE_RE.exec(src)?.[0] ?? null) : null;
}

/**
 * Lišta „nová verze". Záložka otevřená přes nasazení dál běží starý kód
 * proti novému API — ukládání pak může tiše selhat. Při návratu do okna
 * a každých pár minut se proto porovná bundle v aktuálním index.html
 * s tím, který běží. Sama se neobnoví, ať nikdo nepřijde o rozepsaný formulář.
 */
export function NovaVerze() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const current = loadedBundle();
    if (!current) return undefined;

    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const html = await (await fetch("/", { cache: "no-store" })).text();
        const latest = BUNDLE_RE.exec(html)?.[0];
        if (latest && latest !== current) setStale(true);
      } catch {
        // bez signálu se zkusí příště
      } finally {
        busy = false;
      }
    }

    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  if (!stale) return null;
  return (
    <div className="nova-verze" role="status">
      <span>Je tu nová verze aplikace.</span>
      <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
        Načíst
      </button>
    </div>
  );
}
