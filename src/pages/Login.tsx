import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { VLASTNI_KOD_MAX, chybaPrihlasovacihoKodu, samoOdeslat } from "@shared/codes";
import { useLogin, useMe } from "../api/hooks";
import { Logo } from "../components/Logo";

/**
 * Kam po přihlášení. Bere se z routeru (RequireAuth), ale do
 * window.location jde jen adresa na stejném originu — nikdy cizí web.
 * Parsuje se přes URL: prohlížeč z adresy vypouští tabulátory a konce řádků,
 * takže kontrola samotného řetězce by šla obejít.
 */
function safeFrom(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/login")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

// L01 #6: kód je pro správce hesel „heslo" — skutečný <form> se submitem,
// pole type=password s autocomplete=current-password a vedle něj skryté pole
// username. iCloud Klíčenka a Google pak kód nabídnou uložit a příště doplní
// přes Face ID / otisk.
// S05 #7: kód může být i vlastní (8–64 znaků, písmena) — klávesnice je proto
// textová. Šestá číslice odesílá sama dál (vlastní kód šesti číslicemi začínat
// nesmí), doplněný kód (správce hesel) se odešle hned, ručně psaný vlastní kód
// potvrdí Enter nebo tlačítko.
export default function LoginPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const login = useLogin();
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  /** Brzda dvojího odeslání — isPending z renderu je ve stejném tiku ještě false. */
  const sending = useRef(false);
  const from = safeFrom((location.state as { from?: unknown } | null)?.from);

  useEffect(() => {
    // Po chybě zpátky do pole — až po překreslení, během odesílání je vypnuté.
    if (error) inputRef.current?.focus();
  }, [error]);

  useEffect(() => {
    // Už přihlášený (otevřel /login ručně) → rovnou dál. Během vlastního
    // přihlášení ne: tam odchází skutečná navigace níž.
    if (me.data && !sending.current) navigate(from, { replace: true });
  }, [me.data, from, navigate]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current) return;
    // Hodnota z DOM, ne ze stavu: při automatickém odeslání React stav ještě
    // nemusí být překreslený.
    const value = (inputRef.current?.value ?? "").replace(/\s/g, "");
    const chyba = chybaPrihlasovacihoKodu(value);
    if (chyba) {
      setError(chyba);
      return;
    }
    sending.current = true;
    setError(null);
    login.mutate(value, {
      onSuccess: () => {
        setLeaving(true);
        // Skutečná navigace, ne jen změna routy: odeslaný formulář + odchod
        // ze stránky berou správci hesel jako úspěšné přihlášení.
        window.location.replace(from);
      },
      onError: (err) => {
        sending.current = false;
        setError(err instanceof Error ? err.message : "Přihlášení se nepodařilo.");
        setCode("");
      },
    });
  }

  /** Skutečný submit (ne jen volání funkce), ať ho správce hesel zaznamená. */
  function odeslat() {
    const form = formRef.current;
    if (form && typeof form.requestSubmit === "function") form.requestSubmit();
    else submitRef.current?.click();
  }

  function onChange(raw: string) {
    const next = raw.replace(/\s/g, "").slice(0, VLASTNI_KOD_MAX);
    const odeslatHned = samoOdeslat(code, next);
    setCode(next);
    setError(null);
    if (odeslatHned) odeslat();
  }

  const busy = login.isPending || leaving;

  return (
    <main className="login-page">
      {/* method=post: kdyby se onSubmit někdy nespustil, kód nesmí skončit v URL. */}
      <form ref={formRef} className="login-card" method="post" onSubmit={onSubmit} noValidate>
        <h1 className="login-logo" aria-label="Anse">
          <Logo height={26} />
        </h1>
        <p className="login-subtitle">Interní aplikace pro zakázky</p>

        {/* Pro správce hesel: k čemu kód patří (položka „Anse" v Klíčence).
            Nevidí ho oko ani čtečka, na server nejde. */}
        <input
          className="visually-hidden"
          type="text"
          name="username"
          autoComplete="username"
          defaultValue="Anse"
          tabIndex={-1}
          aria-hidden="true"
        />

        <label className="field-label" htmlFor="login-code">
          Přihlašovací kód
        </label>
        <input
          ref={inputRef}
          id="login-code"
          name="password"
          className={`login-code-input ${error ? "input-error" : ""}`}
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          maxLength={VLASTNI_KOD_MAX}
          autoFocus
          placeholder="······"
          value={code}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? "login-error" : undefined}
        />
        {error && (
          <p id="login-error" className="field-msg field-msg-error" role="alert">
            {error}
          </p>
        )}
        {/* Enter v poli potřebuje odesílací tlačítko (formulář má dvě pole).
            Vlastní kód se potvrzuje ručně, proto je vidět. */}
        <button ref={submitRef} type="submit" className="btn btn-primary login-submit" disabled={busy}>
          {busy ? "Přihlašuji…" : "Přihlásit"}
        </button>
      </form>
    </main>
  );
}
