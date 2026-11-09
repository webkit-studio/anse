import { useState } from "react";
import type { DodaniRow } from "@shared/dodani";
import { dodaniPoMontazi } from "@shared/dodani";
import { czDate } from "@shared/format";
import { api, isConflict } from "../api/client";
import { MiniCalendar } from "./DateSheet";

/**
 * Termíny dodání po dodavatelích v panelu kanceláře. Jeden dodavatel = jedno
 * pole „Termín dodání", víc dodavatelů = řádek pro každého. Stejný výběr
 * data slouží při nacenění i po objednání (dodavatel termín posune).
 */
export function TerminyDodani({
  orderId,
  updatedAt,
  dodani,
  termMontaz,
  onSaved,
  onConflict,
  onError,
}: {
  orderId: string;
  updatedAt: string;
  dodani: DodaniRow[];
  termMontaz: string | null;
  onSaved: () => Promise<void> | void;
  onConflict: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const vic = dodani.length > 1;
  const pozde = dodaniPoMontazi(dodani, termMontaz);

  async function save(dodavatel: string, term: string) {
    setSaving(true);
    try {
      await api(`/api/orders/${orderId}/dodani`, {
        method: "PUT",
        body: { dodavatel, term, expected_updated_at: updatedAt },
      });
      await onSaved();
    } catch (err) {
      if (isConflict(err)) onConflict();
      else onError(err instanceof Error ? err.message : "Termín se nepodařilo uložit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dodani">
      {vic && <span className="field-label">Termín dodání *</span>}
      {dodani.map((r) => {
        const id = `dodani-${r.dodavatel || "ostatni"}`;
        return (
          <div key={r.dodavatel} className={vic ? "dodani-row" : undefined} style={{ position: "relative" }}>
            <span className={vic ? "dodani-nazev" : "field-label"} id={`${id}-label`}>
              {vic ? r.nazev : "Termín dodání *"}
            </span>
            <button
              type="button"
              id={id}
              className="select-sheet-trigger"
              aria-haspopup="dialog"
              aria-expanded={open === r.dodavatel}
              aria-labelledby={`${id}-label ${id}`}
              disabled={saving}
              onClick={() => setOpen((v) => (v === r.dodavatel ? null : r.dodavatel))}
            >
              <span>{r.term ? czDate(r.term) : "Vyber datum"}</span>
              <span aria-hidden="true">▾</span>
            </button>
            {open === r.dodavatel && (
              <MiniCalendar
                value={r.term}
                onClose={() => setOpen(null)}
                onPick={(iso) => {
                  setOpen(null);
                  if (iso !== r.term) void save(r.dodavatel, iso);
                }}
              />
            )}
          </div>
        );
      })}
      {pozde.length > 0 && termMontaz && (
        <p className="field-msg field-msg-warning" role="status">
          Dodání {pozde.map((r) => `${r.nazev} ${czDate(r.term)}`).join(", ")} vyjde až po
          montáži ({czDate(termMontaz)}). Posun montáže domluv s technikem.
        </p>
      )}
    </div>
  );
}
