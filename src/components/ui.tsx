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
import { Icon, ToneGlyph } from "./Icon";

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

/**
 * Přepínač zap/vyp.
 *
 * Knoflík je SKUTEČNÝ element, ne ::after — díky tomu má pseudoprvek volný
 * na zvětšení klikací plochy na 44 px, aniž by se do toho pletlo polstrování
 * a background-clip. Dřív to bylo obráceně a stačilo někde napsat `background`
 * zkratkou, aby ze zapnutého přepínače byla zelená koule.
 *
 * Rozměr si komponenta drží sama (flex: none + pevná šířka), takže ji
 * nerozmáčkne žádný flex ani grid rodič.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" aria-hidden="true" />
    </button>
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
      <div className="card-list">{children}</div>
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

// --- Řádek s hodnotou a akcemi ---------------------------------------------

/** Zkopíruje text a řekne to. Bez clipboard API (starší prohlížeč) neselže. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Odkaz na mapy — otevře se v appce, když ji člověk má, jinak na webu. */
export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}

/**
 * Druh údaje. Určuje kontextovou akci vpravo (zavolat / napsat / navigovat)
 * a klávesnici, která na telefonu vyjede při editaci.
 */
export type ValueKind = "text" | "tel" | "email" | "adresa" | "castka" | "datum";

const KIND_INPUT: Record<ValueKind, { mode: InputHTMLAttributes<HTMLInputElement>["inputMode"]; type: string }> = {
  text: { mode: "text", type: "text" },
  tel: { mode: "tel", type: "tel" },
  email: { mode: "email", type: "email" },
  adresa: { mode: "text", type: "text" },
  castka: { mode: "numeric", type: "text" },
  datum: { mode: "text", type: "text" },
};

