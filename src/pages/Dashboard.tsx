import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ORDER_STATUSES, STATUS_LABELS } from "@shared/types";
import { useDashboard } from "../api/hooks";
import { ErrorBanner, Spinner } from "../components/ui";

export default function DashboardPage() {
  const dashboard = useDashboard();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  return (
    <div className="page">
      <Link to="/zakazky/nova" className="btn btn-primary btn-block btn-xl">
        + Nová zakázka
      </Link>

      <form
        className="dashboard-search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/zakazky?search=${encodeURIComponent(search.trim())}`);
        }}
      >
        <input
          type="search"
          placeholder="Hledat: jméno, adresa, typ stínění…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Hledat v zakázkách"
        />
      </form>

      {dashboard.isPending && <Spinner />}
      {dashboard.isError && (
        <ErrorBanner
          message={dashboard.error instanceof Error ? dashboard.error.message : "Chyba načítání."}
          onRetry={() => void dashboard.refetch()}
        />
      )}
      {dashboard.data && (
        <div className="status-tiles">
          {ORDER_STATUSES.map((s) => (
            <Link key={s} to={`/zakazky?status=${s}`} className={`status-tile status-tile-${s}`}>
              <span className="status-tile-count">{dashboard.data.counts[s]}</span>
              <span className="status-tile-label">{STATUS_LABELS[s]}</span>
            </Link>
          ))}
          <Link to="/zakazky" className="status-tile status-tile-all">
            <span className="status-tile-count">
              {ORDER_STATUSES.reduce((sum, s) => sum + dashboard.data.counts[s], 0)}
            </span>
            <span className="status-tile-label">Všechny zakázky</span>
          </Link>
        </div>
      )}
    </div>
  );
}
