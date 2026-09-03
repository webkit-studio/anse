import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Params } from "@shared/form-schema";
import type { ProductTypeRow, SubcategoryRow } from "@shared/types";
import { ROOM_PRESETS, displayName } from "@shared/types";
import type { Issue } from "@shared/form-engine";
import { ApiFetchError, api } from "../api/client";
import { useInvalidateOrder, useKonfigProduct, useOrder, useProductTypes } from "../api/hooks";
import { PhotoPicker, uploadPending, type PendingPhoto } from "../components/PhotoPicker";
import { NavodOverlay, navodySlugsFor } from "../components/NavodOverlay";
import { Icon } from "../components/Icon";
import { ProductIcon } from "../components/ProductIcon";
import { InOfficeFrame, TechDetailFramed } from "../components/Shell";
import { useToast } from "../components/Toast";
import {
  Button,
  Chips,
  ConfirmButton,
  Field,
  Spinner,
  Textarea,
  TextInput,
  useOnline,
} from "../components/ui";
import { DefinitionForm } from "../form-engine/DefinitionForm";
import { KonfiguratorForm } from "../form-engine/KonfiguratorForm";
import { useDraft } from "../form-engine/useDraft";

type Kind = "config" | "oprava";

const KINDS = [
  { value: "config", label: "Zaměření" },
  { value: "oprava", label: "Oprava" },
] as const;

/** Výběr místnosti: existující v zakázce, běžné presety, nebo vlastní název. */
function RoomPicker({
  rooms,
  value,
  onChange,
}: {
  rooms: { id: string; name: string }[];
  value: { id: string } | { name: string };
  onChange: (v: { id: string } | { name: string }) => void;
}) {
  const [custom, setCustom] = useState("name" in value ? value.name : "");
  const presets = ROOM_PRESETS.filter((p) => !rooms.some((r) => r.name.toLowerCase() === p.toLowerCase()));

  return (
    <div className="card card-pad">
      <span className="field-label">Místnost *</span>
      <div className="chips chips-scroll" style={{ margin: "8px 0" }}>
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`chip ${"id" in value && value.id === r.id ? "chip-active" : ""}`}
            onClick={() => onChange({ id: r.id })}
          >
            {r.name}
          </button>
        ))}
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            className={`chip ${"name" in value && value.name === p ? "chip-active" : ""}`}
            onClick={() => {
              setCustom(p);
              onChange({ name: p });
            }}
          >
            {p}
          </button>
        ))}
      </div>
      <TextInput
        aria-label="Vlastní název místnosti"
        value={custom}
        placeholder="…nebo napiš vlastní"
        onChange={(e) => {
          setCustom(e.target.value);
          onChange({ name: e.target.value });
        }}
      />
    </div>
  );
}

