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
 * `min` odřízne dřívější data (montáž nesmí být před dodáním).
 */
export function DateSheet({
  title,
  value,
  min,
  confirmLabel,
  onClose,
  onPick,
}: {
  title: string;
  value: string | null;
  min?: string | null;
  confirmLabel: string;
  onClose: () => void;
  onPick: (iso: string) => void;
}) {
  const today = isoDay(new Date());
  const floor = min && min > today ? min : today;
  const [picked, setPicked] = useState(value && value >= floor ? value : floor);
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
        {min && (
          <p className="field-help">Dřívější termín než dodání {czDate(min)} nejde vybrat.</p>
        )}

        <Button variant="primary" className="btn-block" onClick={() => onPick(picked)}>
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
