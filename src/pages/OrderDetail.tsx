import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { FormDefinition } from "@shared/form-schema";
import type { ItemRow, OrderDetail, RoomRow } from "@shared/types";
import { useMe, useOrder, useInvalidateOrder } from "../api/hooks";
import { api, isConflict } from "../api/client";
import { StatusStepper } from "../components/StatusStepper";
import { useToast } from "../components/Toast";
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorBanner,
  Field,
  Spinner,
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
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(room.note);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function saveNote() {
    setBusy(true);
    try {
      await api(`/api/rooms/${room.id}`, { method: "PATCH", body: { note: note.trim() } });
      setEditing(false);
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Uložení se nepodařilo.");
    } finally {
      setBusy(false);
    }
  }

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
        <h2 className="room-name">{room.name}</h2>
        <div className="room-head-actions">
          <Button variant="ghost" onClick={() => setEditing((e) => !e)}>
            {room.note || editing ? "Poznámka ✎" : "+ Poznámka"}
          </Button>
          {items.length === 0 && (
            <ConfirmButton label="Smazat" confirmLabel="Opravdu smazat?" onConfirm={() => void removeRoom()} />
          )}
        </div>
      </div>

      {editing ? (
        <div className="room-note-edit">
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Poznámka k místnosti…"
            aria-label={`Poznámka k místnosti ${room.name}`}
          />
          <Button variant="primary" disabled={busy} onClick={() => void saveNote()}>
            Uložit
          </Button>
        </div>
      ) : (
        room.note && <p className="room-note">{room.note}</p>
      )}

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
                <ConfirmButton label="Smazat" confirmLabel="Opravdu smazat?" onConfirm={() => void remove(item)} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OrderHeaderEdit({ detail, onDone }: { detail: OrderDetail; onDone: () => void }) {
  const me = useMe();
  const [form, setForm] = useState({
    installation_address: detail.order.installation_address,
    montage_number: detail.order.montage_number,
    order_number: detail.order.order_number,
    measured_at: detail.order.measured_at ?? "",
    delivery_date: detail.order.delivery_date ?? "",
    note: detail.order.note,
    invoice_number: detail.order.invoice_number,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const isAdmin = me.data?.role === "admin";

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        installation_address: form.installation_address,
        montage_number: form.montage_number,
        order_number: form.order_number,
        measured_at: form.measured_at || null,
        delivery_date: form.delivery_date || null,
        note: form.note,
        expected_updated_at: detail.order.updated_at,
      };
      if (isAdmin) body.invoice_number = form.invoice_number;
      await api(`/api/orders/${detail.order.id}`, { method: "PATCH", body });
      toast("Zakázka uložena.");
      onDone();
    } catch (err) {
      setError(
        isConflict(err)
          ? "Zakázku mezitím upravil někdo jiný — po zavření uvidíte aktuální data."
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
      <Field label="Místo montáže" htmlFor="e-address">
        <TextInput
          id="e-address"
          value={form.installation_address}
          onChange={(e) => setForm({ ...form, installation_address: e.target.value })}
        />
      </Field>
      <div className="field-row">
        <Field label="Číslo montáže" htmlFor="e-montage">
          <TextInput
            id="e-montage"
            value={form.montage_number}
            onChange={(e) => setForm({ ...form, montage_number: e.target.value })}
          />
        </Field>
        <Field label="Číslo zakázky" htmlFor="e-number">
          <TextInput
            id="e-number"
            value={form.order_number}
            onChange={(e) => setForm({ ...form, order_number: e.target.value })}
          />
        </Field>
      </div>
      <div className="field-row">
        <Field label="Termín vyměření" htmlFor="e-measured">
          <input
            id="e-measured"
            type="date"
            value={form.measured_at}
            onChange={(e) => setForm({ ...form, measured_at: e.target.value })}
          />
        </Field>
        <Field label="Termín dodání" htmlFor="e-delivery">
          <input
            id="e-delivery"
            type="date"
            value={form.delivery_date}
            onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Poznámka" htmlFor="e-note">
        <TextInput id="e-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </Field>
      {isAdmin && (
        <Field label="Faktura (číslo FA)" htmlFor="e-invoice">
          <TextInput
            id="e-invoice"
            value={form.invoice_number}
            onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
          />
        </Field>
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
  const [editingHeader, setEditingHeader] = useState(false);

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

  return (
    <div className="page">
      <div className="order-header">
        <div className="order-header-top">
          <h1>{detail.client.name}</h1>
          <Button variant="ghost" onClick={() => setEditingHeader((e) => !e)}>
            {editingHeader ? "Zavřít ✕" : "Upravit ✎"}
          </Button>
        </div>
        <p className="muted">{detail.order.installation_address || "Místo montáže nevyplněno"}</p>
        <p className="muted order-header-meta">
          {[
            detail.order.order_number && `č. ${detail.order.order_number}`,
            detail.order.montage_number && `montáž ${detail.order.montage_number}`,
            detail.client.phone,
          ]
            .filter(Boolean)
            .join(" · ")}
          {detail.client.phone && (
            <>
              {" "}
              <a href={`tel:${detail.client.phone.replace(/\s/g, "")}`}>Zavolat</a>
            </>
          )}
        </p>
        {detail.order.note && <p className="order-note">{detail.order.note}</p>}

        {editingHeader && (
          <OrderHeaderEdit
            detail={detail}
            onDone={() => {
              setEditingHeader(false);
              refresh();
            }}
          />
        )}

        <StatusStepper orderId={orderId} status={detail.order.status} role={me.data?.role ?? "technik"} />
      </div>

      <Link to={`/zakazky/${orderId}/polozka/nova`} className="btn btn-primary btn-block btn-xl">
        + Přidat produkt
      </Link>

      {detail.rooms.length === 0 && detail.items.length === 0 && (
        <EmptyState title="Zatím žádné položky.">
          <p className="muted">Přidejte první produkt — začíná se výběrem místnosti.</p>
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

      {detail.items.length > 0 && (
        <p className="order-total muted">
          Celkem {detail.items.length}{" "}
          {detail.items.length === 1 ? "položka" : detail.items.length <= 4 ? "položky" : "položek"} (ks =
          počet položek)
        </p>
      )}

      {isAdmin && (
        <section className="admin-actions">
          <h2 className="form-group-title">Objednání a tisk</h2>
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
          <p className="muted admin-actions-note">
            Exporty a tisk se aktivují po otestování formulářů.
          </p>
        </section>
      )}
    </div>
  );
}
