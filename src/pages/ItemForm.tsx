import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Issue } from "@shared/form-engine";
import { initialParams } from "@shared/form-engine";
import type { FormDefinition, Params } from "@shared/form-schema";
import { ROOM_PRESETS } from "@shared/types";
import { ApiFetchError, api, isConflict } from "../api/client";
import { useInvalidateOrder, useOrder, useProductTypes } from "../api/hooks";
import { useToast } from "../components/Toast";
import { Button, Chips, ErrorBanner, Spinner, TextInput } from "../components/ui";
import { DefinitionForm } from "../form-engine/DefinitionForm";
import { useDraft } from "../form-engine/useDraft";

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

// --- Nová položka: místnost → typ → formulář --------------------------------

function NewItem({
  orderId,
  detail,
}: {
  orderId: string;
  detail: NonNullable<ReturnType<typeof useOrder>["data"]>;
}) {
  const productTypes = useProductTypes();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateOrder();

  const existingRooms = detail.rooms.map((r) => r.name);
  const roomOptions = [
    ...existingRooms,
    ...ROOM_PRESETS.filter((p) => !existingRooms.some((r) => r.toLowerCase() === p.toLowerCase())),
  ];

  const [room, setRoom] = useState<string | null>(existingRooms.length === 1 ? existingRooms[0]! : null);
  const [customRoom, setCustomRoom] = useState(false);
  const [customRoomName, setCustomRoomName] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const formStartRef = useRef<HTMLDivElement>(null);

  const roomName = customRoom ? customRoomName.trim() : (room ?? "");
  const selectedType = productTypes.data?.product_types.find((t) => t.id === typeId);
  const definition = selectedType?.definition as FormDefinition | undefined;

  const draft = useDraft(typeId ? `new:${orderId}:${typeId}` : null);
  const draftData = useMemo(() => draft.read(), [draft]);

  const startParams = useMemo<Params>(() => {
    if (!definition) return {};
    return draftData?.params ?? initialParams(definition);
  }, [definition, draftData]);

  async function submit(params: Params, note: string) {
    if (!typeId || !roomName) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/items", {
        method: "POST",
        body: {
          order_id: orderId,
          product_type_id: typeId,
          room: { name: roomName },
          params,
          note,
        },
      });
      draft.clear();
      invalidate(orderId);
      toast("Položka uložena.");
      navigate(`/zakazky/${orderId}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiFetchError && err.issues) {
        setServerIssues(err.issues);
        setError(err.message);
      } else {
        // výpadek signálu apod. — data zůstávají ve formuláři i v draftu
        setError(err instanceof Error ? err.message : "Uložení se nepodařilo.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Přidat produkt</h1>

      <section className="form-group">
        <h2 className="form-group-title">1. Místnost</h2>
        <Chips
          options={[...roomOptions, "Jiná…"]}
          value={customRoom ? "Jiná…" : room}
          onChange={(value) => {
            if (value === "Jiná…") {
              setCustomRoom(true);
              setRoom(null);
            } else {
              setCustomRoom(false);
              setRoom(value);
            }
          }}
        />
        {customRoom && (
          <TextInput
            aria-label="Název místnosti"
            placeholder="Název místnosti…"
            autoFocus
            value={customRoomName}
            onChange={(e) => setCustomRoomName(e.target.value)}
          />
        )}
      </section>

      <section className="form-group">
        <h2 className="form-group-title">2. Typ produktu</h2>
        {productTypes.isPending && <Spinner />}
        {productTypes.data && (
          <div className="type-tiles">
            {productTypes.data.product_types.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`type-tile ${typeId === t.id ? "type-tile-active" : ""}`}
                disabled={!t.active}
                onClick={() => {
                  setTypeId(t.id);
                  setServerIssues([]);
                  setError(null);
                  setTimeout(
                    () => formStartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
                    50,
                  );
                }}
              >
                <span className="type-tile-name">{t.name}</span>
                <span className="type-tile-code">{t.active ? t.code : "Připravujeme"}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div ref={formStartRef} />
      {definition && roomName === "" && (
        <p className="field-msg field-msg-warning">Nejdřív vyberte místnost (krok 1).</p>
      )}
      {definition && (
        <>
          {draftData && (
            <div className="draft-banner">
              Obnovena rozepsaná verze.{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  draft.clear();
                  // reset přes klíč — nejjednodušší je typ přepnout tam a zpět
                  const id = typeId;
                  setTypeId(null);
                  setTimeout(() => setTypeId(id), 0);
                }}
              >
                Začít znovu
              </button>
            </div>
          )}
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
        </>
      )}
      {error && <ErrorBanner message={error} />}
    </div>
  );
}

// --- Editace položky: připnutá verze definice --------------------------------

function EditItem({
  orderId,
  itemId,
  detail,
}: {
  orderId: string;
  itemId: string;
  detail: NonNullable<ReturnType<typeof useOrder>["data"]>;
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

  const draft = useDraft(item ? `edit:${item.id}` : null);
  const draftData = useMemo(() => draft.read(), [draft]);

  if (!item || !pinned) {
    return (
      <div className="page">
        <ErrorBanner message="Položka nenalezena." />
      </div>
    );
  }

  const room = detail.rooms.find((r) => r.id === item.room_id);

  async function submit(params: Params, note: string) {
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      await api(`/api/items/${itemId}`, {
        method: "PATCH",
        body: { params, note, expected_updated_at: item!.updated_at },
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
    <div className="page">
      <h1>
        {item.product_type_name}
        {room && <span className="muted"> · {room.name}</span>}
      </h1>

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
  );
}
