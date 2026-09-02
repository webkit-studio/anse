import { useEffect, useRef, useState } from "react";
import { czDate } from "@shared/format";
import { Button } from "./ui";

/** ISO datum (YYYY-MM-DD) v místním čase — ne přes toISOString (posun UTC). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

const DOW = ["po", "út", "st", "čt", "pá", "so", "ne"];

/**
 * Mřížka měsíce — jediný kalendář v aplikaci. Nativní `input[type=date]` tu
 * není schválně: v každém prohlížeči vypadá jinak a jeho rozbalovák si na
 * telefonu sedne přes potvrzovací tlačítko pod sheetem.
 */
function CalendarGrid({
  value,
  min,
  onPick,
}: {
  value: string | null;
  min?: string | null;
  onPick: (iso: string) => void;
}) {
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const today = isoDay(new Date());

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // pondělí první
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthName = first.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  // Celý předchozí měsíc pod dolní mezí — šipka zpět nemá kam vést.
  const lastOfPrev = isoDay(new Date(month.getFullYear(), month.getMonth(), 0));
  const prevDisabled = !!min && lastOfPrev < min;

  function posun(o: number) {
    setMonth(new Date(month.getFullYear(), month.getMonth() + o, 1));
  }

  return (
    <div className="calendar-body">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          onClick={() => posun(-1)}
          disabled={prevDisabled}
          aria-label="Předchozí měsíc"
        >
          ‹
        </button>
        <span className="calendar-month">{monthName}</span>
        <button
          type="button"
          className="calendar-nav"
          onClick={() => posun(1)}
          aria-label="Další měsíc"
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {DOW.map((d) => (
          <span key={d} className="calendar-dow">
            {d}
          </span>
        ))}
        {Array.from({ length: startOffset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = isoDay(new Date(month.getFullYear(), month.getMonth(), i + 1));
          const disabled = !!min && iso < min;
          const classes = [
            "calendar-day",
            value === iso ? "calendar-day-selected" : "",
            iso === today && value !== iso ? "calendar-day-today" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={iso}
              type="button"
              className={classes}
              disabled={disabled}
              aria-current={iso === today ? "date" : undefined}
              aria-pressed={value === iso}
              onClick={() => onPick(iso)}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Časy, na které se technik se zákazníkem reálně domlouvá. */
const CASY = ["8:00", "9:00", "10:00", "12:00", "14:00", "16:00"];

/**
 * Výběr data: rychlé volby, kalendář a nepovinný čas.
 * `warnBefore` dřívější data nezakazuje, jen varuje (dodávky chodí i dřív);
 * `withTime` přidá čas (plánování dne technika).
 */
export function DateSheet({
  title,
  value,
  time: timeValue,
  warnBefore,
  warnText,
  withTime = false,
  confirmLabel,
  onClose,
  onPick,
}: {
  title: string;
  value: string | null;
  /** Předvyplněný čas (HH:MM), když se termín upravuje. */
  time?: string | null;
  warnBefore?: string | null;
  warnText?: string;
  withTime?: boolean;
  confirmLabel: string;
  onClose: () => void;
  onPick: (iso: string, time: string | null) => void;
}) {
  const today = isoDay(new Date());
  const floor = today;
  const [picked, setPicked] = useState(value && value >= floor ? value : floor);
  const [time, setTime] = useState(timeValue ?? "");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const quick = [
    { label: "Dnes", iso: today },
    { label: "Zítra", iso: addDays(today, 1) },
    { label: "Za týden", iso: addDays(today, 7) },
  ].filter((q) => q.iso >= floor);

  /** Normalizace na HH:MM — z chipu i z nativního pole leze různý zápis. */
  const timeChip = time.replace(/^0/, "");

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet sheet-date"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <span className="sheet-title">{title}</span>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Zavřít">
            ✕
          </button>
        </div>

        <div className="sheet-scroll">
          {quick.length > 0 && (
            <div className="chips">
              {quick.map((q) => (
                <button
                  key={q.iso}
                  type="button"
                  className={`chip ${picked === q.iso ? "chip-active" : ""}`}
                  onClick={() => setPicked(q.iso)}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          <CalendarGrid value={picked} min={floor} onPick={setPicked} />

          {withTime && (
            <div className="time-block">
              <span className="field-label">Čas (nepovinný)</span>
              <div className="chips">
                {CASY.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${timeChip === c ? "chip-active" : ""}`}
                    onClick={() => setTime(timeChip === c ? "" : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <input
                type="time"
                className="time-exact"
                value={time}
                aria-label="Přesný čas"
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          )}

          {warnBefore && picked < warnBefore && (
            <p className="field-msg field-msg-warning" role="status">
              {warnText ?? `Pozor: dodání je až ${czDate(warnBefore)}.`}
            </p>
          )}
        </div>

        {/* Potvrzení sedí pod obsahem, který se posouvá — nic ho nepřekryje. */}
        <div className="sheet-foot">
          <p className="sheet-picked">
            {czDate(picked)}
            {time ? ` v ${time}` : ""}
          </p>
          <Button
            variant="primary"
            className="btn-block"
            onClick={() => onPick(picked, time || null)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Kalendář v bublině pro kancelář — stejná mřížka, jen menší. */
export function MiniCalendar({
  value,
  min,
  onPick,
  onClose,
}: {
  value: string | null;
  min?: string | null;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="calendar calendar-mini" ref={ref} role="dialog" aria-label="Výběr data">
      <CalendarGrid value={value} min={min} onPick={onPick} />
    </div>
  );
}
