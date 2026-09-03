import { useEffect } from "react";
import { Icon } from "./Icon";

export interface LightboxPhoto {
  id: string;
  data: string;
  /** K čemu fotka patří — bez toho kancelář neví, co na ní má hledat. */
  popis: string;
}

/**
 * Prohlížeč fotek zakázky. Fotky jsou data: URL a prohlížeč na ně odmítá
 * navigovat, takže odkaz do nového okna nedělal nic; tohle je otevře na místě,
 * dá se v nich listovat a stáhnout je.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: LightboxPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, photos.length, onIndex, onClose]);

  if (!photo) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Fotky zakázky">
      <div className="lightbox-head">
        <button type="button" className="lightbox-btn" onClick={onClose} aria-label="Zavřít">
          ✕
        </button>
        <span className="lightbox-title">{photo.popis}</span>
        <span className="lightbox-count">
          {index + 1} / {photos.length}
        </span>
        {/* Stažení jde i z data: URL — na rozdíl od navigace ho prohlížeč pustí. */}
        <a
          className="lightbox-btn"
          href={photo.data}
          download={`${photo.popis.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.jpg`}
        >
          <Icon name="foto" size={17} /> Stáhnout
        </a>
      </div>
      <div className="lightbox-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <button
          type="button"
          className="lightbox-nav"
          disabled={index === 0}
          onClick={() => onIndex(index - 1)}
          aria-label="Předchozí fotka"
        >
          ‹
        </button>
        <img src={photo.data} alt={photo.popis} />
        <button
          type="button"
          className="lightbox-nav"
          disabled={index >= photos.length - 1}
          onClick={() => onIndex(index + 1)}
          aria-label="Další fotka"
        >
          ›
        </button>
      </div>
    </div>
  );
}
