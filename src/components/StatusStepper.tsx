import { useState } from "react";
import type { OrderStatus, Role } from "@shared/types";
import { ALLOWED_TRANSITIONS, STATUS_LABELS } from "@shared/types";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder } from "../api/hooks";
import { useToast } from "./Toast";
import { Button, StatusBadge } from "./ui";

/**
 * Aktuální stav + tlačítka povolených přechodů dle role. Přechod vpřed je
 * primární, návrat zpět sekundární. Souběh (409) → toast + refresh.
 */
export function StatusStepper({
  orderId,
  status,
  role,
}: {
  orderId: string;
  status: OrderStatus;
  role: Role;
}) {
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateOrder();
  const toast = useToast();

  const targets = ALLOWED_TRANSITIONS[role][status] ?? [];
  const statusOrder: OrderStatus[] = ["k_vymereni", "rozpracovana", "k_objednani", "objednano", "namontovano"];
  const forward = targets.filter((t) => statusOrder.indexOf(t) > statusOrder.indexOf(status));
  const backward = targets.filter((t) => statusOrder.indexOf(t) < statusOrder.indexOf(status));

  async function transition(to: OrderStatus) {
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/status`, {
        method: "POST",
        body: { to, expected: status },
      });
      toast(`Stav změněn na „${STATUS_LABELS[to]}".`);
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
    <div className="status-stepper">
      <StatusBadge status={status} />
      <div className="status-stepper-actions">
        {backward.map((t) => (
          <Button key={t} variant="ghost" disabled={busy} onClick={() => void transition(t)}>
            ← {STATUS_LABELS[t]}
          </Button>
        ))}
        {forward.map((t) => (
          <Button key={t} variant="primary" disabled={busy} onClick={() => void transition(t)}>
            {STATUS_LABELS[t]} →
          </Button>
        ))}
      </div>
    </div>
  );
}
