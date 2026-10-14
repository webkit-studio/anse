import { useState } from "react";
import { PHOTO_KIND_LABELS, type GalleryPhoto, type PhotoKind } from "@shared/types";
import { api } from "../api/client";
import { useInvalidatePhotos, usePhotos } from "../api/hooks";
import { PhotoLightbox } from "./PhotoLightbox";
import { PhotoPicker } from "./PhotoPicker";
import { ErrorBanner } from "./ui";

const KIND_ORDER: PhotoKind[] = ["klient", "zamereni", "zavada", "realizace"];

export const photoUrl = (id: string) => `/api/photos/${id}/img`;

function popis(p: GalleryPhoto): string {
  return p.popis ? `${PHOTO_KIND_LABELS[p.kind]} · ${p.popis}` : PHOTO_KIND_LABELS[p.kind];
}

/**
 * Galerie zakázky: všechny fotky na jednom místě, seřazené podle toho, odkud
 * jsou — od zákazníka, ze zaměření, závady, po montáži. Fotky od zákazníka
 * patří kontaktu, takže jdou přidat i před založením zakázky. Fotky položek
 * a realizace se přidávají tam, kde vznikají (formulář položky, montáž).
 */
export function Galerie({
  contactId,
  orderId,
}: {
  contactId: string;
  /** U zakázky: její fotky + fotky od zákazníka u kontaktu. */
  orderId?: string;
}) {
  const photos = usePhotos(orderId ? { orderId } : { contactId });
  const invalidate = useInvalidatePhotos();
  const [open, setOpen] = useState<number | null>(null);

  const all = photos.data?.photos ?? [];
  const groups = KIND_ORDER.map((kind) => ({ kind, list: all.filter((p) => p.kind === kind) }));
  // Pořadí v prohlížeči odpovídá pořadí na stránce (skupina po skupině).
  const flat = groups.flatMap((g) => g.list);
  const klient = groups[0]!.list;


  return (
    <section>
      <h2 className="card-section-title">Fotky{all.length ? ` (${all.length})` : ""}</h2>
      <div className="card card-pad galerie">
        {photos.isError && (
          <ErrorBanner message="Fotky se nepodařilo načíst." onRetry={() => photos.refetch()} />
        )}

        {/* Fotky od zákazníka jdou přidávat kdykoli — pošle je klidně až po zaměření. */}
        <PhotoPicker
          label={PHOTO_KIND_LABELS.klient}
          kind="klient"
          camera={false}
          saved={klient.map((p) => ({ ...p, data: photoUrl(p.id) }))}
          pending={[]}
          onPendingChange={() => undefined}
          upload={async (data) => {
            await api("/api/photos", { method: "POST", body: { contact_id: contactId, kind: "klient", data } });
          }}
          onUploaded={() => void invalidate()}
          onOpen={(id) => setOpen(flat.findIndex((f) => f.id === id))}
        />

        {groups.slice(1).map(
          (g) =>
            g.list.length > 0 && (
              <div key={g.kind}>
                <span className="field-label">{PHOTO_KIND_LABELS[g.kind]}</span>
                <div className="photo-grid" style={{ marginTop: 8 }}>
                  {g.list.map((p) => (
                    <button
                      type="button"
                      className="photo-slot"
                      key={p.id}
                      title={popis(p)}
                      aria-label={`Otevřít fotku — ${popis(p)}`}
                      onClick={() => setOpen(flat.findIndex((f) => f.id === p.id))}
                    >
                      <img src={photoUrl(p.id)} alt={popis(p)} loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            ),
        )}

        {photos.isSuccess && all.length === 0 && (
          <p className="muted t-body-s" style={{ margin: 0 }}>
            Zatím žádné fotky. Fotky ze zaměření a montáže se sem přidají samy.
          </p>
        )}
      </div>

      {open !== null && open >= 0 && (
        <PhotoLightbox
          photos={flat.map((p) => ({ id: p.id, data: photoUrl(p.id), popis: popis(p) }))}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
