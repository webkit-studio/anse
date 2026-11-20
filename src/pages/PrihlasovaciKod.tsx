import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  KOD_NEJDE_POUZIT,
  VLASTNI_KOD_MAX,
  VLASTNI_KOD_MIN,
  chybaTvaruVlastnihoKodu,
  jeSlabyVlastniKod,
  normalizujKod,
} from "@shared/codes";
import { ApiFetchError } from "../api/client";
import { useMe, useZmenaKodu } from "../api/hooks";
import { OfficeShell, TechDetail } from "../components/Shell";
import { Button, Field, type FieldMessage } from "../components/ui";

// Nastavení → Přihlašovací kód (S05, issue #7). Uživatel si nastaví vlastní
// kód místo vygenerovaného. Formulář je pro správce hesel „změna hesla":
// pole username (stejné „Anse" jako na přihlášení), current-password
// a new-password — Klíčenka i Google pak nabídnou uložený kód aktualizovat.

type Chyby = { current?: string; code?: string; again?: string; form?: string };

const POLE: Record<Exclude<keyof Chyby, "form">, string> = {
  current: "kod-soucasny",
  code: "kod-novy",
  again: "kod-znovu",
};

function zpravy(text: string | undefined): FieldMessage[] {
  return text ? [{ level: "error", message: text }] : [];
}

/** Atributy pro pole kódu: bez velkých písmen a oprav na mobilu. */
const KOD_INPUT = {
  type: "password",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  maxLength: VLASTNI_KOD_MAX,
} as const;

function KodPanel() {
  const location = useLocation();
  const zmeneno = new URLSearchParams(location.search).has("zmeneno");
  const zmena = useZmenaKodu();
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [again, setAgain] = useState("");
  const [chyby, setChyby] = useState<Chyby>({});
  const [odchazi, setOdchazi] = useState(false);
  const busy = zmena.isPending || odchazi;

  useEffect(() => {
    // Po chybě kurzor do prvního pole, které ji má.
    const prvni = (["current", "code", "again"] as const).find((k) => chyby[k]);
    if (prvni) document.getElementById(POLE[prvni])?.focus();
  }, [chyby]);

  function zkontroluj(): Chyby {
    const c: Chyby = {};
    const soucasny = normalizujKod(current);
    const novy = normalizujKod(code);
    if (!soucasny) c.current = "Zadej současný kód.";
    const tvar = chybaTvaruVlastnihoKodu(novy);
    if (tvar) c.code = tvar;
    else if (novy === soucasny) c.code = "Nový kód je stejný jako současný.";
    else if (jeSlabyVlastniKod(novy)) c.code = KOD_NEJDE_POUZIT;
    else if (normalizujKod(again) !== novy) c.again = "Kódy se neshodují.";
    return c;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const c = zkontroluj();
    setChyby(c);
    if (Object.keys(c).length > 0) return;
    zmena.mutate(
      { current, code },
      {
        onSuccess: () => {
          setOdchazi(true);
          // Skutečná navigace jako po přihlášení (L01): odeslaný formulář
          // a odchod ze stránky berou správci hesel jako změnu hesla.
          window.location.replace(`${location.pathname}?zmeneno=1`);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Kód se nepodařilo změnit.";
          const pole = err instanceof ApiFetchError ? err.pole : undefined;
          if (pole === "current") {
            setCurrent("");
            setChyby({ current: msg });
          } else if (pole === "code") {
            setChyby({ code: msg });
          } else {
            setChyby({ form: msg });
          }
        },
      },
    );
  }

  return (
    <div className="kod-panel">
      {zmeneno && (
        <p className="field-msg field-msg-info" role="status">
          Kód je změněný. Na ostatních zařízeních se odhlásíš, tady zůstáváš přihlášený. Když
          telefon nabídne uložit nové heslo, potvrď to.
        </p>
      )}
      <form className="card card-pad kod-form" method="post" onSubmit={onSubmit} noValidate>
        <p className="t-body" style={{ margin: 0 }}>
          Místo vygenerovaného kódu si můžeš nastavit vlastní, který si zapamatuješ.
        </p>

        {/* Pro správce hesel: ke které položce kód patří (stejně jako na přihlášení). */}
        <input
          className="visually-hidden"
          type="text"
          name="username"
          autoComplete="username"
          defaultValue="Anse"
          tabIndex={-1}
          aria-hidden="true"
        />

        <Field label="Současný kód" htmlFor={POLE.current} messages={zpravy(chyby.current)}>
          <input
            {...KOD_INPUT}
            id={POLE.current}
            name="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>

        <Field label="Nový kód" htmlFor={POLE.code} messages={zpravy(chyby.code)}>
          <p className="field-help" id="kod-novy-napoveda">
            Aspoň {VLASTNI_KOD_MIN} znaků, mezi prvními šesti aspoň jedno písmeno. Písmena bez
            diakritiky, číslice nebo znaky. Žádné řady ani opakování jako abcdefgh nebo aaaaaaaa.
            Na velikosti písmen nezáleží.
          </p>
          <input
            {...KOD_INPUT}
            id={POLE.code}
            name="new-password"
            autoComplete="new-password"
            aria-describedby="kod-novy-napoveda"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>

        <Field label="Nový kód znovu" htmlFor={POLE.again} messages={zpravy(chyby.again)}>
          <input
            {...KOD_INPUT}
            id={POLE.again}
            name="new-password-again"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </Field>

        {chyby.form && (
          <p className="field-msg field-msg-error" role="alert">
            {chyby.form}
          </p>
        )}

        <Button type="submit" variant="primary" className="kod-ulozit" disabled={busy}>
          {busy ? "Ukládám…" : "Uložit nový kód"}
        </Button>
        <p className="muted t-body-s" style={{ margin: 0 }}>
          Po uložení se odhlásíš na ostatních zařízeních. Když kód zapomeneš, kancelář ti
          v Nastavení → Účty vydá nový.
        </p>
      </form>
    </div>
  );
}

export default function PrihlasovaciKodPage() {
  const me = useMe();
  // Stejně jako Kalendář: kancelář má Nastavení v railu, technik se sem
  // dostane ze Zprávy → Nastavení (vlastní Nastavení nemá).
  if (me.data?.role === "kancelar") {
    return (
      <OfficeShell title="Přihlašovací kód" subtitle="Vlastní kód místo vygenerovaného">
        <KodPanel />
      </OfficeShell>
    );
  }
  return (
    <TechDetail back="/" backLabel="Dnes">
      <h1 className="t-title" style={{ margin: "4px 0 0" }}>
        Přihlašovací kód
      </h1>
      <KodPanel />
    </TechDetail>
  );
}
