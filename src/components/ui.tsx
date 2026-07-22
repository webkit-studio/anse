import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { OrderStatus } from "@shared/types";
import { STATUS_LABELS } from "@shared/types";

// --- Button -------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" {...props} className={`btn btn-${variant} ${className}`} />;
}

// --- Field wrapper --------------------------------------------------------

export interface FieldMessage {
  level: "info" | "warning" | "error";
  message: string;
}

export function Field({
  label,
  htmlFor,
  required,
  help,
  messages = [],
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  help?: string;
  messages?: FieldMessage[];
  children: ReactNode;
}) {
  return (
    <div className={`field ${messages.some((m) => m.level === "error") ? "field-invalid" : ""}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-required"> *</span>}
      </label>
      {children}
      {help && !messages.length && <p className="field-help">{help}</p>}
      {messages.map((m, i) => (
        <p key={i} className={`field-msg field-msg-${m.level}`} role={m.level === "error" ? "alert" : undefined}>
          {m.message}
        </p>
      ))}
    </div>
  );
}

// --- Inputs ----------------------------------------------------------------

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}

/** Číselné pole: numerická klávesnice na mobilu, desetinná čárka povolena. */
export function NumberInput({
  decimal = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { decimal?: boolean }) {
  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      {...props}
    />
  );
}

export function NativeSelect({
  children,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { placeholder?: string }) {
  return (
    <select {...props} className={`select ${props.value === "" ? "select-empty" : ""}`}>
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  );
}

// --- SelectSheet: výběr z mnoha možností s fulltext filtrem -----------------

export interface SheetOption {
  value: string;
  label: string;
  /** Barevná tečka (hex) — náhledy jednobarevných odstínů. */
  swatch?: string;
  /** Náhled barvy jako obrázek (cesta) — reálné textury (lamely). */
  swatchImage?: string;
}

function Swatch({ opt }: { opt?: Pick<SheetOption, "swatch" | "swatchImage"> }) {
  if (opt?.swatchImage) {
    return (
      <span
        className="swatch swatch-img"
        style={{ backgroundImage: `url(${opt.swatchImage})` }}
        aria-hidden="true"
      />
    );
  }
  if (opt?.swatch) return <span className="swatch" style={{ background: opt.swatch }} aria-hidden="true" />;
  return null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function SelectSheet({
  id,
  value,
  options,
  placeholder = "Vyberte…",
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  options: SheetOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const f = normalize(filter.trim());
    if (!f) return options;
    return options.filter((o) => normalize(o.label).includes(f) || normalize(o.value).includes(f));
  }, [options, filter]);

  useEffect(() => {
    if (open) {
      setFilter("");
      // fokus až po vykreslení sheetu
      setTimeout(() => searchRef.current?.focus(), 50);
      // zámek scrollu stránky pod sheetem (jinak na iOS scrolluje pozadí)
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
    return undefined;
  }, [open]);

  return (
    <>
      <button
        type="button"
        id={id}
        className={`select-sheet-trigger ${selected ? "" : "select-empty"}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className="select-sheet-value">
          <Swatch opt={selected} />
          {selected ? selected.label : placeholder}
        </span>
        <span aria-hidden="true" className="select-sheet-caret">
          ▾
        </span>
      </button>
      {open && (
        <div className="sheet-backdrop" onClick={() => setOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <span id={titleId} className="sheet-title">
                {placeholder}
              </span>
              <button type="button" className="sheet-close" onClick={() => setOpen(false)} aria-label="Zavřít">
                ✕
              </button>
            </div>
            <input
              ref={searchRef}
              type="search"
              className="sheet-search"
              placeholder="Hledat…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="sheet-options">
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`sheet-option ${o.value === value ? "sheet-option-selected" : ""}`}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Swatch opt={o} />
                  {o.label}
                </button>
              ))}
              {filtered.length === 0 && <p className="sheet-empty">Nic nenalezeno.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- Chips -------------------------------------------------------------------

export function Chips({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="chips" role="group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={`chip ${value === o ? "chip-active" : ""}`}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

// --- Status ------------------------------------------------------------------

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

// --- Drobnosti ----------------------------------------------------------------

export function Spinner() {
  return <span className="spinner" aria-label="Načítám…" />;
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Zkusit znovu
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      {children}
    </div>
  );
}

/** Destruktivní akce bez dialogu: první tap → „Opravdu?", druhý potvrdí. */
export function ConfirmButton({
  label,
  confirmLabel = "Opravdu?",
  onConfirm,
  className = "",
}: {
  label: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
}) {
  const [arming, setArming] = useState(false);

  useEffect(() => {
    if (!arming) return;
    const t = setTimeout(() => setArming(false), 3000);
    return () => clearTimeout(t);
  }, [arming]);

  return (
    <button
      type="button"
      className={`btn ${arming ? "btn-danger" : "btn-ghost"} ${className}`}
      onClick={() => {
        if (arming) {
          setArming(false);
          onConfirm();
        } else {
          setArming(true);
        }
      }}
    >
      {arming ? confirmLabel : label}
    </button>
  );
}