/** Skočí na řádek a rovnou otevře jeho editaci — z klikací blokace. */
export function focusValueRow(row: string) {
  const el = document.querySelector<HTMLElement>(`[data-row="${row}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.querySelector<HTMLButtonElement>(".value-row-edit")?.click();
}

/**
 * Řádek „popisek — hodnota — akce". JEDINÝ způsob, jak se v detailech ukazuje
 * a mění údaj — aby to nebylo pokaždé jinak.
 *
 * Akce sedí v pevných slotech (kontextová · kopírovat · tužka), takže tužka je
 * na všech řádcích ve stejném sloupci. Na myši se rozsvítí až při najetí, ať
 * karta není poseta ikonami; na dotyku svítí pořád, protože tam hover není.
 * Editace probíhá rovnou v řádku, nikdy v jiném okně.
 */
export function ValueRow({
  label,
  value,
  editValue,
  placeholder = "—",
  kind = "text",
  hint,
  row,
  copy = true,
  onSave,
  onEdit,
  children,
}: {
  label: string;
  /** Co se ukazuje (u částky už zformátované). */
  value: string;
  /** Co se nabídne k editaci, když se liší od zobrazeného (částka, datum). */
  editValue?: string;
  placeholder?: string;
  kind?: ValueKind;
  /** Drobná věta pod hodnotou — třeba proč pole nejde vyplnit. */
  hint?: string;
  /** Kotva pro focusValueRow (klikací blokace). */
  row?: string;
  copy?: boolean;
  /** Uloží novou hodnotu. Bez něj je řádek jen ke čtení (bez tužky). */
  onSave?: (next: string) => void | Promise<void>;
  /** Vlastní editor místo inputu (kalendář). Má přednost před onSave. */
  onEdit?: () => void;
  /** Vlastní ovládání v místě hodnoty (výběr technika) — ať i select sedí
   *  ve stejné mřížce jako ostatní řádky a nekazí rytmus karty. */
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Právě uložená hodnota. Ukazuje se hned, ať se nečeká na uložení a načtení
  // ze serveru — jinak řádek po potvrzení bliká zpátky na prázdno.
  const [ulozeno, setUlozeno] = useState<string | null>(null);
  // Potvrdit se smí jen jednou: fajfka commituje z kliku a input z rozostření,
  // a obojí se při jednom potvrzení spustí za sebou.
  const hotovoRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const zobrazene = ulozeno ?? value;
  const has = zobrazene.trim() !== "";
  const raw = editValue ?? (has ? zobrazene : "");

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  function open() {
    if (onEdit) {
      onEdit();
      return;
    }
    hotovoRef.current = false;
    setDraft(raw);
    setEditing(true);
  }

  async function commit() {
    if (hotovoRef.current) return;
    hotovoRef.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next === raw.trim()) return;
    setUlozeno(next);
    try {
      await onSave?.(next);
    } finally {
      // Uvolnit až po uložení: to už má řádek novou hodnotu z props, a když
      // uložení selhalo, vrátí se poctivě ta původní.
      setUlozeno(null);
    }
  }

  if (editing) {
    return (
      <div className="value-row value-row-editing" data-row={row}>
        <label className="value-row-label" htmlFor={fieldId}>
          {label}
        </label>
        <span className="value-row-value">
          <input
            id={fieldId}
            ref={inputRef}
            className="value-row-input"
            value={draft}
            autoFocus
            type={KIND_INPUT[kind].type}
            inputMode={KIND_INPUT[kind].mode}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        </span>
        <span className="value-row-actions">
          <span className="icon-slot" />
          <span className="icon-slot" />
          <button
            type="button"
            className="icon-btn icon-btn-done"
            title="Uložit"
            aria-label="Uložit"
            // Bez tohohle vezme stisk fokus inputu, ten se rozostří a uloží,
            // řádek se překreslí do čtení — a puštění myši dopadne na tužku,
            // která sedí ve stejném slotu a editaci hned zase otevře.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void commit()}
          >
            <Icon name="hotovo" size={18} />
          </button>
        </span>
      </div>
    );
  }

  const akce =
    has && kind === "tel" ? (
      <a className="icon-btn" href={telUrl(value)} aria-label={`Zavolat na ${value}`} title="Zavolat">
        <Icon name="volat" size={18} />
      </a>
    ) : has && kind === "email" ? (
      <a className="icon-btn" href={`mailto:${value}`} aria-label={`Napsat na ${value}`} title="Napsat e-mail">
        <Icon name="obalka" size={18} />
      </a>
    ) : has && kind === "adresa" ? (
      <a
        className="icon-btn"
        href={mapUrl(value)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Zobrazit ${value} v mapách`}
        title="Zobrazit v mapách"
      >
        <Icon name="mapa" size={18} />
      </a>
    ) : null;

  if (children) {
    return (
      <div className="value-row value-row-control" data-row={row}>
        <span className="value-row-label">{label}</span>
        <span className="value-row-value">{children}</span>
        <span className="value-row-actions">
          <span className="icon-slot" />
          <span className="icon-slot" />
          <span className="icon-slot" />
        </span>
      </div>
    );
  }

  return (
    <div className="value-row" data-row={row}>
      <span className="value-row-label">{label}</span>
      <span className="value-row-value">
        {has ? zobrazene : <span className="muted">{placeholder}</span>}
        {hint && <span className="value-row-hint">{hint}</span>}
      </span>
      <span className="value-row-actions">
        {akce ?? <span className="icon-slot" />}
        {has && copy ? (
          <button
            type="button"
            className={`icon-btn ${copied ? "icon-btn-done" : ""}`}
            aria-label={`Zkopírovat ${label.toLowerCase()}`}
            title={copied ? "Zkopírováno" : "Zkopírovat"}
            onClick={() => void copyText(value).then(setCopied)}
          >
            <Icon name={copied ? "hotovo" : "kopie"} size={18} />
          </button>
        ) : (
          <span className="icon-slot" />
        )}
        {onSave || onEdit ? (
          <button
            type="button"
            className="icon-btn value-row-edit"
            aria-label={`Upravit ${label.toLowerCase()}`}
            title="Upravit"
            onClick={open}
          >
            <Icon name="tuzka" size={18} />
          </button>
        ) : (
          <span className="icon-slot" />
        )}
      </span>
    </div>
  );
}
