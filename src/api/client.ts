import type { Issue } from "@shared/form-engine";

export class ApiFetchError extends Error {
  status: number;
  issues?: Issue[];

  constructor(status: number, message: string, issues?: Issue[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

export function isConflict(err: unknown): boolean {
  return err instanceof ApiFetchError && err.status === 409;
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiFetchError && err.status === 401;
}

interface ApiOptions {
  method?: string;
  body?: unknown;
}

/** Fetch wrapper: JSON, cookies (same-origin), české chyby z API. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    // typicky výpadek signálu v terénu
    throw new ApiFetchError(0, "Bez připojení — zkontroluj signál a zkus to znovu.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // prázdné/ne-JSON tělo
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; issues?: Issue[] };
    throw new ApiFetchError(
      res.status,
      payload.error ?? "Neočekávaná chyba serveru.",
      payload.issues,
    );
  }
  return data as T;
}
