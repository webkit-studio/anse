import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { OrderPhase } from "@shared/types";
import { PHASE_FLOW, PHASE_LABELS } from "@shared/types";
import { czDate, items as czItems, money } from "@shared/format";
import { missingForPdf } from "@shared/print";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder, useUsers } from "../api/hooks";
import { MiniCalendar } from "../components/DateSheet";
import { OfficeShell } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  CancelBlock,
  ConfirmButton,
  ErrorBanner,
  Field,
  NativeSelect,
  PhaseBadge,
  SkeletonList,
  TextInput,
  ToneBadge,
  ValueRow,
  useDelayed,
} from "../components/ui";

/** Stažení souboru z /export/* — cookie session, žádný token v URL. */
async function download(url: string, toast: (t: string) => void) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    toast(body.error ?? "Export se nepodařil.");
    return;
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "export";
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function ZakazkaDetailOfficePage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const users = useUsers(true);
  const invalidate = useInvalidateOrder();
  const showSkeleton = useDelayed(detail.isPending);

  const d = detail.data;
  const order = d?.order;

  const [price, setPrice] = useState("");
  const [invoice, setInvoice] = useState("");
  const [calOpen, setCalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!order || loaded) return;
    setPrice((order.price_customer ?? "").replace(/[^\d]/g, ""));
    setInvoice(order.invoice_no);
    setLoaded(true);
  }, [order, loaded]);

  async function patch(body: Record<string, unknown>) {
    if (!order) return;
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: { ...body, expected_updated_at: order.updated_at },
      });
      await invalidate(orderId);
    } catch (err) {
      if (isConflict(err)) {
        toast("Zakázku mezitím někdo změnil. Načítám znovu.");
        void detail.refetch();
        setLoaded(false);
      } else {
        toast(err instanceof Error ? err.message : "Nepodařilo se uložit.");
      }
    }
  }

  async function movePhase(to: OrderPhase, reason = "") {
    if (!order || busy) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/phase`, {
        method: "POST",
        body: { to, expected: order.phase, reason },
      });
      await invalidate(orderId);
      toast(`Posunuto na „${PHASE_LABELS[to]}“`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se posunout zakázku.");
    } finally {
      setBusy(false);
    }
  }

  if (detail.isError) {
    return (
      <OfficeShell title="Zakázka">
        <ErrorBanner message="Zakázku se nepodařilo načíst." onRetry={() => detail.refetch()} />
      </OfficeShell>
    );
  }

  const currentIndex = order ? PHASE_FLOW.indexOf(order.phase) : -1;
  const pdfMissing = order
    ? missingForPdf({ invoice_no: order.invoice_no, signed: !!order.signed_at })
    : [];

  return (
    <OfficeShell
      title={order ? order.customer_name?.trim() || order.contact_name : "Zakázka"}
      subtitle={order?.addr_montaz}
      actions={
        <Button variant="secondary" onClick={() => navigate("/zakazky")}>
          ← Zpět na seznam
        </Button>
      }
    >
      {detail.isPending && showSkeleton && <SkeletonList cards={2} />}

      {d && order && (
        <div className="detail-grid">
          <div style={{ display: "grid", gap: 22 }}>
            <section className="card card-pad">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <PhaseBadge phase={order.phase} role="kancelar" />
                {order.signed_at && <ToneBadge tone="done">Podepsáno</ToneBadge>}
                <span className="muted t-caption" style={{ marginLeft: "auto" }}>
                  {czItems(d.items.length)}
                </span>
              </div>

              <div className="value-rows">
                <ValueRow
                  label="Jméno"
                  value={order.customer_name}
                  placeholder="doplnit jméno"
                  onSave={(v) => void patch({ customer_name: v })}
                />
                <ValueRow
                  label="Telefon"
                  kind="tel"
                  value={order.customer_phone}
                  placeholder="doplnit telefon"
                  onSave={(v) => void patch({ customer_phone: v })}
                />
                <ValueRow
                  label="E-mail"
                  kind="email"
                  value={order.customer_email}
                  placeholder="doplnit e-mail"
                  onSave={(v) => void patch({ customer_email: v })}
                />
                <ValueRow
                  label="Adresa montáže"
                  kind="adresa"
                  value={order.addr_montaz}
                  placeholder="doplnit adresu"
                  onSave={(v) => void patch({ addr_montaz: v })}
                />
                <ValueRow
                  label="Fakturační adresa"
                  kind="adresa"
                  value={order.addr_fakt_same ? order.addr_montaz : order.addr_fakt}
                  hint={order.addr_fakt_same ? "stejná jako montážní" : undefined}
                  placeholder={order.addr_fakt_same ? "podle montážní" : "doplnit adresu"}
                  onSave={order.addr_fakt_same ? undefined : (v) => void patch({ addr_fakt: v })}
                />
                <ValueRow
                  label="IČO / DIČ"
                  value={[order.ico, order.dic].filter(Boolean).join(" / ")}
                  placeholder="jen u firem"
                  copy={!!order.ico || !!order.dic}
                  onSave={(v) => {
                    const [ico = "", dic = ""] = v.split("/").map((s) => s.trim());
                    void patch({ ico, dic });
                  }}
                />
                <ValueRow
                  label="Zaměřeno"
                  copy={false}
                  value={
                    czDate(order.measured_at) +
                    (order.measured_time ? ` v ${order.measured_time}` : "")
                  }
                />
                <ValueRow
                  label="Cena práce technika"
                  kind="castka"
                  copy={false}
                  value={order.price_montage.trim() ? money(order.price_montage) : ""}
                  editValue={order.price_montage}
                  placeholder="zadá technik"
                  onSave={(v) => void patch({ price_montage: v })}
                />
                <ValueRow label="Technik" value="">
                  <NativeSelect
                    value={order.assignee_id ?? ""}
                    placeholder="Nepřidělen"
                    aria-label="Technik"
                    onChange={(e) => void patch({ assignee_id: e.target.value || null })}
                  >
                    {(users.data?.users ?? [])
                      .filter((u) => u.active)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </NativeSelect>
                </ValueRow>
              </div>
            </section>

            <section>
              <h2 className="card-section-title">Položky</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Místnost</th>
                      <th>Produkt</th>
                      <th>Rozměry</th>
                      <th>Poznámka</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((i) => {
                      const room = d.rooms.find((r) => r.id === i.room_id);
                      // U položek z konfigurátoru posílá souhrn server (klíče
                      // polí jsou kódy dodavatele, ne sirka/vyska).
                      const w = i.params.sirka ?? i.params.width;
                      const h = i.params.vyska ?? i.params.height;
                      const rozmer = i.konfig_summary || (w && h ? `${w} × ${h}` : "—");
                      return (
                        <tr key={i.id}>
                          <td className="cell-muted">{room?.name ?? "—"}</td>
                          <td className="cell-strong">
                            {i.kind === "oprava"
                              ? `Oprava — ${i.product_type_name}`
                              : i.subcategory_name || i.product_type_name}
                          </td>
                          <td className="num">{rozmer}</td>
                          <td className="cell-muted">
                            {[i.kind === "oprava" ? i.defect_note : "", i.note]
                              .filter(Boolean)
                              .join(" – ") || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d.items.length === 0 && <p className="muted t-body-s">Zatím žádné položky.</p>}
            </section>

            {(d.photos.length > 0 || d.items.some((i) => i.photos.length > 0)) && (
              <section>
                <h2 className="card-section-title">Fotky</h2>
                <div className="photo-grid" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
                  {[...d.items.flatMap((i) => i.photos), ...d.photos].map((p) => (
                    <a
                      className="photo-slot"
                      key={p.id}
                      href={p.data}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src={p.data} alt="" />
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* --- panel aktuální fáze --------------------------------------- */}
          <aside className="panel">
            <div className="panel-phase">
              <PhaseBadge phase={order.phase} role="kancelar" />
              <span className="muted t-caption" style={{ marginLeft: "auto" }}>
                {order.order_no || "bez čísla"}
              </span>
            </div>

            <div className="stepper">
              {PHASE_FLOW.map((p, i) => (
                <div
                  key={p}
                  className={`step ${i < currentIndex ? "step-done" : i === currentIndex ? "step-active" : "step-locked"}`}
                >
                  <span className="step-mark" aria-hidden="true">
                    {i < currentIndex ? "✓" : i === currentIndex ? i + 1 : "○"}
                  </span>
                  {PHASE_LABELS[p]}
                </div>
              ))}
            </div>

            {order.phase === "k_zamereni" && (
              <p className="muted t-body-s">
                Zaměřuje technik. Až pošle podklady, objeví se tu cena a termín dodání.
              </p>
            )}

            {order.phase === "k_naceneni" && (
              <>
                <Field label="Cena zakázky" htmlFor="p-cena" required>
                  <div className="input-unit">
                    <TextInput
                      id="p-cena"
                      inputMode="numeric"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                      onBlur={() =>
                        price !== (order.price_customer ?? "") &&
                        void patch({ price_customer: price })
                      }
                    />
                    <span className="input-unit-label">Kč</span>
                  </div>
                </Field>
                <p className="field-help" style={{ marginTop: -8 }}>
                  Přepiš z nacenění. Cena práce technika {money(order.price_montage)} je její
                  součástí.
                </p>

                <div style={{ position: "relative" }}>
                  <span className="field-label">Termín dodání *</span>
                  <button
                    type="button"
                    className="select-sheet-trigger"
                    aria-haspopup="dialog"
                    aria-expanded={calOpen}
                    onClick={() => setCalOpen((v) => !v)}
                  >
                    <span>{order.term_dodani ? czDate(order.term_dodani) : "Vyber datum"}</span>
                    <span aria-hidden="true">▾</span>
                  </button>
                  {calOpen && (
                    <MiniCalendar
                      value={order.term_dodani}
                      onClose={() => setCalOpen(false)}
                      onPick={(iso) => {
                        setCalOpen(false);
                        void patch({ term_dodani: iso });
                      }}
                    />
                  )}
                </div>

                <Button
                  variant="primary"
                  className="btn-block"
                  disabled={busy || !order.price_customer?.trim() || !order.term_dodani}
                  onClick={() => void movePhase("k_montazi")}
                >
                  Objednáno
                </Button>
                {(!order.price_customer?.trim() || !order.term_dodani) && (
                  <p className="field-help">
                    Chybí:{" "}
                    {[
                      !order.price_customer?.trim() && "cena zakázky",
                      !order.term_dodani && "termín dodání",
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}

                <div style={{ display: "grid", gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() => void download(`/export/dodavatel-xml/${orderId}`, toast)}
                  >
                    Export XML pro dodavatele
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => toast("Import z Nevy zatím není napojený — ceny zadej ručně.")}
                  >
                    Import z Nevy
                  </Button>
                </div>
              </>
            )}

            {order.phase === "k_montazi" && (
              <>
                <div className="meta-row">
                  <span className="meta-label">Termín dodání</span>
                  <span className="meta-value">{czDate(order.term_dodani)}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Termín montáže</span>
                  <span className="meta-value">
                    {order.term_montaz ? czDate(order.term_montaz) : "zadá technik"}
                  </span>
                </div>
                <p className="muted t-body-s">
                  Montuje technik. Po podpisu se zakázka posune k fakturaci.
                </p>
              </>
            )}

            {order.phase === "k_fakturaci" && (
              <>
                <Field label="Číslo faktury" htmlFor="p-fa" required>
                  <TextInput
                    id="p-fa"
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value)}
                    onBlur={() =>
                      invoice !== order.invoice_no && void patch({ invoice_no: invoice })
                    }
                  />
                </Field>
                <Button
                  variant="system"
                  className="btn-block"
                  disabled={pdfMissing.length > 0}
                  onClick={() => void download(`/export/montazni-list-pdf/${orderId}`, toast)}
                >
                  Vystavit montážní list
                </Button>
                {pdfMissing.length > 0 && (
                  <p className="field-help">Chybí: {pdfMissing.join(", ")}.</p>
                )}
                <Button
                  variant="primary"
                  className="btn-block"
                  disabled={busy || pdfMissing.length > 0}
                  onClick={() => void movePhase("hotovo")}
                >
                  Hotovo
                </Button>
              </>
            )}

            {order.phase === "hotovo" && (
              <Button
                variant="secondary"
                className="btn-block"
                onClick={() => void download(`/export/montazni-list-pdf/${orderId}`, toast)}
              >
                Montážní list (PDF)
              </Button>
            )}

            {order.phase === "zruseno" && (
              <>
                <p className="muted t-body-s">Zrušeno: {order.cancelled_reason || "bez důvodu"}</p>
                <Button
                  variant="system"
                  className="btn-block"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/api/orders/${orderId}/restore`, {
                        method: "POST",
                      });
                      await invalidate(orderId);
                      toast("Zakázka obnovená — vrací se tam, kde byla.");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : "Obnova se nepodařila.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Obnovit zakázku
                </Button>
              </>
            )}

            {order.phase !== "hotovo" && order.phase !== "zruseno" && (
              <div
                style={{
                  borderTop: "1px solid var(--c-hairline)",
                  paddingTop: 12,
                }}
              >
                <CancelBlock
                  label="Zrušit zakázku"
                  onCancel={(reason) => void movePhase("zruseno", reason)}
                />
              </div>
            )}

            <ConfirmButton
              label="Smazat zakázku"
              confirmLabel="Opravdu nenávratně smazat?"
              className="order-delete"
              onConfirm={async () => {
                await api(`/api/orders/${orderId}`, { method: "DELETE" });
                await invalidate(orderId);
                toast("Zakázka smazaná");
                navigate("/zakazky");
              }}
            />
          </aside>
        </div>
      )}
    </OfficeShell>
  );
}
