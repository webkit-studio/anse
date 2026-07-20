import { Link } from "react-router-dom";
import { useDashboard, useMe } from "../api/hooks";
import { ErrorBanner, Spinner } from "../components/ui";

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
          <Link to="/zakazky?status=rozpracovana" className="status-tile">
            <span className="status-tile-count">{dashboard.data.counts.rozpracovana}</span>
            <span className="status-tile-label">Rozpracované</span>
          </Link>
          <Link to="/zakazky?status=k_objednani" className="status-tile status-tile-k_objednani">
            <span className="status-tile-count">{dashboard.data.counts.k_objednani}</span>
            <span className="status-tile-label">K objednání</span>
          </Link>
        </div>
      )}

      <div className="dashboard-actions">
        <Link to="/zakazky/nova" className="btn btn-primary btn-block btn-xl">
          + Nová zakázka
        </Link>
        <Link to="/zakazky" className="btn btn-secondary btn-block">
          Zakázky
        </Link>
        {isAdmin && (
          <>
            <Link to="/statistiky" className="btn btn-secondary btn-block">
              Statistiky
            </Link>
            <Link to="/admin" className="btn btn-secondary btn-block">
              Správa účtů
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
