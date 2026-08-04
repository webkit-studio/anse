import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Issue } from "@shared/form-engine";
import { initialParams } from "@shared/form-engine";
import type { FormDefinition, Params } from "@shared/form-schema";
import { ROOM_PRESETS, type OrderDetail, type RoomRow } from "@shared/types";
import { ApiFetchError, api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder, useProductTypes } from "../api/hooks";
import { ProductIcon } from "../components/ProductIcon";
import { useToast } from "../components/Toast";
import { ErrorBanner, Field, SelectSheet, Spinner, TextInput } from "../components/ui";
import { DefinitionForm } from "../form-engine/DefinitionForm";
import { useDraft } from "../form-engine/useDraft";

// Fullscreen krok bez app hlavičky: nahoře jen návrat na zakázku.

function TopBar({ orderId, title }: { orderId: string; title: string }) {
  return (
    <header className="itemform-topbar">
      <Link to={`/zakazky/${orderId}`} className="itemform-back">
        ← Zakázka
      </Link>
      <span className="itemform-title">{title}</span>
    </header>
  );
}

// --- Výběr místnosti (první pole formuláře) ---------------------------------

const NEW_ROOM = "__new__";

function lastRoomKey(orderId: string) {
  return `anse-last-room:${orderId}`;
}

function RoomSelect({
  rooms,
  value,
  customName,
  error,
  onChange,
  onCustomName,
}: {
  rooms: RoomRow[];
  value: string; // id existující místnosti | název předvolby | __new__ | ""
  customName: string;
  error?: string;
  onChange: (value: string) => void;
  onCustomName: (name: string) => void;
}) {
  const options = [
    ...rooms.map((r) => ({ value: r.id, label: r.name })),
    ...ROOM_PRESETS.filter((p) => !rooms.some((r) => r.name.toLowerCase() === p.toLowerCase())).map(
      (p) => ({ value: `name:${p}`, label: p }),
    ),
    { value: NEW_ROOM, label: "+ Nová místnost…" },
  ];

  return (
    <section className="form-group">
      <h2 className="form-group-title">Místnost</h2>
      <Field
        label="Kam produkt patří"
        htmlFor="room-select"
        required
        messages={error ? [{ level: "error", message: error }] : []}
      >
        <SelectSheet
          id="room-select"
          value={value}
          options={options}
          placeholder="Vyberte místnost…"
          onChange={onChange}
        />
      </Field>
      {value === NEW_ROOM && (
        <TextInput
          aria-label="Název nové místnosti"
          placeholder="Např. Pracovna"
          autoFocus
          value={customName}
          onChange={(e) => onCustomName(e.target.value)}
        />
      )}
    </section>
  );
}

/** Převod hodnoty výběru na API payload { id } | { name }. */
function roomPayload(value: string, customName: string): { id: string } | { name: string } | null {
  if (value === NEW_ROOM) {
    const name = customName.trim();
    return name ? { name } : null;
  }
  if (value.startsWith("name:")) return { name: value.slice(5) };
  return value ? { id: value } : null;
}

export default function ItemFormPage({ mode }: { mode: "new" | "edit" }) {
  const { orderId = "", itemId = "" } = useParams();
  const order = useOrder(orderId);

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
        <ErrorBanner message="Zakázka nenalezena." />
      </div>
    );
  }

  return mode === "new" ? (
    <NewItem orderId={orderId} detail={order.data} />
  ) : (
    <EditItem orderId={orderId} itemId={itemId} detail={order.data} />
  );
}

// --- Nová položka: 1) typ produktu → 2) formulář s místností -----------------

