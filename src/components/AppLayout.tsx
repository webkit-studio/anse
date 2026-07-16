import { Link, Outlet, useNavigate } from "react-router-dom";
import { useLogout, useMe } from "../api/hooks";

export function AppLayout() {
  const me = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const user = me.data;

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-logo" aria-label="Domů">
          ANSE
        </Link>
        <div className="app-header-right">
          {user?.role === "admin" && (
            <Link to="/admin" className="app-header-link">
              Správa
            </Link>
          )}
          <button
            type="button"
            className="app-header-link"
            onClick={() => {
              logout.mutate(undefined, { onSuccess: () => navigate("/login") });
            }}
          >
            {user?.name.split(" ")[0]} · Odhlásit
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
