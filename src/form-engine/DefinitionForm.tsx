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
  NativeSelect,
  NumberInput,
  SelectSheet,
  Textarea,
  TextInput,
  type FieldMessage,
} from "../components/ui";

/** Nad tolik možností se místo nativního selectu otevírá sheet s hledáním. */
const SHEET_THRESHOLD = 12;

export interface DefinitionFormProps {
  definition: FormDefinition;
  initialParams: Params;
  initialNote: string;
  submitLabel: string;
  busy?: boolean;
  /** Chyby vrácené serverem (422) — zobrazí se, dokud uživatel formulář nezmění. */
  serverIssues?: Issue[];
  onSubmit: (params: Params, note: string) => void;
  onChange?: (params: Params, note: string) => void;
  autoFocusFirst?: boolean;
}

export function DefinitionForm({
  definition,
  initialParams,
  initialNote,
  submitLabel,
  busy = false,
  serverIssues = [],
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

  const activeServerIssues = dirtySinceServer ? [] : serverIssues;
  const allIssues = [...validation.issues, ...activeServerIssues];

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

  function handleSubmit() {
    if (busy) return; // dvojtap na Uložit nesmí odeslat druhý request
    setAttempted(true);
    if (hasBlocking(allIssues)) {
      // odscrollovat na první chybné pole
      setTimeout(() => {
        formRef.current?.querySelector(".field-invalid")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 30);
      return;
    }
    onSubmit(validation.params, note.trim());
  }

  let focusAssigned = false;

  function renderField(f: FieldDef, groupIndex: number) {
    const id = `f-${f.key}`;
    const rawValue = params[f.key];
    const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
    const requiredNow = !f.tbd && (f.required === true || (f.requiredIf !== undefined && evalConds(f.requiredIf, params)));
    const shouldAutoFocus = autoFocusFirst && groupIndex === 0 && !focusAssigned && !f.tbd;
    if (shouldAutoFocus) focusAssigned = true;

    if (f.tbd) {
      return (
        <Field key={f.key} label={f.label} htmlFor={id} help="Možnosti se teprve doplní.">
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
      const options = f.options ?? [];
      if (options.length > SHEET_THRESHOLD) {
        control = (
          <SelectSheet
            id={id}
            value={value}
            options={options}
            placeholder={`${f.label} — vybrat`}
            onChange={(v) => {
              setValue(f.key, v);
              markTouched(f.key);
            }}
          />
        );
      } else {
        control = (
          <NativeSelect
            id={id}
            value={value}
            placeholder="Vyberte…"
            autoFocus={shouldAutoFocus}
            onChange={(e) => {
              setValue(f.key, e.target.value);
              markTouched(f.key);
            }}
            onBlur={() => markTouched(f.key)}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        );
      }
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
      <Field
        key={f.key}
        label={f.unit && f.type !== "number" ? `${f.label} (${f.unit})` : f.label}
        htmlFor={id}
        required={requiredNow}
        help={f.help}
        messages={messagesFor(f.key)}
      >
        {control}
      </Field>
    );
  }

  return (
    <form
      ref={formRef}
      className="definition-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {definition.groups.map((g, gi) => {
        const visible = g.fields.filter((f) => isFieldVisible(f, params));
        if (visible.length === 0) return null;
        return (
          <section key={g.key} className="form-group">
            <h2 className="form-group-title">{g.label}</h2>
            {visible.map((f) => renderField(f, gi))}
          </section>
        );
      })}

      <section className="form-group">
        <h2 className="form-group-title">Poznámka</h2>
        <Field label="Poznámka" htmlFor="f-note" messages={messagesFor("note")}>
          <Textarea
            id="f-note"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setDirtySinceServer(true);
            }}
            onBlur={() => markTouched("note")}
            placeholder="Cokoli k této položce…"
          />
        </Field>
      </section>

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

      <div className="form-actions">
        <Button variant="primary" className="btn-block" disabled={busy} onClick={handleSubmit}>
          {busy ? "Ukládám…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
