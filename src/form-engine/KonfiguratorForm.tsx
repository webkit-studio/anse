import { useEffect, useMemo, useRef, useState } from "react";
import type { Params } from "@shared/form-schema";
import type { Issue } from "@shared/form-engine";
import {
  evaluateDerivedLimits,
  evaluateKonfig,
  ruleIndex,
  validateKonfig,
  validateSuysDimensions,
  type KonfigField,
  type KonfigProduct,
  type KonfigState,
} from "@shared/konfigurator";
import {
  Button,
  Field,
  NumberInput,
  SelectSheet,
  Textarea,
  TextInput,
  type FieldMessage,
} from "../components/ui";

// Formulář řízený naměřenými podklady dodavatele (konfigurátor).
// Stejné chování i vzhled jako DefinitionForm; liší se jen zdroj pravdy:
// pole a pravidla přijdou z /api/konfigurator/:key a vyhodnocuje je
// shared/konfigurator (identicky na klientu i serveru).
//
// Zamčená pole se NEVYKRESLUJÍ — dodavatel jimi říká „v téhle kombinaci
// nedává smysl" a technika nemají zdržovat. Server je stejně nevaliduje.

export interface KonfiguratorFormProps {
  product: KonfigProduct;
  initialParams: Params;
  initialNote: string;
  title: string;
  submitLabel: string;
  busy?: boolean;
  serverIssues?: Issue[];
  savedLabel?: string;
  offline?: boolean;
  children?: React.ReactNode;
  onSubmit: (params: Params, note: string) => void;
  onChange?: (params: Params, note: string) => void;
}

/**
 * Výchozí stav: uložené hodnoty jako stringy. Prázdný formulář se předvyplní
 * výchozími hodnotami dodavatele — naměřená pravidla (viditelnost, zámky)
 * platí právě od tohoto výchozího nastavení konfigurátoru. Rozměry výchozí
 * hodnoty nemají, ty technik vždy zadává sám.
 */
function initState(product: KonfigProduct, initial: Params): KonfigState {
  const state: KonfigState = {};
  for (const [k, v] of Object.entries(initial)) {
    if (v !== undefined && v !== null && String(v) !== "") state[k] = String(v);
  }
  if (Object.keys(state).length === 0) {
    for (const f of product.fields) {
      // Povinná čísla se nepředvyplňují — rozměry musí technik změřit a napsat
      // sám (SUYS má u šířky/výšky výchozí 1000, to by svádělo k neměření).
      // Nepovinná čísla (množství 1 ks) zůstávají pohodlím.
      if (f.input === "number" && f.required) continue;
      if (f.defaultVisible && f.defaultValue.trim() !== "") state[f.code] = f.defaultValue;
    }
  }
  return state;
}

function isFilled(state: KonfigState, code: string): boolean {
  return (state[code] ?? "").trim() !== "";
}

