import { useEffect, useMemo, useRef, useState } from "react";
import type { Field as FieldDef, FormDefinition, Params } from "@shared/form-schema";
import {
  evalConds,
  hasBlocking,
  isFieldVisible,
  validateItem,
  type Issue,
} from "@shared/form-engine";
import {
  Button,
  Field,
  NumberInput,
  SelectSheet,
  Textarea,
  TextInput,
  type FieldMessage,
} from "../components/ui";

export interface DefinitionFormProps {
  definition: FormDefinition;
  initialParams: Params;
  initialNote: string;
  /** Nadpis v hlavičce formuláře — „Okenní síť · Kuchyně". */
  title: string;
  submitLabel: string;
  busy?: boolean;
  /** Chyby vrácené serverem (422) — zobrazí se, dokud uživatel formulář nezmění. */
  serverIssues?: Issue[];
  /** Text indikátoru autosave v patce. */
  savedLabel?: string;
  offline?: boolean;
  /** Fotky položky a další obsah pod skupinami. */
  children?: React.ReactNode;
  onSubmit: (params: Params, note: string) => void;
  onChange?: (params: Params, note: string) => void;
  autoFocusFirst?: boolean;
}

/** Povinná pole viditelná při aktuálních hodnotách (skrytá se nevalidují). */
function requiredVisible(definition: FormDefinition, params: Params): FieldDef[] {
  return definition.groups
    .flatMap((g) => g.fields)
    .filter((f) => !f.tbd && isFieldVisible(f, params))
    .filter((f) => f.required === true || (f.requiredIf !== undefined && evalConds(f.requiredIf, params)));
}

function isFilled(params: Params, key: string): boolean {
  const v = params[key];
  return v !== undefined && v !== null && String(v).trim() !== "";
}

