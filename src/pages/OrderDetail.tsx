import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FormDefinition } from "@shared/form-schema";
import { missingForPdf } from "@shared/print";
import type { ClientRow, ItemRow, OrderDetail, OrderRow, RoomRow } from "@shared/types";
import { useMe, useOrder, useInvalidateOrder } from "../api/hooks";
import { api, isConflict } from "../api/client";
import { OrderAction } from "../components/OrderAction";
import { PhoneInput, emailIssue, phoneIssue } from "../components/PhoneInput";
import { SignaturePad } from "../components/SignaturePad";
import { useToast } from "../components/Toast";
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorBanner,
  Field,
  Spinner,
  StatusBadge,
  TextInput,
} from "../components/ui";

/** Souhrn položky z polí označených summary: š × v mm vpředu, zbytek labely. */
function itemSummary(item: ItemRow, definition?: FormDefinition): string {
  if (!definition) return "";
  const parts: string[] = [];
  const summaryFields = definition.groups.flatMap((g) => g.fields).filter((f) => f.summary);

  const w = definition.printMap.sirka ? item.params[definition.printMap.sirka] : undefined;
  const h = definition.printMap.vyska ? item.params[definition.printMap.vyska] : undefined;
  if (w !== undefined && h !== undefined) parts.push(`${w} × ${h} mm`);

  for (const f of summaryFields) {
    if (f.key === definition.printMap.sirka || f.key === definition.printMap.vyska) continue;
    const value = item.params[f.key];
    if (value === undefined || value === "") continue;
    const label = f.options?.find((o) => o.value === String(value))?.label ?? String(value);
    parts.push(label);
  }
  return parts.join(" · ");
}

