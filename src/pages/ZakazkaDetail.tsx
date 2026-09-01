import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FormDefinition } from "@shared/form-schema";
import type { ItemRow, OrderDetail } from "@shared/types";
import { czDate, czDateShort, items as czItems, money } from "@shared/format";
import { api } from "../api/client";
import { useInvalidateOrder, useMe, useOrder } from "../api/hooks";
import { DateSheet } from "../components/DateSheet";
import { Icon } from "../components/Icon";
import { ProductIcon } from "../components/ProductIcon";
import { TechDetail } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  CancelBlock,
  ErrorBanner,
  PhaseBadge,
  SkeletonList,
  ToneBadge,
  useDelayed,
} from "../components/ui";

/** Kolik údajů zákazníka chybí (badge u rozbalovací sekce). */
function missingCustomer(o: OrderDetail["order"]): number {
  return [o.customer_name, o.customer_phone, o.customer_email, o.addr_montaz].filter(
    (v) => !v.trim(),
  ).length;
}

/** Souhrn položky: rozměr · strana · barva (printMap definice, u konfigurátoru
 *  ho počítá server). */
function itemSummary(item: ItemRow, def?: FormDefinition): string {
  if (item.kind === "oprava") return item.defect_note;
  if (item.konfig_summary) return item.konfig_summary;
  if (!def) return "";
  const v = (key: string | null) => {
    const raw = key ? item.params[key] : undefined;
    return raw === undefined || raw === null || raw === "" ? "" : String(raw);
  };
  const w = v(def.printMap.sirka);
  const h = v(def.printMap.vyska);
  return [w && h ? `${w} × ${h} mm` : "", v(def.printMap.strana), v(def.printMap.barva)]
    .filter(Boolean)
    .join(" · ");
}