export default function ItemFormPage({ mode }: { mode: "new" | "edit" }) {
  const { orderId = "", itemId = "" } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const detail = useOrder(orderId);
  const types = useProductTypes();
  const invalidate = useInvalidateOrder();

  const [kind, setKind] = useState<Kind>("config");
  const [productId, setProductId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [room, setRoom] = useState<{ id: string } | { name: string }>(
    search.get("room") ? { id: search.get("room")! } : { name: "" },
  );
  const [defect, setDefect] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [navod, setNavod] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const touchedRef = useRef(false);
  const online = useOnline();

  const d = detail.data;
  const item = mode === "edit" ? d?.items.find((i) => i.id === itemId) : undefined;

  // Údaje zákazníka tu ZÁMĚRNĚ nic neblokují. Technik měří hned, jak vejde do
  // domu, a jméno s e-mailem dopisuje, až na ně přijde řeč — chybí jen k tomu,
  // aby šla zakázka poslat k nacenění, a to hlídá warn-bar na detailu.
  const productTypes = types.data?.product_types ?? [];

  // Editace: produkt, podkategorie i verze definice jsou dané položkou.
  const product: ProductTypeRow | undefined = item
    ? productTypes.find((p) => p.id === item.product_type_id)
    : (productTypes.find((p) => p.id === productId) ?? undefined);
  const sub: SubcategoryRow | undefined = item
    ? product?.subcategories.find((s) => s.id === item.subcategory_id)
    : product?.subcategories.find((s) => s.id === subId);

  const definition = item
    ? (item.form_definition_id ? d?.definitions[item.form_definition_id]?.definition : undefined)
    : sub?.definition;

  // Produkty z podkladů dodavatele (konfigurátor) nemají definici v DB —
  // schéma polí a pravidel se stahuje zvlášť a formulář řídí vyhodnocovač.
  const konfigKey = item ? item.konfig_key : (sub?.konfig_key ?? null);
  const konfig = useKonfigProduct(konfigKey);
  const navodySlugy = navodySlugsFor(sub);

  const draftKey = mode === "edit" ? `item:${itemId}` : productId && subId ? `new:${orderId}:${subId}` : null;
  const draft = useDraft(draftKey);
  const initial = useMemo(() => {
    if (item) return { params: item.params, note: item.note };
    const saved = draft.read();
    return { params: (saved?.params ?? {}) as Params, note: saved?.note ?? "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, draftKey]);

  const activeKind: Kind = item ? item.kind : kind;
  const rooms = d?.rooms ?? [];
  const roomValid = "id" in room ? true : room.name.trim() !== "";

  async function saveConfig(params: Params, noteText: string) {
    if (busy) return;
    setBusy(true);
    setServerIssues([]);
    try {
      if (mode === "edit" && item) {
        await api(`/api/items/${item.id}`, {
          method: "PATCH",
          body: { params, note: noteText, expected_updated_at: item.updated_at },
        });
      } else {
        if (!roomValid) {
          toast("Vyber místnost.");
          setBusy(false);
          return;
        }
        const { item: created } = await api<{ item: { id: string } }>("/api/items", {
          method: "POST",
          body: {
            kind: "config",
            order_id: orderId,
            room,
            product_type_id: product!.id,
            subcategory_id: sub!.id,
            params,
            note: noteText,
          },
        });
        if (photos.length) await uploadPending(orderId, created.id, "zamereni", photos);
      }
      draft.clear();
      await invalidate(orderId);
      toast("Položka uložená");
      navigate(`/zakazky/${orderId}`);
    } catch (err) {
      if (err instanceof ApiFetchError && err.issues) setServerIssues(err.issues);
      toast(err instanceof Error ? err.message : "Položku se nepodařilo uložit.");
      setBusy(false);
    }
  }

  async function saveRepair() {
    if (busy) return;
    if (!product) {
      toast("Vyber produkt.");
      return;
    }
    if (!roomValid) {
      toast("Vyber místnost.");
      return;
    }
    if (!defect.trim()) {
      toast("Popiš závadu.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "edit" && item) {
        await api(`/api/items/${item.id}`, {
          method: "PATCH",
          body: { defect_note: defect, note, expected_updated_at: item.updated_at },
        });
      } else {
        const { item: created } = await api<{ item: { id: string } }>("/api/items", {
          method: "POST",
          body: {
            kind: "oprava",
            order_id: orderId,
            room,
            product_type_id: product.id,
            defect_note: defect,
            note,
          },
        });
        if (photos.length) await uploadPending(orderId, created.id, "zavada", photos);
      }
      await invalidate(orderId);
      toast("Oprava uložená");
      navigate(`/zakazky/${orderId}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Opravu se nepodařilo uložit.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    await api(`/api/items/${item.id}`, { method: "DELETE" });
    await invalidate(orderId);
    toast("Položka smazaná");
    navigate(`/zakazky/${orderId}`);
  }

  // --- výběr produktu (jen nová položka) ------------------------------------
  if (mode === "new" && (!product || (activeKind === "config" && !sub))) {
    return (
      <TechDetailFramed back={`/zakazky/${orderId}`} backLabel="Zakázka">
        <h1 className="t-title" style={{ margin: "4px 0 0" }}>
          {activeKind === "config" ? "Co zaměřujeme" : "Co opravujeme"}
        </h1>
        <Chips options={KINDS} value={kind} onChange={(k) => {
          setKind(k);
          setProductId(null);
          setSubId(null);
        }} />

        {activeKind === "oprava" && (
          <p className="muted t-body-s" style={{ margin: 0 }}>
            Vyber produkt, vyfoť závadu a popiš ji.
          </p>
        )}

        {types.isPending && <Spinner />}

        {!product && (
          <div className="product-grid">
            {productTypes.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`product-tile ${p.active ? "" : "product-tile-off"}`}
                onClick={() => {
                  if (!p.active) {
                    toast("Tenhle produkt teď není k dispozici.");
                    return;
                  }
                  setProductId(p.id);
                  const active = p.subcategories.filter((s) => s.active);
                  // Jedna podkategorie = žádný zbytečný krok navíc.
                  if (activeKind === "config" && active.length === 1) setSubId(active[0]!.id);
                }}
              >
                <ProductIcon name={p.name} size={26} />
                <span className="product-name">{displayName(p)}</span>
                {p.note_for_tech && <span className="product-note">{p.note_for_tech}</span>}
                {!p.active && <span className="muted t-caption">zatím nedostupné</span>}
              </button>
            ))}
          </div>
        )}

        {product && activeKind === "config" && (
          <>
            <h2 className="card-section-title" style={{ marginTop: 8 }}>
              {displayName(product)}
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {product.subcategories.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`product-tile ${s.active ? "" : "product-tile-off"}`}
                  style={{ minHeight: 0 }}
                  onClick={() => {
                    if (!s.active) {
                      toast("Tahle podkategorie teď není k dispozici.");
                      return;
                    }
                    setSubId(s.id);
                  }}
                >
                  <span className="product-name">{displayName(s)}</span>
                  {s.note && <span className="product-note">{s.note}</span>}
                  {s.field_count ? <span className="muted t-caption">{s.field_count} polí</span> : null}
                </button>
              ))}
              {product.subcategories.length === 0 && (
                <p className="muted t-body-s">Tenhle produkt zatím nemá formulář — přidej ho jako opravu.</p>
              )}
            </div>
            <Button variant="ghost" onClick={() => setProductId(null)}>
              ← Jiný produkt
            </Button>
          </>
        )}
      </TechDetailFramed>
    );
  }

  // --- oprava ----------------------------------------------------------------
  if (activeKind === "oprava") {
    return (
      <TechDetailFramed
        back={`/zakazky/${orderId}`}
        backLabel="Zakázka"
        footer={
          <Button variant="primary" onClick={() => void saveRepair()} disabled={busy}>
            {busy ? "Ukládám…" : "Uložit opravu"}
          </Button>
        }
      >
        <div className="repair-card">
          <span className="badge tone-wait">
            <Icon name="oprava" size={12} />
            Oprava
          </span>
          <h1 className="t-section" style={{ margin: "10px 0 0" }}>
            {product ? displayName(product) : item?.product_type_name}
          </h1>
        </div>

        {mode === "new" && <RoomPicker rooms={rooms} value={room} onChange={setRoom} />}

        <div className="card card-pad">
          <Field label="Popis závady" htmlFor="defect" required>
            <Textarea
              id="defect"
              value={defect || item?.defect_note || ""}
              rows={3}
              onChange={(e) => setDefect(e.target.value)}
              placeholder="Co je špatně, kde a od kdy…"
            />
          </Field>
          <PhotoPicker
            label="Foto závady *"
            kind="zavada"
            orderId={orderId}
            itemId={item?.id}
            saved={item?.photos ?? []}
            pending={photos}
            onPendingChange={setPhotos}
            onUploaded={() => invalidate(orderId)}
          />
        </div>

        {item && (
          <ConfirmButton
            label="Smazat položku"
            confirmLabel="Opravdu smazat?"
            className="order-delete"
            onConfirm={() => void remove()}
          />
        )}
      </TechDetailFramed>
    );
  }

  // --- konfigurace podle definice / podkladů dodavatele ----------------------
  if (konfigKey && konfig.isError) {
    return (
      <TechDetailFramed back={`/zakazky/${orderId}`} backLabel="Zakázka">
        <p className="muted t-body-s">
          Podklady produktu se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.
        </p>
        <Button variant="ghost" onClick={() => void konfig.refetch()}>
          Zkusit znovu
        </Button>
      </TechDetailFramed>
    );
  }
  const konfigProduct = konfig.data?.product;
  if (konfigKey ? !konfigProduct : !definition) {
    return (
      <TechDetailFramed back={`/zakazky/${orderId}`} backLabel="Zakázka">
        <Spinner />
      </TechDetailFramed>
    );
  }

  const roomName =
    "id" in room ? (rooms.find((r) => r.id === room.id)?.name ?? "") : room.name;
  // Nadpis pojmenuje položku STEJNĚ jako seznam v zakázce („Jack West · SEL 15"),
  // ne jen kategorii („Okenní síť“) — jinak to vypadá, že je člověk jinde.
  const nazevProduktu = item
    ? item.subcategory_name || item.product_type_name
    : sub
      ? displayName(sub)
      : product
        ? displayName(product)
        : "";
  const mistnostNazev = item
    ? (rooms.find((r) => r.id === item.room_id)?.name ?? "")
    : roomName;
  const title = [nazevProduktu, mistnostNazev || "vyber místnost"].filter(Boolean).join(" · ");

  return (
    <InOfficeFrame>
    <div className="tech">
      <div className="tech-bar">
        <Link to={`/zakazky/${orderId}`} className="back-btn">
          ← Zakázka
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Duplikace sedí u položky v seznamu zakázky, ne tady: kopíruje se
              podle toho, co je v seznamu vidět, ne z otevřeného formuláře. */}
          {/* Tlačítko je vždy — když návod ještě není, overlay to řekne (U8). */}
          <Button variant="ghost" onClick={() => setNavod(true)}>
            <Icon name="navod" size={19} /> Návod
          </Button>
        </div>
      </div>

      {mode === "new" && (
        <div className="tech-body" style={{ paddingBottom: 0 }}>
          <RoomPicker rooms={rooms} value={room} onChange={setRoom} />
        </div>
      )}

      {(() => {
        // Fotky a mazání jsou stejné pro oba druhy formuláře.
        const extras = (
          <>
            <section className="form-group">
              <h2 className="form-group-title">Fotky</h2>
              <PhotoPicker
                label="Foto k položce"
                kind="zamereni"
                orderId={orderId}
                itemId={item?.id}
                saved={item?.photos ?? []}
                pending={photos}
                onPendingChange={setPhotos}
                onUploaded={() => invalidate(orderId)}
              />
            </section>

            {item && (
              <ConfirmButton
                label="Smazat položku"
                confirmLabel="Opravdu smazat?"
                className="order-delete"
                onConfirm={() => void remove()}
              />
            )}
          </>
        );
        const shared = {
          initialParams: initial.params,
          initialNote: initial.note,
          title,
          submitLabel: mode === "edit" ? "Uložit změny" : "Uložit položku",
          busy,
          serverIssues,
          savedLabel: savedAt ? `Uloženo automaticky v ${savedAt}` : undefined,
          offline: !online,
          onChange: (params: Params, noteText: string) => {
            draft.save(params, noteText);
            // indikátor „uloženo" až po první skutečné změně, ne hned po otevření
            if (touchedRef.current) {
              setSavedAt(new Date().toLocaleTimeString("cs-CZ", { hour: "numeric", minute: "2-digit" }));
            }
            touchedRef.current = true;
          },
          onSubmit: (params: Params, noteText: string) => void saveConfig(params, noteText),
        };
        if (konfigProduct) {
          return (
            <KonfiguratorForm product={konfigProduct} {...shared}>
              {extras}
            </KonfiguratorForm>
          );
        }
        return definition ? (
          <DefinitionForm definition={definition} {...shared}>
            {extras}
          </DefinitionForm>
        ) : null;
      })()}

      {navod && (
        <NavodOverlay
          slugs={navodySlugy}
          fallbackText={product?.note_for_tech || undefined}
          onClose={() => setNavod(false)}
        />
      )}
    </div>
    </InOfficeFrame>
  );
}
