// Drobné HTTP utility pro API odpovědi. Chybové zprávy jsou česky —
// klient je zobrazuje přímo uživateli.

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

export class ApiError extends Error {
  status: number;
  /** Doplňková data pro klienta (např. issues u 422). */
  extra?: Record<string, unknown>;

  constructor(status: number, message: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: err.message, ...err.extra }, { status: err.status });
  }
  console.error(err);
  return json({ error: "Neočekávaná chyba serveru. Zkus to prosím znovu." }, { status: 500 });
}

/** Vrátí response s přidanou set-cookie hlavičkou (Response headers jsou immutable). */
export function withCookie(res: Response, cookie: string): Response {
  const headers = new Headers(res.headers);
  headers.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, headers });
}