function NewItem({ orderId, detail }: { orderId: string; detail: OrderDetail }) {
  const productTypes = useProductTypes();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateOrder();

  const [typeId, setTypeId] = useState<string | null>(null);

  const remembered = localStorage.getItem(lastRoomKey(orderId)) ?? "";
  const validRemembered =
    detail.rooms.some((r) => r.id === remembered) || remembered.startsWith("name:") ? remembered : "";
  const [room, setRoom] = useState<string>(
    validRemembered || (detail.rooms.length === 1 ? detail.rooms[0]!.id : ""),
  );
  const [customRoomName, setCustomRoomName] = useState("");
  const [roomError, setRoomError] = useState<string | undefined>();

  const [busy, setBusy] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedType = productTypes.data?.product_types.find((t) => t.id === typeId);
  const definition = selectedType?.definition as FormDefinition | undefined;

  const draft = useDraft(typeId ? `new:${orderId}:${typeId}` : null);
  const draftData = useMemo(() => draft.read(), [draft]);

  const startParams = useMemo<Params>(() => {
    if (!definition) return {};
    return draftData?.params ?? initialParams(definition);
  }, [definition, draftData]);

  async function submit(params: Params, note: string) {
    const payload = roomPayload(room, customRoomName);
    if (!payload) {
      setRoomError("Vyberte místnost.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setRoomError(undefined);
    setBusy(true);
    setError(null);
    try {
      await api("/api/items", {
        method: "POST",
        body: { order_id: orderId, product_type_id: typeId, room: payload, params, note },
      });
      localStorage.setItem(lastRoomKey(orderId), room === NEW_ROOM ? "" : room);
      draft.clear();
      invalidate(orderId);
      toast("Položka uložena.");
      navigate(`/zakazky/${orderId}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiFetchError && err.issues) {
        setServerIssues(err.issues);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Uložení se nepodařilo.");
      }
      setBusy(false);
    }
  }

  // Krok 1: výběr typu produktu
  if (!definition) {
    return (
      <div className="app">
        <TopBar orderId={orderId} title="Přidat produkt" />
        <div className="page">
          <h1>Typ produktu</h1>
          {productTypes.isPending && <Spinner />}
          {productTypes.data && (
            <div className="type-tiles">
              {productTypes.data.product_types.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="type-tile"
                  disabled={!t.active}
                  onClick={() => setTypeId(t.id)}
                >
                  <span className="type-tile-icon" aria-hidden="true">
                    <ProductIcon name={t.name} />
                  </span>
                  <span className="type-tile-name">{t.name}</span>
                  <span className="type-tile-code">{t.active ? t.code : "Připravujeme"}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Krok 2: formulář (typ už nejde měnit — zpět = na zakázku)
  return (
    <div className="app">
      <TopBar orderId={orderId} title={selectedType!.name} />
      <div className="page">
        {draftData && (
          <div className="draft-banner">
            Obnovena rozepsaná verze.{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                draft.clear();
                const id = typeId;
                setTypeId(null);
                setTimeout(() => setTypeId(id), 0);
              }}
            >
              Začít znovu
            </button>
          </div>
        )}

        <RoomSelect
          rooms={detail.rooms}
          value={room}
          customName={customRoomName}
          error={roomError}
          onChange={(v) => {
            setRoom(v);
            setRoomError(undefined);
          }}
          onCustomName={setCustomRoomName}
        />

        <DefinitionForm
          key={`${typeId}-${draftData ? "draft" : "fresh"}`}
          definition={definition}
          initialParams={startParams}
          initialNote={draftData?.note ?? ""}
          submitLabel="Uložit položku"
          busy={busy}
          serverIssues={serverIssues}
          onSubmit={(params, note) => void submit(params, note)}
          onChange={(params, note) => draft.save(params, note)}
          autoFocusFirst={!draftData}
        />
        {error && <ErrorBanner message={error} />}
      </div>
    </div>
  );
}

// --- Editace položky: připnutá verze definice + přesun místnosti --------------

function EditItem({
  orderId,
  itemId,
  detail,
}: {
  orderId: string;
  itemId: string;
  detail: OrderDetail;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateOrder();
  const [busy, setBusy] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const item = detail.items.find((i) => i.id === itemId);
  const pinned = item ? detail.definitions[item.form_definition_id] : undefined;

  const [room, setRoom] = useState<string>(item?.room_id ?? "");
  const [customRoomName, setCustomRoomName] = useState("");
  const [roomError, setRoomError] = useState<string | undefined>();

  const draft = useDraft(item ? `edit:${item.id}` : null);
  const draftData = useMemo(() => draft.read(), [draft]);

  if (!item || !pinned) {
    return (
      <div className="page">
        <ErrorBanner message="Položka nenalezena." />
      </div>
    );
  }

  async function submit(params: Params, note: string) {
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      // Přesun do nové/pojmenované místnosti: nejdřív ji založí prázdný
      // požadavek? Ne — API bere room_id; novou místnost založíme přes
      // vytvoření názvem jen u nové položky. Tady: id přímo, name → 400.
      const payload = roomPayload(room, customRoomName);
      if (!payload) {
        setRoomError("Vyberte místnost.");
        setBusy(false);
        return;
      }
      let roomId: string | undefined;
      if ("id" in payload) {
        roomId = payload.id !== item!.room_id ? payload.id : undefined;
      } else {
        // předvolba/nová místnost, která na zakázce ještě neexistuje —
        // založí se přes rooms API? Jednodušeji: pošleme name přes create-room
        // trik: použijeme POST /api/items? Ne. Vytvoření místnosti řeší PATCH
        // s room_id — místnost musí existovat. Založíme ji zvlášť:
        const { room: created } = await api<{ room: RoomRow }>(`/api/orders/${orderId}/rooms`, {
          method: "POST",
          body: { name: payload.name },
        });
        roomId = created.id;
      }

      await api(`/api/items/${itemId}`, {
        method: "PATCH",
        body: {
          params,
          note,
          ...(roomId ? { room_id: roomId } : {}),
          expected_updated_at: item!.updated_at,
        },
      });
      draft.clear();
      invalidate(orderId);
      toast("Položka uložena.");
      navigate(`/zakazky/${orderId}`, { replace: true });
    } catch (err) {
      if (isConflict(err)) {
        setConflict(true);
      } else if (err instanceof ApiFetchError && err.issues) {
        setServerIssues(err.issues);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Uložení se nepodařilo.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <TopBar orderId={orderId} title={item.product_type_name} />
      <div className="page">
        {draftData && (
          <div className="draft-banner">
            Obnovena rozepsaná verze.{" "}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                draft.clear();
                location.reload();
              }}
            >
              Zahodit a načíst uložené
            </button>
          </div>
        )}

        {conflict && (
          <ErrorBanner
            message="Položku mezitím upravil někdo jiný."
            onRetry={() => {
              draft.clear();
              invalidate(orderId);
              location.reload();
            }}
          />
        )}

        <RoomSelect
          rooms={detail.rooms}
          value={room}
          customName={customRoomName}
          error={roomError}
          onChange={(v) => {
            setRoom(v);
            setRoomError(undefined);
          }}
          onCustomName={setCustomRoomName}
        />

        <DefinitionForm
          definition={pinned.definition}
          initialParams={draftData?.params ?? item.params}
          initialNote={draftData?.note ?? item.note}
          submitLabel="Uložit změny"
          busy={busy}
          serverIssues={serverIssues}
          onSubmit={(params, note) => void submit(params, note)}
          onChange={(params, note) => draft.save(params, note)}
          autoFocusFirst={false}
        />
        {error && <ErrorBanner message={error} />}
      </div>
    </div>
  );
}
