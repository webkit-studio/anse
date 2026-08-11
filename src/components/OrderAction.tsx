import { useState } from "react";
import type { OrderStatus, Role } from "@shared/types";
import { ALLOWED_TRANSITIONS } from "@shared/types";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder } from "../api/hooks";
import { useToast } from "./Toast";

/**
 * Jediná kontextová akce stavu (žádný stepper): technik odešle k objednání,
 * admin označí objednáno. Jen vpřed — proto dvojtap potvrzení (bez dialogu).
 */
export function OrderAction({
  orderId,
  status,
  role,
}: {
  orderId: string;
  status: OrderStatus;
  role: Role;
}) {
  const [busy, setBusy] = useState(false);
  const [arming, setArming] = useState(false);
  const invalidate = useInvalidateOrder();
  const toast = useToast();

  // Popisky akcí per stav — tlačítko je vždy jen jedno (jen vpřed).
  const ACTIONS: Partial<Record<OrderStatus, { to: OrderStatus; label: string; done: string }>> = {
    rozpracovana: {
      to: "k_naceneni",
      label: "Zaměřeno — předat k nacenění",
      done: "Předáno k nacenění.",
    },
    k_naceneni: { to: "k_objednavce", label: "Naceněno — k objednávce", done: "Předáno k objednávce." },
    k_objednavce: { to: "k_montazi", label: "Objednáno — k montáži", done: "Zakázka objednána." },
    k_montazi: { to: "hotovo", label: "Namontováno — hotovo", done: "Zakázka dokončena." },
  };

  const candidate = ACTIONS[status];
  const allowed = ALLOWED_TRANSITIONS[role][status] ?? [];
  const action = candidate && allowed.includes(candidate.to) ? candidate : null;

  if (!action) return null;

  async function run() {
    if (!arming) {
      setArming(true);
      setTimeout(() => setArming(false), 4000);
      return;
    }
    setArming(false);
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/status`, {
        method: "POST",
        body: { to: action!.to, expected: status },
      });
      toast(action!.done);
    } catch (err) {
      toast(
        isConflict(err)
          ? "Stav mezitím změnil někdo jiný — obnovuji."
          : err instanceof Error
            ? err.message
            : "Změna stavu se nepodařila.",
      );
    } finally {
      setBusy(false);
      invalidate(orderId);
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-block ${arming ? "btn-danger" : "btn-secondary"} order-action`}
      disabled={busy}
      onClick={() => void run()}
    >
      {busy ? "Ukládám…" : arming ? "Potvrdit — nejde vrátit zpět" : action.label}
    </button>
  );
}