function ItemCard({
  item,
  orderId,
  def,
}: {
  item: ItemRow;
  orderId: string;
  def?: FormDefinition;
}) {
  const summary = itemSummary(item, def);

  return (
    <Link
      to={`/zakazky/${orderId}/polozka/${item.id}`}
      className={`card-link ${item.kind === "oprava" ? "repair-card" : ""}`}
      style={{ borderRadius: "var(--radius)" }}
    >
      <span style={{ flex: "none", color: "var(--c-text-muted)" }}>
        <ProductIcon name={item.product_type_name} />
      </span>
      <span className="card-main">
        <span className="card-title" style={{ fontSize: 15 }}>
          {item.kind === "oprava" ? "Oprava" : item.subcategory_name || item.product_type_name}
        </span>
        <span className="card-sub">{summary || item.product_type_name}</span>
      </span>
      {item.photos.length > 0 && (
        <span
          className="muted t-caption"
          style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 3 }}
        >
          {item.photos.length}
          <Icon name="foto" size={15} />
        </span>
      )}
      <span className="card-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export default function ZakazkaDetailPage() {
  const { orderId = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const invalidate = useInvalidateOrder();
  const showSkeleton = useDelayed(detail.isPending);

  const [showCustomer, setShowCustomer] = useState(false);
  const [montazOpen, setMontazOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const role = me.data?.role ?? "technik";
  const d = detail.data;
  const order = d?.order;

  async function setTermMontaz(iso: string) {
    if (!order) return;
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: { term_montaz: iso, expected_updated_at: order.updated_at },
      });
      await invalidate(orderId);
      toast(`Termín montáže ${czDate(iso)}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Termín se nepodařilo uložit.");
    }
  }

  async function movePhase(to: string, reason = "") {
    if (!order || busy) return;
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/phase`, {
        method: "POST",
        body: { to, expected: order.phase, reason },
      });
      await invalidate(orderId);
      toast(to === "zruseno" ? "Zakázka zrušená" : "Hotovo, odesláno");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se posunout zakázku.");
    } finally {
      setBusy(false);
    }
  }

  if (detail.isError) {
    return (
      <TechDetail back="/zakazky" backLabel="Zakázky">
        <ErrorBanner message="Zakázku se nepodařilo načíst." onRetry={() => detail.refetch()} />
      </TechDetail>
    );
  }

  // Patka podle fáze — jedno hlavní tlačítko, ať je jasné, co se čeká.
  let footer: JSX.Element | undefined;
  if (order) {
    if (order.phase === "k_zamereni") {
      // CTA říká rovnou, jaký krok chybí — místo obecného tlačítka s překvapením.
      const blocking = d?.blocking ?? [];
      const noItems = (d?.items.length ?? 0) === 0;
      const next = noItems
        ? { label: "Přidat první položku", act: () => navigate(`/zakazky/${orderId}/polozka/nova`) }
        : blocking.includes("Údaje zákazníka")
          ? { label: "Doplnit údaje zákazníka", act: () => navigate(`/zakazky/${orderId}/zakaznik`) }
          : blocking.includes("Cena práce")
            ? { label: "Doplnit cenu práce", act: () => navigate(`/zakazky/${orderId}/cena`) }
            : { label: "K nacenění — odeslat", act: () => void movePhase("k_naceneni") };

      footer = (
        <>
          {!noItems && (
            <Button
              variant="secondary"
              className="btn-narrow"
              onClick={() => navigate(`/zakazky/${orderId}/polozka/nova`)}
            >
              ＋ Položka
            </Button>
          )}
          <Button variant="primary" disabled={busy} onClick={next.act}>
            {next.label}
          </Button>
        </>
      );
    } else if (order.phase === "k_naceneni") {
      footer = (
        <Button
          variant="secondary"
          onClick={() => toast("Zakázku má teď kancelář — nacení ji a objedná.")}
        >
          Čeká na kancelář
        </Button>
      );
    } else if (order.phase === "k_montazi") {
      footer = order.term_montaz ? (
        <Button variant="system" onClick={() => navigate(`/zakazky/${orderId}/montaz`)}>
          Podepsat
        </Button>
      ) : (
        <Button variant="secondary" disabled>
          Zadej termín montáže
        </Button>
      );
    } else if (order.phase === "k_fakturaci") {
      footer = (
        <Button variant="secondary" onClick={() => toast("Zakázka je hotová, fakturuje kancelář.")}>
          ✓ Hotovo
        </Button>
      );
    } else if (order.phase === "hotovo") {
      footer = (
        <Button variant="secondary" onClick={() => toast("Montážní list vystavuje kancelář.")}>
          Montážní list
        </Button>
      );
    }
  }

  return (
    <TechDetail
      back="/zakazky"
      backLabel="Zakázky"
      headRight={order && <PhaseBadge phase={order.phase} role={role} />}
      footer={footer}
    >
      {detail.isPending && showSkeleton && <SkeletonList cards={2} />}

      {d && order && (
        <>
          <div>
            <h1 className="t-title" style={{ margin: "4px 0 2px" }}>
              {order.customer_name?.trim() || order.contact_name}
            </h1>
            <p className="muted t-body-s" style={{ margin: 0 }}>
              {order.addr_montaz || "adresa montáže se doplní"}
            {d.items.length > 0 ? ` · ${czItems(d.items.length)}` : ""}
            </p>
          </div>

          {order.phase === "zruseno" && order.cancelled_reason && (
            <div className="warn-bar">Zrušeno: {order.cancelled_reason}</div>
          )}

          {order.phase === "k_montazi" && (
            <>
              <div className="dark-card">
                <div className="dark-card-label">Termín dodání</div>
                <div className="dark-card-value">{czDate(order.term_dodani)}</div>
                <div className="dark-card-sub">zadává kancelář</div>
              </div>
              <button type="button" className="card card-link" onClick={() => setMontazOpen(true)}>
                <span className="card-main">
                  <span className="meta-label">Termín montáže</span>
                  <span className="card-title" style={{ fontSize: 16 }}>
                    {order.term_montaz ? czDate(order.term_montaz) : "Zadat termín"}
                  </span>
                </span>
                <span className="card-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </>
          )}

          {d.blocking.length > 0 && order.phase !== "zruseno" && (
            <div className="warn-bar">
              <span aria-hidden="true">●</span>
              <span>
                Než pošleš dál, chybí:
                <ul className="blocking-list">
                  {d.blocking.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </span>
            </div>
          )}

          <section className="card">
            <div className="card-pad" style={{ paddingBottom: 0 }}>
              <div className="meta-row">
                <span className="meta-label">Zaměření</span>
                <span className="meta-value">
                  {czDateShort(order.measured_at)}
                  {order.measured_time ? ` v ${order.measured_time}` : ""}
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Položek</span>
                <span className="meta-value">{d.items.length}</span>
              </div>
              <div className="meta-row">
                <span className="meta-label">Cena práce</span>
                <span className="meta-value">{money(order.price_montage)}</span>
              </div>
              {role === "kancelar" && (
                <div className="meta-row">
                  <span className="meta-label">Cena zakázky</span>
                  <span className="meta-value">{money(order.price_customer)}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className="disclosure"
              aria-expanded={showCustomer}
              onClick={() => setShowCustomer((v) => !v)}
            >
              <span>Další údaje zákazníka</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {missingCustomer(order) > 0 && (
                  <span className="disclosure-badge">chybí {missingCustomer(order)}</span>
                )}
                <span aria-hidden="true">{showCustomer ? "▴" : "▾"}</span>
              </span>
            </button>

            {showCustomer && (
              <div className="card-pad" style={{ paddingTop: 0 }}>
                <div className="meta-row">
                  <span className="meta-label">Jméno</span>
                  <span className="meta-value">{order.customer_name || "—"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Telefon</span>
                  <span className="meta-value">{order.customer_phone || "—"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">E-mail</span>
                  <span className="meta-value">{order.customer_email || "—"}</span>
                </div>
                <div className="meta-row">
                  <span className="meta-label">Fakturační adresa</span>
                  <span className="meta-value">
                    {order.addr_fakt_same
                      ? `${order.addr_montaz || "—"}${order.addr_montaz ? " (stejná)" : ""}`
                      : order.addr_fakt || "—"}
                  </span>
                </div>
                {(order.ico || order.dic) && (
                  <div className="meta-row">
                    <span className="meta-label">IČO / DIČ</span>
                    <span className="meta-value">
                      {[order.ico, order.dic].filter(Boolean).join(" / ")}
                    </span>
                  </div>
                )}
                <Link
                  to={`/zakazky/${orderId}/zakaznik`}
                  className="btn btn-secondary btn-block"
                  style={{ marginTop: 12 }}
                >
                  Upravit údaje zákazníka
                </Link>
              </div>
            )}
          </section>

          <section>
            <h2 className="card-section-title">Místnosti</h2>
            <div style={{ display: "grid", gap: 12 }}>
              {d.rooms.map((room) => {
                const items = d.items.filter((i) => i.room_id === room.id);
                return (
                  <div className="card" key={room.id}>
                    <div className="card-pad" style={{ paddingBottom: 6 }}>
                      <span className="queue-title">{room.name}</span>
                    </div>
                    <div style={{ padding: "0 6px 6px" }}>
                      {items.map((i) => (
                        <ItemCard
                          key={i.id}
                          item={i}
                          orderId={orderId}
                          def={
                            i.form_definition_id
                              ? d.definitions[i.form_definition_id]?.definition
                              : undefined
                          }
                        />
                      ))}
                    </div>
                    {order.phase === "k_zamereni" && (
                      <Link
                        to={`/zakazky/${orderId}/polozka/nova?room=${room.id}`}
                        className="disclosure"
                        style={{ color: "var(--c-green-deep)" }}
                      >
                        ＋ Položka do místnosti
                      </Link>
                    )}
                  </div>
                );
              })}

              {d.rooms.length === 0 && (
                <p className="muted t-body-s">
                  Zatím žádná položka. Přidej první — místnost si založíš rovnou v ní.
                </p>
              )}

              {order.phase === "k_zamereni" && (
                <Link to={`/zakazky/${orderId}/polozka/nova`} className="btn btn-secondary">
                  ＋ Nová místnost / položka
                </Link>
              )}
            </div>
          </section>

          {order.price_montage && (
            <section className="card card-pad">
              <span className="meta-label">Cena práce</span>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span className="t-display-m">{money(order.price_montage)}</span>
                {order.phase === "k_zamereni" && (
                  <Link to={`/zakazky/${orderId}/cena`} className="link-btn">
                    Upravit
                  </Link>
                )}
              </div>
            </section>
          )}

          {order.signed_at && (
            <div className="info-row">
              <ToneBadge tone="done">Podepsáno {czDateShort(order.signed_at)}</ToneBadge>
            </div>
          )}

          {["k_zamereni", "k_naceneni"].includes(order.phase) && (
            <CancelBlock
              label="Zrušit zakázku"
              onCancel={(reason) => void movePhase("zruseno", reason)}
            />
          )}
        </>
      )}

      {montazOpen && order && (
        <DateSheet
          title="Termín montáže"
          value={order.term_montaz}
          warnBefore={order.term_dodani}
          warnText={`Pozor: dodání je až ${czDate(order.term_dodani)}. Dřívější montáž ověř s kanceláří.`}
          confirmLabel="Uložit termín"
          onClose={() => setMontazOpen(false)}
          onPick={(iso) => {
            setMontazOpen(false);
            void setTermMontaz(iso);
          }}
        />
      )}
    </TechDetail>
  );
}