function RoomSection({
  room,
  items,
  detail,
  onChanged,
}: {
  room: RoomRow;
  items: ItemRow[];
  detail: OrderDetail;
  onChanged: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();

  async function duplicate(item: ItemRow) {
    try {
      const { item: copy } = await api<{ item: ItemRow }>(`/api/items/${item.id}/duplicate`, {
        method: "POST",
      });
      onChanged();
      toast("Položka zkopírována.", {
        label: "Upravit",
        onClick: () => navigate(`/zakazky/${item.order_id}/polozka/${copy.id}`),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Kopírování se nepodařilo.");
    }
  }

  async function remove(item: ItemRow) {
    try {
      await api(`/api/items/${item.id}`, { method: "DELETE" });
      onChanged();
      toast("Položka smazána.");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Smazání se nepodařilo.");
    }
  }

  async function removeRoom() {
    try {
      await api(`/api/rooms/${room.id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Smazání se nepodařilo.");
    }
  }

  return (
    <section className="room-section">
      <div className="room-head">
        <h3 className="room-name">{room.name}</h3>
        {items.length === 0 && (
          <ConfirmButton label="🗑" confirmLabel="Smazat?" onConfirm={() => void removeRoom()} />
        )}
      </div>
      {room.note && <p className="room-note">{room.note}</p>}

      <ul className="item-list">
        {items.map((item) => {
          const def = detail.definitions[item.form_definition_id]?.definition;
          return (
            <li key={item.id} className="item-card">
              <Link to={`/zakazky/${item.order_id}/polozka/${item.id}`} className="item-card-main">
                <span className="item-card-type">{item.product_type_name}</span>
                <span className="item-card-summary">{itemSummary(item, def)}</span>
                {item.note && <span className="item-card-note">{item.note}</span>}
              </Link>
              <div className="item-card-actions">
                <Button variant="ghost" onClick={() => void duplicate(item)} aria-label="Duplikovat položku">
                  ⧉ Duplikovat
                </Button>
                <Link
                  to={`/zakazky/${item.order_id}/polozka/${item.id}`}
                  className="btn btn-ghost"
                  aria-label="Upravit položku"
                >
                  ✎ Upravit
                </Link>
                <ConfirmButton label="🗑" confirmLabel="Smazat?" onConfirm={() => void remove(item)} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HeaderEdit({ detail, onDone }: { detail: OrderDetail; onDone: () => void }) {
  const me = useMe();
  const isAdmin = me.data?.role === "admin";
  const toast = useToast();

  // Jen údaje z terénu (Jakubovy) + karta zákazníka — čísla, termín dodání,
  // faktura a částky se editují zvlášť v „Údaje pro export" u PDF exportu.
  const [order, setOrder] = useState({
    installation_address: detail.order.installation_address,
    measured_at: detail.order.measured_at ?? "",
    note: detail.order.note,
  });
  const [client, setClient] = useState({
    name: detail.client.name,
    phone: detail.client.phone,
    email: detail.client.email,
    address: detail.client.address,
    delivery_address: detail.client.delivery_address,
    contact_person: detail.client.contact_person,
    ico: detail.client.ico,
    dic: detail.client.dic,
    note: detail.client.note,
  });
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistické zámky obou PATCHů. Ukládá se dvěma requesty (zakázka, pak
  // karta zákazníka) — po každém úspěchu si zapamatujeme nový updated_at,
  // jinak by druhý pokus (např. po chybě validace karty) narazil na vlastní
  // předchozí uložení a skončil falešným 409.
  const expectedRef = useRef({ order: detail.order.updated_at, client: detail.client.updated_at });

  // Povinná pole karty zákazníka — validace před odesláním (zrcadlí server).
  const nameProblem = client.name.trim() === "" ? "Vyplňte jméno nebo firmu." : null;
  const phoneProblem = phoneIssue(client.phone);
  const emailProblem = client.email.trim() === "" ? "Vyplňte e-mail." : emailIssue(client.email);
  const addressProblem = client.address.trim() === "" ? "Vyplňte adresu." : null;

  async function save() {
    if (isAdmin && (nameProblem || phoneProblem || emailProblem || addressProblem)) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        installation_address: order.installation_address,
        measured_at: order.measured_at || null,
        note: order.note,
        expected_updated_at: expectedRef.current.order,
      };
      const { order: savedOrder } = await api<{ order: OrderRow }>(`/api/orders/${detail.order.id}`, {
        method: "PATCH",
        body,
      });
      expectedRef.current.order = savedOrder.updated_at;

      if (isAdmin) {
        const { client: savedClient } = await api<{ client: ClientRow }>(
          `/api/clients/${detail.client.id}`,
          {
            method: "PATCH",
            body: { ...client, expected_updated_at: expectedRef.current.client },
          },
        );
        expectedRef.current.client = savedClient.updated_at;
      }
      toast("Uloženo.");
      onDone();
    } catch (err) {
      setError(
        isConflict(err)
          ? "Data mezitím upravil někdo jiný — po zavření uvidíte aktuální stav."
          : err instanceof Error
            ? err.message
            : "Uložení se nepodařilo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="header-edit">
      {isAdmin && (
        <>
          <h3 className="header-edit-title">Zákazník</h3>
          <p className="required-legend">
            <span className="field-required">*</span> povinný údaj
          </p>
          <Field
            label="Firma / jméno a příjmení"
            htmlFor="c-name"
            required
            messages={attempted && nameProblem ? [{ level: "error", message: nameProblem }] : []}
          >
            <TextInput id="c-name" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
          </Field>
          <Field
            label="Telefon"
            htmlFor="c-phone"
            messages={attempted && phoneProblem ? [{ level: "error", message: phoneProblem }] : []}
          >
            <PhoneInput id="c-phone" value={client.phone} onChange={(v) => setClient({ ...client, phone: v })} />
          </Field>
          <Field
            label="E-mail"
            htmlFor="c-email"
            required
            messages={attempted && emailProblem ? [{ level: "error", message: emailProblem }] : []}
          >
            <TextInput
              id="c-email"
              type="email"
              inputMode="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
            />
          </Field>
          <Field
            label="Adresa"
            htmlFor="c-address"
            required
            messages={attempted && addressProblem ? [{ level: "error", message: addressProblem }] : []}
          >
            <TextInput id="c-address" value={client.address} onChange={(e) => setClient({ ...client, address: e.target.value })} />
          </Field>
          <div className="field-row">
            <Field label="IČ" htmlFor="c-ico">
              <TextInput id="c-ico" inputMode="numeric" value={client.ico} onChange={(e) => setClient({ ...client, ico: e.target.value })} />
            </Field>
            <Field label="DIČ" htmlFor="c-dic">
              <TextInput id="c-dic" value={client.dic} onChange={(e) => setClient({ ...client, dic: e.target.value })} />
            </Field>
          </div>
          <h3 className="header-edit-title">Zakázka</h3>
        </>
      )}

      <Field label="Místo montáže" htmlFor="e-address">
        <TextInput
          id="e-address"
          value={order.installation_address}
          onChange={(e) => setOrder({ ...order, installation_address: e.target.value })}
        />
      </Field>
      <Field label="Termín vyměření" htmlFor="e-measured">
        <input
          id="e-measured"
          type="date"
          value={order.measured_at}
          onChange={(e) => setOrder({ ...order, measured_at: e.target.value })}
        />
      </Field>
      <Field label="Poznámka k zakázce" htmlFor="e-note">
        <TextInput id="e-note" value={order.note} onChange={(e) => setOrder({ ...order, note: e.target.value })} />
      </Field>

      {error && <p className="field-msg field-msg-error">{error}</p>}
      <div className="header-edit-actions">
        <Button variant="ghost" onClick={onDone}>
          Zavřít
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Uložit
        </Button>
      </div>
    </div>
  );
}

/** Údaje pro export montážního listu (jen admin): čísla, faktura, termín
 *  dodání, částky a montér. Ukládat jde i rozpracované — PDF export se odemkne
 *  až s kompletem (missingForPdf), takže tenhle formulář nic nevynucuje. */
function ExportEdit({ detail, onDone }: { detail: OrderDetail; onDone: () => void }) {
  const toast = useToast();
  const [data, setData] = useState({
    montage_number: detail.order.montage_number,
    order_number: detail.order.order_number,
    invoice_number: detail.order.invoice_number,
    delivery_date: detail.order.delivery_date ?? "",
    price_ex_vat: detail.order.price_ex_vat,
    price_vat: detail.order.price_vat,
    price_montage: detail.order.price_montage,
    price_total: detail.order.price_total,
    price_deposit: detail.order.price_deposit,
    price_balance: detail.order.price_balance,
    montage_by: detail.order.montage_by,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof typeof data) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setData({ ...data, [key]: e.target.value });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/orders/${detail.order.id}`, {
        method: "PATCH",
        body: {
          ...data,
          delivery_date: data.delivery_date || null,
          expected_updated_at: detail.order.updated_at,
        },
      });
      toast("Uloženo.");
      onDone();
    } catch (err) {
      setError(
        isConflict(err)
          ? "Data mezitím upravil někdo jiný — po zavření uvidíte aktuální stav."
          : err instanceof Error
            ? err.message
            : "Uložení se nepodařilo.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="header-edit">
      <div className="field-row">
        <Field label="Číslo montáže" htmlFor="x-montage">
          <TextInput id="x-montage" value={data.montage_number} onChange={set("montage_number")} />
        </Field>
        <Field label="Číslo zakázky" htmlFor="x-number">
          <TextInput id="x-number" value={data.order_number} onChange={set("order_number")} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Faktura (číslo FA)" htmlFor="x-invoice">
          <TextInput id="x-invoice" value={data.invoice_number} onChange={set("invoice_number")} />
        </Field>
        <Field label="Termín dodání" htmlFor="x-delivery">
          <input id="x-delivery" type="date" value={data.delivery_date} onChange={set("delivery_date")} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Cena bez DPH" htmlFor="x-price-ex">
          <TextInput id="x-price-ex" placeholder="12 500 Kč" value={data.price_ex_vat} onChange={set("price_ex_vat")} />
        </Field>
        <Field label="DPH" htmlFor="x-price-vat">
          <TextInput id="x-price-vat" value={data.price_vat} onChange={set("price_vat")} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Montáž (cena)" htmlFor="x-price-montage">
          <TextInput id="x-price-montage" value={data.price_montage} onChange={set("price_montage")} />
        </Field>
        <Field label="Cena celkem" htmlFor="x-price-total">
          <TextInput id="x-price-total" value={data.price_total} onChange={set("price_total")} />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Záloha" htmlFor="x-price-deposit">
          <TextInput id="x-price-deposit" value={data.price_deposit} onChange={set("price_deposit")} />
        </Field>
        <Field label="Doplatek" htmlFor="x-price-balance">
          <TextInput id="x-price-balance" value={data.price_balance} onChange={set("price_balance")} />
        </Field>
      </div>
      <Field label="Montáž provedl" htmlFor="x-montage-by">
        <TextInput id="x-montage-by" value={data.montage_by} onChange={set("montage_by")} />
      </Field>
      <p className="muted pdf-export-hint">
        Uložit jde i rozpracované — export PDF se odemkne, až bude vyplněné vše včetně podpisu.
      </p>

      {error && <p className="field-msg field-msg-error">{error}</p>}
      <div className="header-edit-actions">
        <Button variant="ghost" onClick={onDone}>
          Zavřít
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Uložit
        </Button>
      </div>
    </div>
  );
}

/** Stáhne export přes fetch (ne prostý odkaz) — chyby serveru se ukážou česky,
 *  místo neurčitého „unable to download" v prohlížeči. */
function useExportDownload(path: string, fallbackName: string) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(path, { credentials: "same-origin" });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Export se nepodařil.");
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? fallbackName;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export se nepodařil.");
    } finally {
      setBusy(false);
    }
  }

  return { download, busy };
}

export default function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const order = useOrder(orderId);
  const me = useMe();
  const invalidate = useInvalidateOrder();
  const navigate = useNavigate();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [editingExport, setEditingExport] = useState(false);
  const [signing, setSigning] = useState(false);
  const exportPdf = useExportDownload(`/export/montazni-list-pdf/${orderId}`, "montazni-list.pdf");

  async function removeOrder() {
    try {
      await api(`/api/orders/${orderId}`, { method: "DELETE" });
      invalidate(orderId);
      toast("Zakázka smazána.");
      navigate("/zakazky", { replace: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Smazání se nepodařilo.");
    }
  }

  if (order.isPending) {
    return (
      <div className="page-center">
        <Spinner />
      </div>
    );
  }
  if (order.isError || !order.data) {
    return (
      <div className="page">
        <ErrorBanner
          message={order.error instanceof Error ? order.error.message : "Zakázka nenalezena."}
          onRetry={() => void order.refetch()}
        />
      </div>
    );
  }

  const detail = order.data;
  const isAdmin = me.data?.role === "admin";
  const refresh = () => invalidate(orderId);
  const missingPdf = missingForPdf({ ...detail.order, signed: Boolean(detail.order.signed_at) });

  const itemsByRoom = new Map<string, ItemRow[]>();
  for (const item of detail.items) {
    const list = itemsByRoom.get(item.room_id) ?? [];
    list.push(item);
    itemsByRoom.set(item.room_id, list);
  }

  const headerMeta = [
    detail.order.order_number && `č. ${detail.order.order_number}`,
    detail.order.montage_number && `montáž ${detail.order.montage_number}`,
    detail.order.measured_at && `vyměřeno ${detail.order.measured_at.split("-").reverse().join(". ")}`,
    detail.order.delivery_date && `dodání ${detail.order.delivery_date.split("-").reverse().join(". ")}`,
    isAdmin && detail.order.invoice_number && `FA ${detail.order.invoice_number}`,
  ].filter(Boolean);

  return (
    <div className="page page-order">
      <div className="order-header">
        <div className="order-header-top">
          <div>
            <h1>{detail.client.name}</h1>
            <p className="muted">{detail.order.installation_address || "Místo montáže nevyplněno"}</p>
          </div>
          <div className="order-badges">
            <StatusBadge status={detail.order.status} />
            {detail.order.signed_at && (
              <span
                className="signed-badge"
                title={`Podepsáno ${new Date(detail.order.signed_at).toLocaleDateString("cs-CZ")}`}
              >
                ✓ Podepsáno
              </span>
            )}
          </div>
        </div>
        <p className="muted order-header-meta">
          {[detail.client.phone, detail.client.email].filter(Boolean).join(" · ")}
          {detail.client.phone && (
            <>
              {" "}
              <a href={`tel:${detail.client.phone.replace(/\s/g, "")}`}>Zavolat</a>
            </>
          )}
        </p>
        {headerMeta.length > 0 && <p className="muted order-header-meta">{headerMeta.join(" · ")}</p>}
        {detail.order.note && <p className="order-note">{detail.order.note}</p>}

        <div className="order-header-actions">
          <Button variant="ghost" onClick={() => setEditing((e) => !e)}>
            {editing ? "Zavřít ✕" : "Upravit ✎"}
          </Button>
        </div>

        {editing && (
          <HeaderEdit
            detail={detail}
            onDone={() => {
              setEditing(false);
              refresh();
            }}
          />
        )}
      </div>

      <h2 className="section-title">Výpis produktů</h2>

      {detail.rooms.length === 0 && detail.items.length === 0 && (
        <EmptyState title="Zatím žádné položky.">
          <p className="muted">Přidejte první produkt tlačítkem níže.</p>
        </EmptyState>
      )}

      {detail.rooms.map((room) => (
        <RoomSection
          key={room.id}
          room={room}
          items={itemsByRoom.get(room.id) ?? []}
          detail={detail}
          onChanged={refresh}
        />
      ))}

      <div className="order-bottom-actions">
        <Link to={`/zakazky/${orderId}/polozka/nova`} className="btn btn-primary btn-block btn-xl">
          + Přidat produkt
        </Link>
        {detail.items.length > 0 && (
          <Button
            variant={detail.order.signed_at ? "ghost" : "secondary"}
            className="btn-block"
            onClick={() => setSigning(true)}
          >
            {detail.order.signed_at ? "Podepsat znovu" : "Podepsat ✍"}
          </Button>
        )}
        <OrderAction orderId={orderId} status={detail.order.status} role={me.data?.role ?? "technik"} />
      </div>

      {isAdmin && (
        <section className="admin-actions">
          <p className="admin-actions-count">
            <strong>{detail.items.length}</strong>{" "}
            {detail.items.length === 1 ? "kus" : detail.items.length <= 4 ? "kusy" : "kusů"} (ks = počet
            položek)
          </p>
          <div className="admin-actions-row">
            <Button disabled title="Připravujeme — aktivace po otestování formulářů">
              Export JackWest
            </Button>
            <Button disabled title="Připravíme později">
              Export Neva
            </Button>
            <Button disabled title="Připravíme později">
              Export Susy
            </Button>
          </div>
          <div className="pdf-export">
            <Button
              variant="secondary"
              className="btn-block"
              disabled={missingPdf.length > 0 || exportPdf.busy}
              onClick={() => void exportPdf.download()}
            >
              {exportPdf.busy ? "Generuji…" : "Export PDF montážního listu (s podpisem)"}
            </Button>
            {missingPdf.length > 0 && (
              <p className="muted pdf-export-hint">Doplňte nejdřív: {missingPdf.join(", ")}.</p>
            )}
            <Button variant="ghost" className="btn-block" onClick={() => setEditingExport((e) => !e)}>
              {editingExport ? "Zavřít ✕" : "Údaje pro export ✎"}
            </Button>
            {editingExport && (
              <ExportEdit
                detail={detail}
                onDone={() => {
                  setEditingExport(false);
                  refresh();
                }}
              />
            )}
          </div>
          <ConfirmButton
            label="Smazat zakázku 🗑"
            confirmLabel="Opravdu smazat? Nejde vrátit"
            className="btn-block order-delete"
            onConfirm={() => void removeOrder()}
          />
        </section>
      )}

      {signing && (
        <SignaturePad
          orderId={orderId}
          clientName={detail.client.name}
          onClose={() => setSigning(false)}
          onSaved={() => {
            setSigning(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
