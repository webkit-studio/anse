import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLogin, useMe } from "../api/hooks";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const login = useLogin();
  const me = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  useEffect(() => {
    if (me.data) navigate(from, { replace: true });
  }, [me.data, from, navigate]);

  function submit(value: string) {
    setError(null);
    login.mutate(value, {
      onSuccess: () => navigate(from, { replace: true }),
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Přihlášení se nepodařilo.");
        setCode("");
        inputRef.current?.focus();
      },
    });
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setError(null);
    if (digits.length === 6) submit(digits);
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1 className="login-logo">ANSE</h1>
        <p className="login-subtitle">Interní aplikace pro zakázky</p>

        <label className="field-label" htmlFor="login-code">
          Přihlašovací kód
        </label>
        <input
          ref={inputRef}
          id="login-code"
          className={`login-code-input ${error ? "input-error" : ""}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="······"
          value={code}
          disabled={login.isPending}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? "login-error" : undefined}
        />
        {login.isPending && <p className="login-hint">Přihlašuji…</p>}
        {error && (
          <p id="login-error" className="field-msg field-msg-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
