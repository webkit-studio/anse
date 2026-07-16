import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FormDefinition } from "@shared/form-schema";
import type { ItemRow, OrderDetail, RoomRow } from "@shared/types";
import { useMe, useOrder, useInvalidateOrder } from "../api/hooks";
import { api, isConflict } from "../api/client";
import { OrderAction } from "../components/OrderAction";
import { PhoneInput } from "../components/PhoneInput";
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

  const [order, setOrder] = useState({
    installation_address: detail.order.installation_address,
    montage_number: detail.order.montage_number,
    order_number: detail.order.order_number,
    measured_at: detail.order.measured_at ?? "",
    delivery_date: detail.order.delivery_date ?? "",
    note: detail.order.note,
    invoice_number: detail.order.invoice_number,
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
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // Technik ukládá jen: místo montáže, termín vyměření, poznámku.
      const body: Record<string, unknown> = {
        installation_address: order.installation_address,
        measured_at: order.measured_at || null,
        note: order.note,
        expected_updated_at: detail.order.updated_at,
      };
      if (isAdmin) {
        body.montage_number = order.montage_number;
        body.order_number = order.order_number;
        body.delivery_date = order.delivery_date || null;
        body.invoice_number = order.invoice_number;
      }
      await api(`/api/orders/${detail.order.id}`, { method: "PATCH", body });

      if (isAdmin) {
        await api(`/api/clients/${detail.client.id}`, {
          method: "PATCH",
          body: { ...client, expected_updated_at: detail.client.updated_at },
        });
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
          <Field label="Firma / jméno a příjmení" htmlFor="c-name">
            <TextInput id="c-name" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
          </Field>
          <Field label="Telefon" htmlFor="c-phone">
            <PhoneInput id="c-phone" value={client.phone} onChange={(v) => setClient({ ...client, phone: v })} />
          </Field>
          <Field label="E-mail" htmlFor="c-email">
            <TextInput
              id="c-email"
              type="email"
              inputMode="email"
              value={client.email}
              onChange={(e) => setClient({ ...client, email: e.target.value })}
            />
          </Field>
          <Field label="Adresa" htmlFor="c-address">
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

      {isAdmin && (
        <>
          <div className="field-row">
            <Field label="Číslo montáže" htmlFor="e-montage">
              <TextInput
                id="e-montage"
                value={order.montage_number}
                onChange={(e) => setOrder({ ...order, montage_number: e.target.value })}
              />
            </Field>
            <Field label="Číslo zakázky" htmlFor="e-number">
              <TextInput
                id="e-number"
                value={order.order_number}
                onChange={(e) => setOrder({ ...order, order_number: e.target.value })}
              />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Termín dodání" htmlFor="e-delivery">
              <input
                id="e-delivery"
                type="date"
                value={order.delivery_date}
                onChange={(e) => setOrder({ ...order, delivery_date: e.target.value })}
              />
            </Field>
            <Field label="Faktura (číslo FA)" htmlFor="e-invoice">
              <TextInput
                id="e-invoice"
                value={order.invoice_number}
                onChange={(e) => setOrder({ ...order, invoice_number: e.target.value })}
              />
            </Field>
          </div>
        </>
      )}

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

export default function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const order = useOrder(orderId);
  const me = useMe();
  const invalidate = useInvalidateOrder();
  const [editing, setEditing] = useState(false);

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
          <StatusBadge status={detail.order.status} />
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

      {isAdmin && (
        <section className="admin-actions">
          <p className="admin-actions-count">
            <strong>{detail.items.length}</strong>{" "}
            {detail.items.length === 1 ? "kus" : detail.items.length <= 4 ? "kusy" : "kusů"} (ks = počet
            položek)
          </p>
          <div className="admin-actions-row">
            <Button disabled title="Připravujeme — aktivace po otestování formulářů">
              Tisk montážního listu
            </Button>
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
        </section>
      )}

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
        <OrderAction orderId={orderId} status={detail.order.status} role={me.data?.role ?? "technik"} />
      </div>
    </div>
  );
}
