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

/**
 * Výběr data na mobilu: rychlé volby + nativní kalendář.
 * `warnBefore` dřívější data nezakazuje, jen varuje (dodávky chodí i dřív);
 * `withTime` přidá nepovinný čas (plánování dne technika).
 */
export function DateSheet({
  title,
  value,
  warnBefore,
  warnText,
  withTime = false,
  confirmLabel,
  onClose,
  onPick,
}: {
  title: string;
  value: string | null;
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
  const [time, setTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const quick = [
    { label: "Dnes", iso: today },
    { label: "Zítra", iso: addDays(today, 1) },
    { label: "Za týden", iso: addDays(today, 7) },
  ].filter((q) => q.iso >= floor);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
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

        <label className="field-label" htmlFor="date-sheet-input">
          Datum
        </label>
        <input
          id="date-sheet-input"
          ref={inputRef}
          type="date"
          value={picked}
          min={floor}
          onChange={(e) => setPicked(e.target.value)}
        />

        {withTime && (
          <>
            <label className="field-label" htmlFor="date-sheet-time">
              Čas (nepovinný)
            </label>
            <input
              id="date-sheet-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </>
        )}

        {warnBefore && picked < warnBefore && (
          <p className="field-msg field-msg-warning" role="status">
            {warnText ?? `Pozor: dodání je až ${czDate(warnBefore)}.`}
          </p>
        )}

        <Button variant="primary" className="btn-block" onClick={() => onPick(picked, time || null)}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

const DOW = ["po", "út", "st", "čt", "pá", "so", "ne"];

/** Mini kalendář pro kancelář — objeví se až při editaci pole. */
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
  const base = value ? new Date(`${value}T12:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7; // pondělí první
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const monthName = first.toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });

  return (
    <div className="calendar" ref={ref} role="dialog" aria-label="Výběr data">
      <div className="calendar-head">
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 32 }}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Předchozí měsíc"
        >
          ‹
        </button>
        <span>{monthName}</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 32 }}
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
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
          return (
            <button
              key={iso}
              type="button"
              className={`calendar-day ${value === iso ? "calendar-day-selected" : ""}`}
              disabled={disabled}
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
