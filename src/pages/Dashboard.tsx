import { Link } from "react-router-dom";
import type { OrderStatus } from "@shared/types";
import { STATUS_LABELS } from "@shared/types";
import { useDashboard, useMe } from "../api/hooks";
import { ErrorBanner, Spinner } from "../components/ui";

/** Dlaždice na dashboardu: rozpracované fáze (hotové zakázky se nehlídají). */
const ACTIVE_STATUSES: OrderStatus[] = [
  "rozpracovana",
  "k_naceneni",
  "k_objednavce",
  "k_montazi",
];

export default function DashboardPage() {
  const dashboard = useDashboard();
  const me = useMe();
  const isAdmin = me.data?.role === "admin";

  return (
    <div className="page">
      {dashboard.isPending && <Spinner />}
      {dashboard.isError && (
        <ErrorBanner
          message={dashboard.error instanceof Error ? dashboard.error.message : "Chyba načítání."}
          onRetry={() => void dashboard.refetch()}
        />
      )}
      {dashboard.data && (
        <div className="status-tiles">
          {ACTIVE_STATUSES.map((s) => (
            <Link
              key={s}
              to={`/zakazky?status=${s}`}
              className={`status-tile status-tile-${s}`}
            >
              <span className="status-tile-count">{dashboard.data.counts[s]}</span>
              <span className="status-tile-label">{STATUS_LABELS[s]}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="dashboard-actions">
        <Link to="/zakazky/nova" className="btn btn-primary btn-block btn-xl">
          + Nová zakázka
        </Link>
        <nav className="menu-card" aria-label="Hlavní nabídka">
          <Link to="/zakazky" className="menu-row">
            <span>Zakázky</span>
            <span className="menu-chevron" aria-hidden="true">
              ›
            </span>
          </Link>
          {isAdmin && (
            <>
              <Link to="/statistiky" className="menu-row">
                <span>Statistiky</span>
                <span className="menu-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
              <Link to="/admin" className="menu-row">
                <span>Správa účtů</span>
                <span className="menu-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}
