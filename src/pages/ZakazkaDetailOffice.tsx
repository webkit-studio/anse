import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ItemRow, JwCsvNabidka, OrderPhase } from "@shared/types";
import { PHASE_FLOW, PHASE_LABELS } from "@shared/types";
import { czDate, items as czItems, money } from "@shared/format";
import { missingForPdf } from "@shared/print";
import { api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder, useUsers } from "../api/hooks";
import { MiniCalendar } from "../components/DateSheet";
import { Icon } from "../components/Icon";
import { PhotoLightbox } from "../components/PhotoLightbox";
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
  copyText,
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


/**
 * Podklady pro dodavatele. Portál Jack Westu umí objednávku načíst ze souboru:
 * kancelář založí poptávku, dá „Import CSV" a položky se nasypou samy. Soubor
 * je vždy na JEDEN výrobek — každý má v portálu jinou masku — takže se stahuje
 * po výrobcích. Co jde stáhnout, rozhoduje server.
 */
function ExportyDodavateli({
  orderId,
  nabidky,
  toast,
}: {
  orderId: string;
  nabidky: JwCsvNabidka[];
  toast: (t: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <h3 className="card-section-title" style={{ margin: "4px 0 0" }}>
        Podklady pro dodavatele
      </h3>

      {nabidky.map((n) => (
        <div key={n.subcategory_id} style={{ display: "grid", gap: 4 }}>
          {/* Zkratka místo celého názvu: přesně ji kancelář vidí v portálu
              ve sloupci Výrobek, takže se soubor pozná i bez čtení názvu —
              a popisek se vejde na jeden řádek. Počet je pod tlačítkem. */}
          <Button
            variant="secondary"
            title={n.nazev}
            onClick={() => void download(`/export/jw-csv/${orderId}/${n.subcategory_id}`, toast)}
          >
            CSV pro Jack West · {n.zkratka}
          </Button>
          <p className="field-help">
            {czItems(n.pocet)} v souboru.{" "}
            {n.overeno
              ? "Sloupce sedí na vzor od výrobce."
              : `Sloupce pro ${n.zkratka} nemáme potvrzené vzorem od výrobce — portál po importu nabídne opravu hodnot, první objednávku projdi, než ji odešleš.`}
          </p>
        </div>
      ))}

      <Button
        variant="secondary"
        onClick={() => void download(`/export/dodavatel-xml/${orderId}`, toast)}
      >
        Export XML pro dodavatele
      </Button>
    </div>
  );
}

/**
 * Rozbalený detail položky pro kancelář. Objednává se ručním přepisem do
 * konfigurátoru dodavatele, takže tady rozhoduje přehlednost: parametry ve
 * skupinách a pořadí formuláře dodavatele, u každého i kód, který se do
 * konfigurátoru opisuje, a tlačítko na zkopírování celé skupiny.
 */
function PolozkaDetail({
  item,
  nazev,
  mistnost,
  orderId,
  onFoto,
}: {
  item: ItemRow;
  nazev: string;
  mistnost?: string;
  orderId: string;
  onFoto: (photoId: string) => void;
}) {
  const [zkopirovano, setZkopirovano] = useState(false);
  const skupiny = item.params_view ?? [];

  useEffect(() => {
    if (!zkopirovano) return;
    const t = setTimeout(() => setZkopirovano(false), 1600);
    return () => clearTimeout(t);
  }, [zkopirovano]);

  const vseTextem = [
    `${nazev}${mistnost ? ` · ${mistnost}` : ""}`,
    ...skupiny.flatMap((sk) => [
      "",
      sk.nazev,
      ...sk.polozky.map((p) => `${p.label}: ${p.value}${p.value === p.code ? "" : ` (${p.code})`}`),
    ]),
    ...(item.note ? ["", `Poznámka: ${item.note}`] : []),
  ].join("\n");

  return (
    <div className="polozka-detail">
      <div className="polozka-detail-head">
        <span className="polozka-detail-nazev">{nazev}</span>
        {mistnost && <span className="muted t-body-s">{mistnost}</span>}
        <button
          type="button"
          className={`btn btn-ghost ${zkopirovano ? "btn-ok" : ""}`}
          onClick={() => void copyText(vseTextem).then(setZkopirovano)}
        >
          <Icon name={zkopirovano ? "hotovo" : "kopie"} size={17} />{" "}
          {zkopirovano ? "Zkopírováno" : "Zkopírovat vše"}
        </button>
        <Link to={`/zakazky/${orderId}/polozka/${item.id}`} className="btn btn-secondary">
          <Icon name="tuzka" size={16} /> Upravit
        </Link>
      </div>

      {item.kind === "oprava" ? (
        <p className="polozka-defekt">{item.defect_note || "Bez popisu závady."}</p>
      ) : skupiny.length === 0 ? (
        <p className="muted t-body-s">U téhle položky nejsou vyplněné žádné parametry.</p>
      ) : (
        <div className="param-skupiny">
          {skupiny.map((sk) => (
            <section className="param-skupina" key={sk.nazev}>
              <h3 className="param-skupina-nazev">{sk.nazev}</h3>
              <dl className="param-list">
                {sk.polozky.map((par) => (
                  <div className="param-radek" key={par.label + par.code}>
                    <dt>{par.label}</dt>
                    <dd>
                      {par.value}
                      {par.value !== par.code && <span className="param-kod">{par.code}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}

      {item.note && (
        <p className="polozka-poznamka">
          <strong>Poznámka technika:</strong> {item.note}
        </p>
      )}

      {item.photos.length > 0 && (
        <div className="polozka-fotky">
          {item.photos.map((f) => (
            <button
              type="button"
              className="photo-slot"
              key={f.id}
              onClick={() => onFoto(f.id)}
              aria-label={`Otevřít fotku k ${nazev}`}
            >
              <img src={f.data} alt={`Fotka k ${nazev}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [foto, setFoto] = useState<number | null>(null);
  const [otevrenaPolozka, setOtevrenaPolozka] = useState<string | null>(null);

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
  // Fotka bez popisu je k ničemu — kancelář musí vědět, co na ní hledat.
  const fotky = d
    ? [
        ...d.items.flatMap((i) =>
          i.photos.map((p) => ({
            id: p.id,
            data: p.data,
            popis: `${i.subcategory_name || i.product_type_name}${
              d.rooms.find((r) => r.id === i.room_id)?.name
                ? ` · ${d.rooms.find((r) => r.id === i.room_id)!.name}`
                : ""
            }`,
          })),
        ),
        ...d.photos.map((p) => ({ id: p.id, data: p.data, popis: "K celé zakázce" })),
      ]
    : [];

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
                  onSave={(v) => patch({ customer_name: v })}
                />
                <ValueRow
                  label="Telefon"
                  kind="tel"
                  value={order.customer_phone}
                  placeholder="doplnit telefon"
                  onSave={(v) => patch({ customer_phone: v })}
                />
                <ValueRow
                  label="E-mail"
                  kind="email"
                  value={order.customer_email}
                  placeholder="doplnit e-mail"
                  onSave={(v) => patch({ customer_email: v })}
                />
                <ValueRow
                  label="Adresa montáže"
                  kind="adresa"
                  value={order.addr_montaz}
                  placeholder="doplnit adresu"
                  onSave={(v) => patch({ addr_montaz: v })}
                />
                {/* Vlastní fakturační adresa přebíjí montážní; dokud se
                    nevyplní, ukazuje se montážní. Měnit jde vždycky. */}
                <ValueRow
                  label="Fakturační adresa"
                  kind="adresa"
                  value={order.addr_fakt.trim() || order.addr_montaz}
                  editValue={order.addr_fakt}
                  hint={order.addr_fakt.trim() ? undefined : "stejná jako montážní"}
                  placeholder="stejná jako montážní"
                  onSave={(v) => patch({ addr_fakt: v, addr_fakt_same: v.trim() === "" })}
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
                  onSave={(v) => patch({ price_montage: v })}
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
                      const nazev =
                        i.kind === "oprava"
                          ? `Oprava — ${i.product_type_name}`
                          : i.subcategory_name || i.product_type_name;
                      const rozbaleno = otevrenaPolozka === i.id;
                      return (
                        <Fragment key={i.id}>
                        {/* Klik rozbalí všechny parametry — kancelář je přepisuje
                            do konfigurátoru dodavatele a potřebuje je vidět. */}
                        <tr
                          className="row-link"
                          aria-expanded={rozbaleno}
                          onClick={() => setOtevrenaPolozka(rozbaleno ? null : i.id)}
                        >
                          <td className="cell-muted">{room?.name ?? "—"}</td>
                          <td className="cell-strong">
                            <span className="polozka-caret" aria-hidden="true">
                              {rozbaleno ? "▾" : "▸"}
                            </span>
                            {nazev}
                          </td>
                          <td className="num">{rozmer}</td>
                          <td className="cell-muted">
                            {[i.kind === "oprava" ? i.defect_note : "", i.note]
                              .filter(Boolean)
                              .join(" – ") || "—"}
                          </td>
                        </tr>
                        {rozbaleno && (
                          <tr className="polozka-detail-row">
                            <td colSpan={4}>
                              <PolozkaDetail
                                item={i}
                                nazev={nazev}
                                mistnost={room?.name}
                                orderId={orderId}
                                onFoto={(id) => {
                                  const idx = fotky.findIndex((f) => f.id === id);
                                  if (idx >= 0) setFoto(idx);
                                }}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
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
                  {fotky.map((p, i) => (
                    <button
                      type="button"
                      className="photo-slot"
                      key={p.id}
                      title={p.popis}
                      aria-label={`Otevřít fotku — ${p.popis}`}
                      onClick={() => setFoto(i)}
                    >
                      <img src={p.data} alt={p.popis} />
                    </button>
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

                <ExportyDodavateli orderId={orderId} nabidky={d?.jw_csv ?? []} toast={toast} />
                <Button
                  variant="ghost"
                  onClick={() => toast("Import z Nevy zatím není napojený — ceny zadej ručně.")}
                >
                  Import z Nevy
                </Button>
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
                {/* Fáze jdou jen dopředu: kdyby import u dodavatele nevyšel,
                    tady se soubor dá stáhnout znovu. */}
                <ExportyDodavateli orderId={orderId} nabidky={d?.jw_csv ?? []} toast={toast} />
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
                {/* Napřed uzavřít, teprve pak stahovat. Obráceně to vypadalo,
                    že se montážní list musí stáhnout hned a pak už nepůjde —
                    přitom jde stáhnout kdykoli, i po uzavření. */}
                <Button
                  variant="primary"
                  className="btn-block"
                  disabled={busy || pdfMissing.length > 0}
                  onClick={() => void movePhase("hotovo")}
                >
                  Hotovo
                </Button>
                {pdfMissing.length > 0 && (
                  <p className="field-help">Chybí: {pdfMissing.join(", ")}.</p>
                )}
                <Button
                  variant="secondary"
                  className="btn-block"
                  disabled={pdfMissing.length > 0}
                  onClick={() => void download(`/export/montazni-list-pdf/${orderId}`, toast)}
                >
                  Stáhnout montážní list
                </Button>
              </>
            )}

            {order.phase === "hotovo" && (
              <Button
                variant="secondary"
                className="btn-block"
                onClick={() => void download(`/export/montazni-list-pdf/${orderId}`, toast)}
              >
                Stáhnout montážní list
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

      {foto !== null && (
        <PhotoLightbox photos={fotky} index={foto} onIndex={setFoto} onClose={() => setFoto(null)} />
      )}
    </OfficeShell>
  );
}
