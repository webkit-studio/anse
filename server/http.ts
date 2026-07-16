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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: err.message }, { status: err.status });
  }
  console.error(err);
  return json({ error: "Neočekávaná chyba serveru. Zkuste to prosím znovu." }, { status: 500 });
}