export function DefinitionForm({
  definition,
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
  autoFocusFirst = true,
}: DefinitionFormProps) {
  const [params, setParams] = useState<Params>(initialParams);
  const [note, setNote] = useState(initialNote);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [dirtySinceServer, setDirtySinceServer] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const validation = useMemo(
    () => validateItem(definition, params, note),
    [definition, params, note],
  );

  // Stálé číslo pole pro zpětnou vazbu při testování („skryj 12, 31") —
  // přes všechna pole definice, aby číslo drželo i při schovaných polích.
  const fieldNum = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const g of definition.groups) for (const f of g.fields) m.set(f.key, ++i);
    return m;
  }, [definition]);

  const activeServerIssues = dirtySinceServer ? [] : serverIssues;
  const allIssues = [...validation.issues, ...activeServerIssues];

  // Postup: kolik povinných polí je hotových (počítá se jen z viditelných).
  const required = requiredVisible(definition, params);
  const missing = required.filter((f) => !isFilled(params, f.key));
  const doneCount = required.length - missing.length;
  const progress = required.length ? Math.round((doneCount / required.length) * 100) : 100;

  function setValue(key: string, value: string) {
    setParams((p) => ({ ...p, [key]: value }));
    setDirtySinceServer(true);
  }

  useEffect(() => {
    onChange?.(params, note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, note]);

  useEffect(() => {
    setDirtySinceServer(false);
  }, [serverIssues]);

  function markTouched(key: string) {
    setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));
  }

  function messagesFor(key: string): FieldMessage[] {
    const show = attempted || touched.has(key);
    return allIssues
      .filter((i) => i.fieldKey === key)
      .filter((i) => i.level !== "error" || show)
      .map((i) => ({ level: i.level, message: i.message }));
  }

  const generalIssues = allIssues.filter((i) => i.fieldKey === undefined);

  function scrollTo(selector: string) {
    formRef.current
      ?.querySelector(selector)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function handleSubmit() {
    if (busy) return; // dvojtap na Uložit nesmí odeslat druhý request
    setAttempted(true);
    if (hasBlocking(allIssues)) {
      // odscrollovat na první chybné pole
      setTimeout(() => scrollTo(".field-invalid"), 30);
      return;
    }
    onSubmit(validation.params, note.trim());
  }

  let focusAssigned = false;

  function renderField(f: FieldDef, groupIndex: number) {
    const id = `f-${f.key}`;
    const rawValue = params[f.key];
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const requiredNow =
      !f.tbd && (f.required === true || (f.requiredIf !== undefined && evalConds(f.requiredIf, params)));
    const shouldAutoFocus = autoFocusFirst && groupIndex === 0 && !focusAssigned && !f.tbd;
    if (shouldAutoFocus) focusAssigned = true;
    // Podmíněně odkryté pole dostane zelený pruh vlevo — je vidět, že přibylo.
    const revealed = f.visibleIf !== undefined;

    if (f.tbd) {
      return (
        <Field key={f.key} label={f.label} num={fieldNum.get(f.key)} htmlFor={id} help="Možnosti se teprve doplní.">
          <TextInput id={id} value="" placeholder="Doplní se" disabled />
        </Field>
      );
    }

    let control: JSX.Element;
    if (f.type === "number") {
      const decimal = ((f.step ?? 1) % 1) !== 0;
      const input = (
        <NumberInput
          id={id}
          value={value}
          decimal={decimal}
          autoFocus={shouldAutoFocus}
          onChange={(e) => setValue(f.key, e.target.value)}
          onBlur={() => markTouched(f.key)}
          placeholder={f.placeholder}
        />
      );
      control = f.unit ? (
        <div className="input-unit">
          {input}
          <span className="input-unit-label" aria-hidden="true">
            {f.unit}
          </span>
        </div>
      ) : (
        input
      );
    } else if (f.type === "select") {
      // Jednotný výběr přes vlastní sheet (žádné systémové selecty).
      control = (
        <SelectSheet
          id={id}
          value={value}
          options={f.options ?? []}
          placeholder="Vyber…"
          onChange={(v) => {
            setValue(f.key, v);
            markTouched(f.key);
          }}
        />
      );
    } else if (f.type === "textarea") {
      control = (
        <Textarea
          id={id}
          value={value}
          autoFocus={shouldAutoFocus}
          onChange={(e) => setValue(f.key, e.target.value)}
          onBlur={() => markTouched(f.key)}
          placeholder={f.placeholder}
        />
      );
    } else {
      control = (
        <TextInput
          id={id}
          value={value}
          autoFocus={shouldAutoFocus}
          onChange={(e) => setValue(f.key, e.target.value)}
          onBlur={() => markTouched(f.key)}
          placeholder={f.placeholder}
        />
      );
    }

    return (
      <div key={f.key} className={revealed ? "field-revealed" : undefined}>
        <Field
          label={f.unit && f.type !== "number" ? `${f.label} (${f.unit})` : f.label}
          num={fieldNum.get(f.key)}
          htmlFor={id}
          required={requiredNow}
          help={f.help}
          messages={messagesFor(f.key)}
        >
          {control}
        </Field>
      </div>
    );
  }

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
          {definition.groups.map((g) => {
            const req = g.fields.filter(
              (f) =>
                !f.tbd &&
                isFieldVisible(f, params) &&
                (f.required === true || (f.requiredIf !== undefined && evalConds(f.requiredIf, params))),
            );
            const done = req.filter((f) => isFilled(params, f.key)).length;
            const complete = req.length > 0 && done === req.length;
            return (
              <button
                key={g.key}
                type="button"
                className={`group-chip ${complete ? "group-chip-done" : ""}`}
                onClick={() => scrollTo(`#grp-${g.key}`)}
              >
                {g.label}
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
        {definition.groups.map((g, gi) => {
          const visible = g.fields.filter((f) => isFieldVisible(f, params));
          if (visible.length === 0) return null;
          return (
            <section key={g.key} id={`grp-${g.key}`} className="form-group">
              <h2 className="form-group-title">{g.label}</h2>
              {visible.map((f) => renderField(f, gi))}
            </section>
          );
        })}

        <section className="form-group">
          <h2 className="form-group-title" id="f-note-label">
            Poznámka
          </h2>
          <div
            className={
              messagesFor("note").some((m) => m.level === "error") ? "field field-invalid" : "field"
            }
          >
            <Textarea
              id="f-note"
              aria-labelledby="f-note-label"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setDirtySinceServer(true);
              }}
              onBlur={() => markTouched("note")}
              placeholder="Cokoli k této položce…"
            />
            {messagesFor("note").map((m, i) => (
              <p
                key={i}
                className={`field-msg field-msg-${m.level}`}
                role={m.level === "error" ? "alert" : undefined}
              >
                {m.message}
              </p>
            ))}
          </div>
        </section>

        {children}

        {generalIssues.filter((i) => i.level !== "error" || attempted).length > 0 && (
          <div className="form-issues">
            {generalIssues
              .filter((i) => i.level !== "error" || attempted)
              .map((i, idx) => (
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
                  key={f.key}
                  type="button"
                  className="error-chip"
                  onClick={() => scrollTo(`#f-${f.key}`)}
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
