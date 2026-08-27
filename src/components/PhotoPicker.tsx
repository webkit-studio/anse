import { useRef, useState } from "react";
import type { ItemPhoto } from "@shared/types";
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
 * po uložení; u existující jdou rovnou na server.
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
}: {
  label: string;
  kind: "zamereni" | "zavada" | "realizace";
  orderId: string;
  itemId?: string;
  saved?: ItemPhoto[];
  pending: PendingPhoto[];
  onPendingChange: (next: PendingPhoto[]) => void;
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const data = await compress(file);
        if (itemId) {
          await api("/api/photos", { method: "POST", body: { order_id: orderId, item_id: itemId, kind, data } });
          onUploaded?.();
        } else {
          onPendingChange([...pending, { id: `${Date.now()}-${Math.random()}`, data }]);
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
            <img src={p.data} alt="" />
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
          {busy ? "Nahrávám…" : "Vyfotit"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
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
  kind: "zamereni" | "zavada" | "realizace",
  pending: PendingPhoto[],
): Promise<void> {
  for (const p of pending) {
    await api("/api/photos", {
      method: "POST",
      body: { order_id: orderId, item_id: itemId, kind, data: p.data },
    });
  }
}
