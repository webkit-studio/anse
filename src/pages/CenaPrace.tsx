import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HOURLY_RATE } from "@shared/types";
import { money } from "@shared/format";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder } from "../api/hooks";
import { TechDetail } from "../components/Shell";
import { useToast } from "../components/Toast";
import { Button, Spinner } from "../components/ui";

/** Presety podle sazby — technik si cenu určuje sám, tohle je jen zkratka. */
const PRESETS = [
  { label: "2 hodiny", hours: 2 },
  { label: "Půl dne", hours: 4 },
  { label: "Celý den", hours: 8 },
  { label: "Dva dny", hours: 16 },
];

export default function CenaPracePage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const invalidate = useInvalidateOrder();
  const order = detail.data?.order;

  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order || loaded) return;
    setValue(order.price_montage.replace(/[^\d]/g, ""));
    setLoaded(true);
  }, [order, loaded]);

  const amount = Number(value || 0);

  async function save(andSend: boolean) {
    if (!order || busy) return;
    if (!value.trim()) {
      toast("Zadej cenu své práce.");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: { price_montage: value, expected_updated_at: order.updated_at },
      });
      await invalidate(orderId);

      if (andSend) {
        const fresh = await api<{ order: { updated_at: string; phase: string } }>(
          `/api/orders/${orderId}`,
        ).then((r) => r.order);
        await api(`/api/orders/${orderId}/phase`, {
          method: "POST",
          body: { to: "k_naceneni", expected: fresh.phase },
        });
        await invalidate(orderId);
        toast("Odesláno k nacenění");
      } else {
        toast("Cena práce uložená");
      }
      navigate(`/zakazky/${orderId}`);
    } catch (err) {
      if (isConflict(err)) {
        toast("Zakázku mezitím někdo změnil. Načítám znovu.");
        void detail.refetch();
        setLoaded(false);
      } else {
        toast(err instanceof Error ? err.message : "Cenu se nepodařilo uložit.");
      }
      setBusy(false);
    }
  }

  const blockingLeft = (detail.data?.blocking ?? []).filter((b) => b !== "Cena práce");

  return (
    <TechDetail
      back={`/zakazky/${orderId}`}
      backLabel="Zakázka"
      footer={
        <>
          <Button variant="secondary" className="btn-narrow" onClick={() => void save(false)} disabled={busy}>
            Uložit
          </Button>
          <Button variant="primary" onClick={() => void save(true)} disabled={busy}>
            {busy ? "Odesílám…" : "Odeslat k nacenění"}
          </Button>
        </>
      }
    >
      {!order && <Spinner />}
      {order && (
        <>
          <p className="queue-title" style={{ marginTop: 4 }}>
            Krok 2 ze 2
          </p>
          <h1 className="t-title" style={{ margin: "2px 0 0" }}>
            Cena práce
          </h1>
          <p className="muted t-body-s" style={{ margin: 0 }}>
            Kolik si účtuješ za montáž. Do ceny pro zákazníka ji promítne kancelář.
          </p>

          <div className="card card-pad">
            <input
              className="amount-input"
              inputMode="numeric"
              value={value}
              autoFocus
              aria-label="Cena práce v korunách"
              placeholder="0"
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            />
            <p className="muted t-body-s" style={{ textAlign: "center", margin: 0 }}>
              {amount > 0 ? money(value) : `sazba ${HOURLY_RATE} Kč/h`}
            </p>
          </div>

          <div className="preset-grid">
            {PRESETS.map((p) => {
              const total = String(p.hours * HOURLY_RATE);
              return (
                <button
                  key={p.label}
                  type="button"
                  className={`preset ${value === total ? "preset-active" : ""}`}
                  onClick={() => setValue(total)}
                >
                  <span className="preset-label">{p.label}</span>
                  <span className="preset-value">{money(total)}</span>
                </button>
              );
            })}
          </div>

          {blockingLeft.length > 0 && (
            <div className="warn-bar">
              <span aria-hidden="true">●</span>
              <span>
                K odeslání ještě chybí:
                <ul className="blocking-list">
                  {blockingLeft.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </span>
            </div>
          )}
        </>
      )}
    </TechDetail>
  );
}
