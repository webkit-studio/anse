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
import type { OrderPhase, Role, Tone } from "@shared/types";
import { phaseLabelFor, phaseTone } from "@shared/types";
import { ToneGlyph } from "./Icon";

// --- Button -------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "system" | "ghost" | "danger";

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
  num,
  htmlFor,
  required,
  help,
  messages = [],
  children,
}: {
  label: string;
  /** Stálé číslo pole v rámci produktu — pro zpětnou vazbu při testování
   *  („skryj 12, 31"). Čísluje se přes VŠECHNA pole definice, takže číslo
   *  drží, i když se část polí zrovna schová. */
  num?: number;
  htmlFor: string;
  required?: boolean;
  help?: string;
  messages?: FieldMessage[];
  children: ReactNode;
}) {
  return (
    <div className={`field ${messages.some((m) => m.level === "error") ? "field-invalid" : ""}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {num !== undefined && <span className="field-num">{num}</span>}
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
  placeholder = "Vyber…",
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

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  return (
    <div className={`chips ${scroll ? "chips-scroll" : ""}`} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`chip ${value === o.value ? "chip-active" : ""}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// --- Stav: glyf + slovo, barva jen zesiluje ----------------------------------

export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`badge tone-${tone}`}>
      <ToneGlyph tone={tone} />
      {children}
    </span>
  );
}

/**
 * Fáze zakázky. Technik vidí „K fakturaci" jako hotovou práci — fakturace je
 * věc kanceláře a jeho se netýká, proto se popisek i tón liší podle role.
 */
export function PhaseBadge({ phase, role }: { phase: OrderPhase; role: Role }) {
  return <ToneBadge tone={phaseTone(phase, role)}>{phaseLabelFor(phase, role)}</ToneBadge>;
}

// --- Switch (nastavení) -------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      onClick={() => onChange(!checked)}
    />
  );
}

// --- Skeleton -----------------------------------------------------------------

/** Kostra obsahu; zobrazuje se až po 150 ms čekání (viz useDelayed). */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-card" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${100 - i * 18}%` }} />
      ))}
    </div>
  );
}

export function SkeletonList({ cards = 3 }: { cards?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }} aria-busy="true" aria-label="Načítám…">
      {Array.from({ length: Math.min(cards, 3) }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Stav připojení — v terénu vypadává signál a formulář to musí říct nahlas. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Krátké čekání se neblikne skeletonem — až od 150 ms. */
export function useDelayed(active: boolean, ms = 150): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return undefined;
    }
    const t = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return shown;
}

// --- Sekce práce (fronta) ------------------------------------------------------

export function Queue({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null; // prázdná sekce se nevykresluje
  return (
    <section className="queue">
      <div className="queue-head">
        <span className="queue-title">{title}</span>
        <span className="queue-count">{count}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
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

export function EmptyState({
  icon = "◇",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty-state-title">{title}</p>
      {children}
    </div>
  );
}

/**
 * Zrušení s povinným důvodem: pole se odkryje až po prvním tapu — dokud nikdo
 * neruší, formulář nestraší červenou textareou.
 */
export function CancelBlock({
  label,
  placeholder = "Důvod zrušení (nutný)",
  onCancel,
}: {
  label: string;
  placeholder?: string;
  onCancel: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button variant="ghost" className="order-delete" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <section className="field-revealed" style={{ display: "grid", gap: 8 }}>
      <Textarea
        value={reason}
        rows={2}
        autoFocus
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setReason(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Zpět
        </Button>
        <Button
          variant="danger"
          disabled={!reason.trim()}
          onClick={() => onCancel(reason.trim())}
          style={{ flex: 1 }}
        >
          {label}
        </Button>
      </div>
    </section>
  );
}

/** Destruktivní akce bez dialogu: první tap → „Opravdu?", druhý potvrdí. */
export function ConfirmButton({
  label,
  confirmLabel = "Opravdu?",
  onConfirm,
  className = "",
  ariaLabel,
  title,
}: {
  label: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  /** Přístupný název, když je label jen ikona (🗑). */
  ariaLabel?: string;
  /** Tooltip při najetí myší (ikonová tlačítka). */
  title?: string;
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
      aria-label={arming ? undefined : ariaLabel}
      title={arming ? undefined : title}
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
