import { useMemo, useRef } from "react";
import type { Params } from "@shared/form-schema";

export interface DraftData {
  params: Params;
  note: string;
  savedAt: string;
}

/**
 * Rozepsaný formulář přežije výpadek signálu / zavření prohlížeče.
 * Klíč per zakázka+typ (nová položka) nebo per položka (editace).
 */
export function useDraft(key: string | null) {
  const storageKey = key ? `anse-draft:${key}` : null;
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  return useMemo(
    () => ({
      read(): DraftData | null {
        if (!storageKey) return null;
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as DraftData;
          if (!parsed || typeof parsed !== "object" || !parsed.params) return null;
          return parsed;
        } catch {
          return null;
        }
      },
      save(params: Params, note: string): void {
        if (!storageKey) return;
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({ params, note, savedAt: new Date().toISOString() } satisfies DraftData),
            );
          } catch {
            // plné úložiště — draft je jen pojistka, pokračujeme bez něj
          }
        }, 400);
      },
      clear(): void {
        if (!storageKey) return;
        clearTimeout(saveTimer.current);
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignorovat
        }
      },
    }),
    [storageKey],
  );
}
