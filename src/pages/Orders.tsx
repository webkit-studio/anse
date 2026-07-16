import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { OrderStatus } from "@shared/types";
import { ORDER_STATUSES, STATUS_LABELS } from "@shared/types";
import { useOrders } from "../api/hooks";
import { EmptyState, ErrorBanner, Spinner, StatusBadge } from "../components/ui";

export default function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = (searchParams.get("status") ?? "") as OrderStatus | "";
  const searchParam = searchParams.get("search") ?? "";

  const [input, setInput] = useState(searchParam);
  const [debounced, setDebounced] = useState(searchParam);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (debounced) next.set("search", debounced);
    else next.delete("search");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const orders = useOrders(debounced, statusParam);

  function setStatus(status: OrderStatus | "") {
    const next = new URLSearchParams(searchParams);
    if (status) next.set("status", status);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>Zakázky</h1>
        <Link to="/zakazky/nova" className="btn btn-primary">
          + Nová
        </Link>
      </div>

      <input
        type="search"
        placeholder="Jméno, adresa, typ stínění…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        aria-label="Hledat v zakázkách"
      />

      {statusParam && (
        <p className="muted orders-filter-note">
          Filtr: {STATUS_LABELS[statusParam]}{" "}
          <button type="button" className="link-btn" onClick={() => setStatus("")}>
            zrušit
          </button>
        </p>
      )}

      {orders.isPending && <Spinner />}
      {orders.isError && (
        <ErrorBanner
          message={orders.error instanceof Error ? orders.error.message : "Chyba načítání."}
          onRetry={() => void orders.refetch()}
        />
      )}
      {orders.data &&
        (orders.data.orders.length === 0 ? (
          <EmptyState title={debounced || statusParam ? "Nic nenalezeno." : "Zatím žádné zakázky."}>
            {!debounced && !statusParam && (
              <Link to="/zakazky/nova" className="btn btn-primary">
                Založit první zakázku
              </Link>
            )}
          </EmptyState>
        ) : (
          <ul className="order-list">
            {orders.data.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/zakazky/${o.id}`} className="order-card">
                  <div className="order-card-top">
                    <span className="order-card-name">{o.client_name}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="order-card-sub">
                    {o.installation_address || "Bez adresy"}
                    {" · "}
                    {o.item_count === 1 ? "1 položka" : o.item_count >= 2 && o.item_count <= 4 ? `${o.item_count} položky` : `${o.item_count} položek`}
                  </div>
                  {(o.order_number || o.montage_number) && (
                    <div className="order-card-numbers">
                      {[o.order_number, o.montage_number].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
