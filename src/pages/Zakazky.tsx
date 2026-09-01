import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { OrderListRow, OrderPhase } from "@shared/types";
import { PHASE_LABELS } from "@shared/types";
import { ago, czDateShort, money } from "@shared/format";
import { useMe, useOrders } from "../api/hooks";
import { OfficeShell, TechScreen, useOfficeView } from "../components/Shell";
import { Chips, EmptyState, PhaseBadge, SkeletonList, ToneBadge, useDelayed } from "../components/ui";

const TECH_FILTERS = [
  { value: "vse", label: "Vše" },
  { value: "k_zamereni", label: "K zaměření" },
  { value: "k_montazi", label: "K montáži" },
  { value: "archiv", label: "Archiv" },
] as const;

const OFFICE_FILTERS = [
  { value: "vse", label: "Vše" },
  { value: "k_zamereni", label: "K zaměření" },
  { value: "k_naceneni", label: "K nacenění" },
  { value: "k_montazi", label: "K montáži" },
  { value: "k_fakturaci", label: "K fakturaci" },
  { value: "hotovo", label: "Hotovo" },
  { value: "zruseno", label: "Zrušené" },
] as const;

type Filter = OrderPhase | "vse" | "archiv";

function OrderCard({ order }: { order: OrderListRow }) {
  const me = useMe();
  const who = order.customer_name?.trim() || order.contact_name;
  return (
    <div className="card">
      <Link to={`/zakazky/${order.id}`} className="card-link">
        <span className="card-main">
          <span className="card-badges">
            <PhaseBadge phase={order.phase} role={me.data?.role ?? "technik"} />
            {order.signed_at && <ToneBadge tone="done">Podepsáno</ToneBadge>}
          </span>
          <span className="card-title">{who}</span>
          <span className="card-sub">
            {[
              order.addr_montaz,
              order.item_count > 0 ? `${order.item_count} pol.` : "",
              order.term_montaz ? `montáž ${czDateShort(order.term_montaz)}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="card-chevron" aria-hidden="true">
          ›
        </span>
      </Link>
    </div>
  );
}

export default function ZakazkyPage() {
  const office = useOfficeView();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const filter = (params.get("faze") as Filter | null) ?? "vse";
  const orders = useOrders(search, filter);
  const navigate = useNavigate();
  const me = useMe();
  const showSkeleton = useDelayed(orders.isPending);
  const rows = orders.data?.orders ?? [];

  function setFilter(next: Filter) {
    setParams(next === "vse" ? {} : { faze: next }, { replace: true });
  }

  if (office) {
    return (
      <OfficeShell
        title="Zakázky"
        subtitle={`${rows.length} zobrazených`}
        search={
          <input
            type="search"
            placeholder="Zákazník nebo adresa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Hledat zakázku"
          />
        }
        actions={
          <Link to="/kontakty" className="btn btn-primary">
            + Nová zakázka
          </Link>
        }
      >
        <Chips options={OFFICE_FILTERS} value={filter} onChange={setFilter} />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Zákazník</th>
                <th>Adresa</th>
                <th>Fáze</th>
                <th className="num">Pol.</th>
                <th className="num col-secondary">Cena</th>
                <th className="col-secondary">Dodání</th>
                <th className="col-secondary">Montáž</th>
                <th>Technik</th>
                <th className="col-secondary">Změněno</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="row-link" onClick={() => navigate(`/zakazky/${o.id}`)}>
                  <td className="cell-strong">{o.customer_name?.trim() || o.contact_name}</td>
                  <td className="cell-muted">{o.addr_montaz || "—"}</td>
                  <td>
                    <PhaseBadge phase={o.phase} role="kancelar" />
                  </td>
                  <td className="num">{o.item_count}</td>
                  <td className="num col-secondary">{money(o.price_customer)}</td>
                  <td className="col-secondary">{czDateShort(o.term_dodani)}</td>
                  <td className="col-secondary">{czDateShort(o.term_montaz)}</td>
                  <td className="cell-muted">{o.assignee_name ?? "—"}</td>
                  <td className="cell-muted col-secondary">{ago(o.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !orders.isPending && (
          <EmptyState title="Žádné zakázky">
            <p>Zakázka vzniká vždy z kontaktu — zadáním termínu zaměření.</p>
          </EmptyState>
        )}
      </OfficeShell>
    );
  }

  // Technik: „Moje" (na tahu on) a „Čeká" (leží u kanceláře) — archiv zvlášť.
  const onMe = rows.filter((o) => ["k_zamereni", "k_montazi"].includes(o.phase));
  const rest = rows.filter((o) => !["k_zamereni", "k_montazi"].includes(o.phase));
  const groups =
    filter === "archiv"
      ? [{ title: "Archiv", rows }]
      : [
          { title: "Moje", rows: onMe },
          { title: "Čeká", rows: rest },
        ];

  return (
    <TechScreen title="Zakázky">
      <input
        type="search"
        placeholder="Zákazník nebo adresa"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Hledat zakázku"
      />
      <Chips options={TECH_FILTERS} value={filter} onChange={setFilter} />

      {orders.isPending && showSkeleton && <SkeletonList />}

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <section className="queue" key={g.title}>
            <div className="queue-head">
              <span className="queue-title">{g.title}</span>
              <span className="queue-count">{g.rows.length}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.rows.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        ))}

      {rows.length === 0 && !orders.isPending && (
        <EmptyState title="Žádné zakázky">
          <p>
            {filter === "vse"
              ? `Zakázky vznikají z kontaktů${me.data?.role === "technik" ? " a přidělují se ti" : ""}.`
              : `Ve fázi „${filter === "archiv" ? "Archiv" : PHASE_LABELS[filter as OrderPhase]}“ nic není.`}
          </p>
        </EmptyState>
      )}
    </TechScreen>
  );
}
