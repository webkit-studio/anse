import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FormDefinition } from "@shared/form-schema";
import type { ItemRow, OrderDetail } from "@shared/types";
import { blokaceProRoli } from "@shared/types";
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
  ValueRow,
  focusValueRow,
  useDelayed,
} from "../components/ui";

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
  onDuplicate,
}: {
  item: ItemRow;
  orderId: string;
  def?: FormDefinition;
  /** Duplikace sedí u položky v seznamu — kopíruje se to, co je vidět. */
  onDuplicate?: () => void;
}) {
  const summary = itemSummary(item, def);

  return (
    <div className="item-row">
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
          style={{
            flex: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
          }}
        >
          {item.photos.length}
          <Icon name="foto" size={15} />
        </span>
      )}
      <span className="card-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
      {onDuplicate && (
        <button
          type="button"
          className="icon-btn item-dup"
          title="Duplikovat položku"
          aria-label={`Duplikovat ${item.subcategory_name || item.product_type_name}`}
          onClick={onDuplicate}
        >
          <Icon name="kopie" size={18} />
        </button>
      )}
    </div>
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

  const [montazOpen, setMontazOpen] = useState(false);
  const [zamereniOpen, setZamereniOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const role = me.data?.role ?? "technik";
  const d = detail.data;
  const order = d?.order;
  // Technikovi se vypisuje jen to, co může sám odblokovat.
  const mojeBlokace = blokaceProRoli(d?.blocking ?? [], role);

  /** Jedna cesta pro všechny úpravy hlavičky — včetně optimistického zámku. */
  async function patch(body: Record<string, unknown>, hlaska: string) {
    if (!order) return;
    try {
      await api(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: { ...body, expected_updated_at: order.updated_at },
      });
      await invalidate(orderId);
      toast(hlaska);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Nepodařilo se uložit.");
    }
  }

  /** Kopie položky — rozměry se pak jen přepíšou. */
  async function duplikovat(itemId: string) {
    try {
      await api(`/api/items/${itemId}/duplicate`, { method: "POST" });
      await invalidate(orderId);
      toast("Zkopírováno — rozměry přepiš");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kopii se nepodařilo vytvořit.");
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

  /** Blokace není jen hláška — každá vede rovnou na místo, kde se doplní. */
  function jdiNa(blokace: string) {
    if (blokace === "Aspoň jedna položka") {
      navigate(`/zakazky/${orderId}/polozka/nova`);
      return;
    }
    if (blokace === "Cena práce") {
      // Ne do řádku, ale na „poslední krok": jsou tam sazbové zkratky
      // (půl dne, celý den) a uloží se i odešle jedním ťuknutím. Cenu jde
      // pořád přepsat tužkou v řádku jako každý jiný údaj.
      navigate(`/zakazky/${orderId}/cena`);
      return;
    }
    if (blokace === "Údaje zákazníka" && order) {
      const chybi = (
        [
          ["jmeno", order.customer_name],
          ["telefon", order.customer_phone],
          ["email", order.customer_email],
          ["adresa", order.addr_montaz],
        ] as const
      ).find(([, v]) => !v.trim());
      focusValueRow(chybi?.[0] ?? "jmeno");
      return;
    }
    if (blokace === "Termín montáže") {
      setMontazOpen(true);
      return;
    }
    if (blokace === "Podpis zákazníka") {
      navigate(`/zakazky/${orderId}/montaz`);
      return;
    }
    // Zbytek (technik, termín dodání, faktura) dělá kancelář — technik jen vidí.
    toast("Tohle doplní kancelář.");
  }

  // Patka podle fáze — jedno hlavní tlačítko, ať je jasné, co se čeká.
  let footer: JSX.Element | undefined;
  if (order) {
    if (order.phase === "k_zamereni") {
      // CTA říká rovnou, jaký krok chybí — místo obecného tlačítka s překvapením.
      const blocking = d?.blocking ?? [];
      const noItems = (d?.items.length ?? 0) === 0;
      const next = noItems
        ? {
            label: "Přidat první položku",
            act: () => navigate(`/zakazky/${orderId}/polozka/nova`),
          }
        : blocking.includes("Údaje zákazníka")
          ? {
              label: "Doplnit údaje zákazníka",
              act: () => jdiNa("Údaje zákazníka"),
            }
          : blocking.includes("Cena práce")
            ? { label: "Doplnit cenu práce", act: () => jdiNa("Cena práce") }
            : {
                label: "Odeslat k nacenění",
                act: () => void movePhase("k_naceneni"),
              };

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

          {mojeBlokace.length > 0 && order.phase !== "zruseno" && (
            <div className="warn-bar">
              <span aria-hidden="true">●</span>
              <span>
                Než pošleš dál, chybí:
                <ul className="blocking-list">
                  {mojeBlokace.map((b) => (
                    <li key={b}>
                      <button type="button" className="blocking-go" onClick={() => jdiNa(b)}>
                        {b}
                      </button>
                    </li>
                  ))}
                </ul>
              </span>
            </div>
          )}

          {/* Zákazník je první: technik ho má před sebou a vyplňuje ho jako
              první věc po příchodu. Nic se neschovává za rozbalovátko. */}
          <section className="card card-pad">
            <h2 className="card-section-title card-section-title-inline">Zákazník</h2>
            <div className="value-rows">
              <ValueRow
                label="Jméno"
                row="jmeno"
                value={order.customer_name}
                placeholder="doplnit jméno"
                onSave={(v) => patch({ customer_name: v }, "Jméno uloženo")}
              />
              <ValueRow
                label="Telefon"
                row="telefon"
                kind="tel"
                value={order.customer_phone}
                placeholder="doplnit telefon"
                onSave={(v) => patch({ customer_phone: v }, "Telefon uložen")}
              />
              <ValueRow
                label="E-mail"
                row="email"
                kind="email"
                value={order.customer_email}
                placeholder="doplnit e-mail"
                onSave={(v) => patch({ customer_email: v }, "E-mail uložen")}
              />
              <ValueRow
                label="Adresa montáže"
                row="adresa"
                kind="adresa"
                value={order.addr_montaz}
                placeholder="doplnit adresu"
                onSave={(v) => patch({ addr_montaz: v }, "Adresa uložena")}
              />
              {/* Vlastní fakturační adresa přebíjí montážní. Dokud se nevyplní,
                  ukazuje se montážní jako odvozená — ale měnit jde vždycky. */}
              <ValueRow
                label="Fakturační adresa"
                kind="adresa"
                value={order.addr_fakt.trim() || order.addr_montaz}
                editValue={order.addr_fakt}
                hint={order.addr_fakt.trim() ? undefined : "stejná jako montážní"}
                placeholder="stejná jako montážní"
                onSave={(v) =>
                  patch(
                    { addr_fakt: v, addr_fakt_same: v.trim() === "" },
                    v.trim() ? "Fakturační adresa uložena" : "Fakturační adresa je zas montážní",
                  )
                }
              />
              <ValueRow
                label="IČO / DIČ"
                value={[order.ico, order.dic].filter(Boolean).join(" / ")}
                placeholder="jen u firem"
                copy={!!order.ico || !!order.dic}
                onEdit={() => navigate(`/zakazky/${orderId}/zakaznik`)}
              />
            </div>
          </section>

          {/* Zakázka: termíny v pořadí, v jakém opravdu jdou po sobě. */}
          <section className="card card-pad">
            <h2 className="card-section-title card-section-title-inline">Zakázka</h2>
            <div className="value-rows">
              <ValueRow
                label="Zaměření"
                kind="datum"
                copy={false}
                value={
                  czDateShort(order.measured_at) +
                  (order.measured_time ? ` v ${order.measured_time}` : "")
                }
                onEdit={order.phase === "k_zamereni" ? () => setZamereniOpen(true) : undefined}
              />
              <ValueRow
                label="Termín dodání"
                kind="datum"
                copy={false}
                value={order.term_dodani ? czDate(order.term_dodani) : ""}
                placeholder="zatím neznámý"
                hint={order.term_dodani ? undefined : "doplní kancelář po objednání u dodavatele"}
              />
              <ValueRow
                label="Termín montáže"
                row="montaz"
                kind="datum"
                copy={false}
                value={order.term_montaz ? czDate(order.term_montaz) : ""}
                placeholder={order.term_dodani ? "zadat termín" : "až bude známé dodání"}
                hint={order.term_dodani ? undefined : "montáž se domlouvá, až kancelář zná dodání"}
                onEdit={order.term_dodani ? () => setMontazOpen(true) : undefined}
              />
              <ValueRow label="Položek" value={String(d.items.length)} copy={false} />
              <ValueRow
                label="Cena práce"
                row="cena-prace"
                kind="castka"
                copy={false}
                value={order.price_montage.trim() ? money(order.price_montage) : ""}
                editValue={order.price_montage}
                placeholder="doplnit cenu"
                // Vysvětlení je nápověda k vyplnění, ne trvalý popisek —
                // jakmile je cena zadaná, řádek se uklidní.
                hint={
                  order.price_montage.trim() ? undefined : "tvoje odměna za montáž, určuješ si ji sám"
                }
                onSave={
                  order.phase === "k_zamereni"
                    ? (v) => patch({ price_montage: v }, "Cena práce uložena")
                    : undefined
                }
              />
              {role === "kancelar" && (
                <ValueRow label="Cena zakázky" value={money(order.price_customer)} copy={false} />
              )}
            </div>
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
                          onDuplicate={
                            order.phase === "k_zamereni" ? () => void duplikovat(i.id) : undefined
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
            void patch({ term_montaz: iso }, `Termín montáže ${czDate(iso)}`);
          }}
        />
      )}

      {zamereniOpen && order && (
        <DateSheet
          title="Termín zaměření"
          value={order.measured_at}
          withTime
          time={order.measured_time}
          confirmLabel="Uložit termín"
          onClose={() => setZamereniOpen(false)}
          onPick={(iso, time) => {
            setZamereniOpen(false);
            void patch({ measured_at: iso, measured_time: time }, `Zaměření ${czDate(iso)}`);
          }}
        />
      )}
    </TechDetail>
  );
}
