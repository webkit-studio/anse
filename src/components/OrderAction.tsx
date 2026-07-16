import { useState } from "react";
import type { OrderStatus, Role } from "@shared/types";
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

  const action =
    status === "rozpracovana"
      ? { to: "k_objednani" as OrderStatus, label: "Odeslat k objednání", done: "Odesláno k objednání." }
      : status === "k_objednani" && role === "admin"
        ? { to: "objednano" as OrderStatus, label: "Označit jako objednáno", done: "Zakázka objednána." }
        : null;

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