export function KonfiguratorForm({
  product,
  initialParams,
  initialNote,
  title,
  submitLabel,
  busy = false,
  serverIssues = [],
  savedLabel,
  offline = false,
  children,
  onSubmit,
  onChange,
}: KonfiguratorFormProps) {
  const [state, setState] = useState<KonfigState>(() => initState(product, initialParams));
  const [note, setNote] = useState(initialNote);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [dirtySinceServer, setDirtySinceServer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const evaluated = useMemo(() => evaluateKonfig(product, state), [product, state]);
  // Stálé číslo pole pro zpětnou vazbu při testování — přes všechna pole
  // produktu, aby číslo drželo, i když se část polí zrovna schová.
  const fieldNum = useMemo(
    () => new Map(product.fields.map((f, i) => [f.code, i + 1])),
    [product],
  );
  const issues = useMemo(() => {
    const { issues: base } = validateKonfig(product, state);
    const dims = product.dodavatel === "suys" ? validateSuysDimensions(product, state) : [];
    return [...base, ...dims];
  }, [product, state]);
  // Živé limity SUYS („max. šířka pro zvolenou látku") — nápověda u rozměru.
  const derived = useMemo(
    () => (product.dodavatel === "suys" ? evaluateDerivedLimits(product, state) : []),
    [product, state],
  );

  const activeServerIssues = dirtySinceServer ? [] : serverIssues;

  // Pole, které se právě vyplňuje: viditelné, odemčené, ne tbd-select.
  const fillable = useMemo(() => {
    return product.fields.filter((f) => {
      const fe = evaluated.fields[f.code]!;
      return fe.visible && !fe.locked;
    });
  }, [product, evaluated]);

  const required = fillable.filter((f) => evaluated.fields[f.code]!.required);
  const missing = required.filter((f) => !isFilled(state, f.code));
  const doneCount = required.length - missing.length;
  const progress = required.length ? Math.round((doneCount / required.length) * 100) : 100;

  function setValue(code: string, value: string) {
    setState((prev) => {
      let next: KonfigState = { ...prev, [code]: value };
      // setsValue pravidla se aplikují při změně spouštěcího pole — stejně
      // jako v konfigurátoru dodavatele (typicky mažou hodnotu zamčeného pole).
      const rule = ruleIndex(product).get(code, value);
      if (rule) {
        for (const s of rule.sets) {
          if ((next[s.field] ?? "") !== s.to) next = { ...next, [s.field]: s.to };
        }
      }
      return next;
    });
    setDirtySinceServer(true);
  }

  useEffect(() => {
    onChange?.(state, note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, note]);

  useEffect(() => {
    setDirtySinceServer(false);
  }, [serverIssues]);

  function markTouched(code: string) {
    setTouched((t) => (t.has(code) ? t : new Set(t).add(code)));
  }

  function messagesFor(code: string): FieldMessage[] {
    const show = attempted || touched.has(code);
    const own = issues
      .filter((i) => i.fieldCode === code)
      .filter((i) => i.level !== "error" || show)
      .map((i) => ({ level: i.level, message: i.message }));
    const server = activeServerIssues
      .filter((i) => i.fieldKey === code)
      .map((i) => ({ level: i.level, message: i.message }));
    return [...own, ...server];
  }

  function scrollTo(selector: string) {
    formRef.current
      ?.querySelector(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleSubmit() {
    if (busy) return;
    setAttempted(true);
    const blocking =
      issues.some((i) => i.level === "error") || missing.length > 0;
    if (blocking) {
      setTimeout(() => scrollTo(".field-invalid"), 30);
      return;
    }
    // Odesílají se jen hodnoty aktuálně viditelných polí — hodnoty schované
    // pravidly nemají v objednávce co dělat (server by je ani nevalidoval).
    const out: KonfigState = {};
    for (const f of product.fields) {
      const fe = evaluated.fields[f.code]!;
      const v = (state[f.code] ?? "").trim();
      if (fe.visible && v !== "") out[f.code] = v;
    }
    onSubmit(out, note.trim());
  }

  /** Nápověda k rozsahu čísla — z pole nebo z živého limitu SUYS. */
  function numberHelp(f: KonfigField): string | undefined {
    const fe = evaluated.fields[f.code]!;
    const lim = derived.find((d) => d.targetField === f.code && d.value !== null);
    if (lim) return `Max. ${lim.value} mm pro zvolenou kombinaci`;
    if (fe.min !== null && fe.max !== null) return `Rozmezí ${fe.min}–${fe.max}`;
    if (fe.min !== null) return `Nejméně ${fe.min}`;
    if (fe.max !== null) return `Nejvýše ${fe.max}`;
    return undefined;
  }

  function renderField(f: KonfigField) {
    const fe = evaluated.fields[f.code]!;
    const id = `f-${f.code}`;
    const value = state[f.code] ?? "";
    // Pole odkryté/odemčené pravidlem dostane zelený pruh — je vidět, že přibylo.
    const revealed = !f.defaultVisible || f.defaultLocked;

    let control: JSX.Element;
    let help: string | undefined;
    if (f.input === "select" && fe.options.length > 0) {
      control = (
        <SelectSheet
          id={id}
          value={value}
          options={fe.options.map((o) => ({
            value: o.value,
            label: o.label,
            swatch: o.color,
          }))}
          placeholder="Vyber…"
          onChange={(v) => {
            setValue(f.code, v);
            markTouched(f.code);
          }}
        />
      );
    } else if (f.input === "number") {
      help = numberHelp(f);
      control = (
        <NumberInput
          id={id}
          value={value}
          decimal
          onChange={(e) => setValue(f.code, e.target.value)}
          onBlur={() => markTouched(f.code)}
        />
      );
    } else if (f.input === "textarea") {
      control = (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => setValue(f.code, e.target.value)}
          onBlur={() => markTouched(f.code)}
        />
      );
    } else {
      // text — a taky select, ke kterému podklady neměly žádné možnosti
      control = (
        <TextInput
          id={id}
          value={value}
          maxLength={f.maxLength ?? undefined}
          onChange={(e) => setValue(f.code, e.target.value)}
          onBlur={() => markTouched(f.code)}
        />
      );
    }

    return (
      <div key={f.code} className={revealed ? "field-revealed" : undefined}>
        <Field
          label={f.label}
          num={fieldNum.get(f.code)}
          htmlFor={id}
          required={fe.required}
          help={help}
          messages={messagesFor(f.code)}
        >
          {control}
        </Field>
      </div>
    );
  }

  // Skupiny podle sekcí dodavatele; pořadí sekcí i polí drží podklady.
  // Názvy sekcí obsahují mezery a diakritiku — kotvy jsou proto číslované.
  const groups = useMemo(() => {
    const order = [...product.sections];
    for (const f of product.fields) if (!order.includes(f.section)) order.push(f.section);
    return order
      .map((section, i) => ({
        section,
        anchor: `grp-k${i}`,
        fields: product.fields.filter((f) => f.section === section),
      }))
      .filter((g) => g.fields.length > 0);
  }, [product]);

  const generalServer = activeServerIssues.filter((i) => i.fieldKey === undefined);

  return (
    <>
      <div className="form-head">
        <div className="form-head-row">
          <span className="form-title">{title}</span>
          <span className="form-progress-label">
            Povinná {doneCount}/{required.length}
          </span>
        </div>
        <div className="progress-track">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="group-strip">
          {groups.map((g) => {
            const req = g.fields.filter((f) => {
              const fe = evaluated.fields[f.code]!;
              return fe.visible && !fe.locked && fe.required;
            });
            const done = req.filter((f) => isFilled(state, f.code)).length;
            const complete = req.length > 0 && done === req.length;
            return (
              <button
                key={g.section}
                type="button"
                className={`group-chip ${complete ? "group-chip-done" : ""}`}
                onClick={() => scrollTo(`#${g.anchor}`)}
              >
                {g.section}
                {req.length > 0 && !complete && ` ${done}/${req.length}`}
              </button>
            );
          })}
        </div>
      </div>

      <form
        ref={formRef}
        className="definition-form tech-body tech-body-footer"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <p className="required-legend">
          <span className="field-required">*</span> povinný údaj
        </p>
        {groups.map((g) => {
          const visible = g.fields.filter((f) => {
            const fe = evaluated.fields[f.code]!;
            return fe.visible && !fe.locked;
          });
          if (visible.length === 0) return null;
          return (
            <section key={g.section} id={g.anchor} className="form-group">
              <h2 className="form-group-title">{g.section}</h2>
              {visible.map((f) => renderField(f))}
            </section>
          );
        })}

        {/* Dodavatelé mají vlastní pole pro poznámku (SUYS „Poznámka pozice"),
            které jde do jejich konfigurátoru. Tahle je naše — proto se jmenuje
            jinak, ať technik nehádá, do které psát. */}
        <section className="form-group">
          <h2 className="form-group-title" id="f-note-label">
            Interní poznámka
          </h2>
          <div className="field">
            <p className="field-help" style={{ marginTop: 0 }}>
              Vidí ji kancelář a je na montážním listu. Dodavateli se neposílá.
            </p>
            <Textarea
              id="f-note"
              aria-labelledby="f-note-label"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setDirtySinceServer(true);
              }}
              placeholder="Cokoli k této položce pro kancelář…"
            />
          </div>
        </section>

        {children}

        {generalServer.length > 0 && (
          <div className="form-issues">
            {generalServer.map((i, idx) => (
              <p key={idx} className={`field-msg field-msg-${i.level}`}>
                {i.message}
              </p>
            ))}
          </div>
        )}
      </form>

      <div className="form-foot">
        {attempted && missing.length > 0 ? (
          <>
            <span className="form-foot-note" style={{ color: "var(--c-error)", fontWeight: 600 }}>
              Chybí {missing.length}{" "}
              {missing.length === 1 ? "povinné pole" : missing.length < 5 ? "povinná pole" : "povinných polí"}
            </span>
            <div className="error-chips">
              {missing.slice(0, 6).map((f) => (
                <button
                  key={f.code}
                  type="button"
                  className="error-chip"
                  onClick={() => scrollTo(`#f-${f.code}`)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <span className={`form-foot-note ${offline ? "form-foot-note-offline" : ""}`}>
            {offline
              ? "Uloženo v telefonu, odešle se po připojení"
              : (savedLabel ?? "Rozepsaná položka zůstává uložená")}
          </span>
        )}
        <Button variant="primary" className="btn-block" disabled={busy} onClick={handleSubmit}>
          {busy ? "Ukládám…" : submitLabel}
        </Button>
      </div>
    </>
  );
}
