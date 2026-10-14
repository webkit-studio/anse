import { useRef, useState } from "react";
import type { ItemPhoto, PhotoKind } from "@shared/types";
import { api } from "../api/client";
import { useToast } from "./Toast";

const MAX_EDGE = 1400;
const QUALITY = 0.72;

/** Komprese na klientu — do DB jde data-URL, free tier nemá objektové úložiště. */
export async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Fotku se nepodařilo zpracovat.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}

export interface PendingPhoto {
  id: string;
  data: string;
}

/**
 * Fotky položky. U rozepsané položky (bez id) se drží v paměti a nahrají se
 * po uložení; u existující jdou rovnou na server. Bez zakázky (nový kontakt)
 * se fotky jen drží a nahraje je volající.
 */
export function PhotoPicker({
  label,
  kind,
  orderId,
  itemId,
  saved = [],
  pending,
  onPendingChange,
  onUploaded,
  camera = true,
  upload,
  onOpen,
}: {
  label: string;
  kind: PhotoKind;
  orderId?: string;
  itemId?: string;
  saved?: ItemPhoto[];
  pending: PendingPhoto[];
  onPendingChange: (next: PendingPhoto[]) => void;
  onUploaded?: () => void;
  /** false = výběr z galerie telefonu (fotky, které zákazník poslal). */
  camera?: boolean;
  /** Vlastní nahrání (fotky ke kontaktu) — má přednost před položkou i pending. */
  upload?: (data: string) => Promise<void>;
  /** Klik na uloženou fotku (otevře prohlížeč). */
  onOpen?: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    // Víc vybraných fotek najednou: každá se přidá k předchozím, ne k původnímu
    // `pending` (jinak zůstala jen poslední).
    let acc = pending;
    try {
      for (const file of Array.from(files)) {
        const data = await compress(file);
        if (upload) {
          await upload(data);
          onUploaded?.();
        } else if (itemId && orderId) {
          await api("/api/photos", { method: "POST", body: { order_id: orderId, item_id: itemId, kind, data } });
          onUploaded?.();
        } else {
          acc = [...acc, { id: `${Date.now()}-${Math.random()}`, data }];
          onPendingChange(acc);
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Fotku se nepodařilo přidat.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeSaved(id: string) {
    await api(`/api/photos/${id}`, { method: "DELETE" });
    onUploaded?.();
  }

  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="photo-grid" style={{ marginTop: 8 }}>
        {saved.map((p) => (
          <div className="photo-slot" key={p.id}>
            {onOpen ? (
              <button type="button" className="photo-open" aria-label="Otevřít fotku" onClick={() => onOpen(p.id)}>
                <img src={p.data} alt="" loading="lazy" />
              </button>
            ) : (
              <img src={p.data} alt="" />
            )}
            <button
              type="button"
              className="photo-del"
              aria-label="Smazat fotku"
              onClick={() => void removeSaved(p.id)}
            >
              ✕
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div className="photo-slot" key={p.id}>
            <img src={p.data} alt="" />
            <button
              type="button"
              className="photo-del"
              aria-label="Smazat fotku"
              onClick={() => onPendingChange(pending.filter((x) => x.id !== p.id))}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="photo-add" onClick={() => inputRef.current?.click()} disabled={busy}>
          <span aria-hidden="true" style={{ fontSize: 20 }}>
            ＋
          </span>
          {busy ? "Nahrávám…" : camera ? "Vyfotit" : "Přidat"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={camera ? "environment" : undefined}
        multiple
        hidden
        onChange={(e) => void add(e.target.files)}
      />
    </div>
  );
}

/** Nahraje fotky nachystané u rozepsané položky, jakmile položka vznikne. */
export async function uploadPending(
  orderId: string,
  itemId: string,
  kind: PhotoKind,
  pending: PendingPhoto[],
): Promise<void> {
  for (const p of pending) {
    await api("/api/photos", {
      method: "POST",
      body: { order_id: orderId, item_id: itemId, kind, data: p.data },
    });
  }
}
