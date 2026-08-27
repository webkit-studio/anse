import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { czDate } from "@shared/format";
import { api } from "../api/client";
import { useInvalidateOrder, useOrder } from "../api/hooks";
import { PhotoPicker, type PendingPhoto } from "../components/PhotoPicker";
import { TechDetail } from "../components/Shell";
import { SignaturePad } from "../components/SignaturePad";
import { useToast } from "../components/Toast";
import { Button, Spinner } from "../components/ui";

/**
 * Závěr montáže: podpis zákazníka, kontrolní seznam a nepovinné foto realizace.
 * Bez podpisu se „Hotovo" nedá odeslat — hlídá to i server.
 */
export default function MontazPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const invalidate = useInvalidateOrder();
  const [padOpen, setPadOpen] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);

  const d = detail.data;
  const order = d?.order;
  const realizace = (d?.photos ?? []).filter((p) => p.kind === "realizace");

  async function finish() {
    if (!order || busy) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/phase`, {
        method: "POST",
        body: { to: "k_fakturaci", expected: order.phase },
      });
      await invalidate(orderId);
      toast("Hotovo — kancelář fakturuje");
      navigate(`/zakazky/${orderId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se dokončit.");
      setBusy(false);
    }
  }

  const checks = order
    ? [
        { done: (d?.items.length ?? 0) > 0, label: `Položky (${d?.items.length ?? 0})` },
        { done: !!order.signed_at, label: "Podpis zákazníka" },
        { done: realizace.length > 0, label: "Foto realizace (nepovinné)" },
      ]
    : [];

  return (
    <TechDetail
      back={`/zakazky/${orderId}`}
      backLabel="Zakázka"
      footer={
        <Button variant="primary" onClick={() => void finish()} disabled={busy || !order?.signed_at}>
          {order?.signed_at ? "✓ Hotovo" : "Nejdřív podpis"}
        </Button>
      }
    >
      {!order && <Spinner />}
      {order && (
        <>
          <h1 className="t-title" style={{ margin: "4px 0 0" }}>
            Montáž
          </h1>
          <p className="muted t-body-s" style={{ margin: 0 }}>
            {order.customer_name || order.contact_name} · {czDate(order.term_montaz)}
          </p>

          <section className="card card-pad">
            <span className="field-label">Podpis zákazníka</span>
            {order.signed_at ? (
              <div className="check-row" style={{ borderBottom: "none" }}>
                <span className="check-mark check-done" aria-hidden="true">
                  ✓
                </span>
                <span>Podepsáno {czDate(order.signed_at.slice(0, 10))}</span>
                <Button variant="ghost" style={{ marginLeft: "auto" }} onClick={() => setPadOpen(true)}>
                  Podepsat znovu
                </Button>
              </div>
            ) : (
              <Button variant="system" className="btn-block" onClick={() => setPadOpen(true)}>
                Podepsat
              </Button>
            )}
          </section>

          <section className="card card-pad">
            <span className="field-label">Kontrola</span>
            <div className="checklist" style={{ marginTop: 8 }}>
              {checks.map((c) => (
                <div className="check-row" key={c.label}>
                  <span
                    className={`check-mark ${c.done ? "check-done" : "check-todo"}`}
                    aria-hidden="true"
                  >
                    {c.done ? "✓" : "○"}
                  </span>
                  <span>{c.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card card-pad">
            <PhotoPicker
              label="Foto realizace"
              kind="realizace"
              orderId={orderId}
              itemId={undefined}
              saved={realizace}
              pending={pending}
              onPendingChange={async (next) => {
                // Fotky realizace patří zakázce, ne položce — nahrávají se rovnou.
                const added = next.filter((p) => !pending.some((x) => x.id === p.id));
                setPending([]);
                for (const p of added) {
                  await api("/api/photos", {
                    method: "POST",
                    body: { order_id: orderId, kind: "realizace", data: p.data },
                  });
                }
                invalidate(orderId);
              }}
              onUploaded={() => invalidate(orderId)}
            />
          </section>
        </>
      )}

      {padOpen && order && (
        <SignaturePad
          orderId={orderId}
          clientName={order.customer_name || order.contact_name}
          onClose={() => setPadOpen(false)}
          onSaved={() => {
            // hlášku „Podpis uložen." ukazuje samotný SignaturePad
            setPadOpen(false);
            void invalidate(orderId);
          }}
        />
      )}
    </TechDetail>
  );
}
