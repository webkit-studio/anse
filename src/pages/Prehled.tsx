import { Link } from "react-router-dom";
import type { OrderListRow, OrderPhase } from "@shared/types";
import { PHASE_FLOW, PHASE_LABELS } from "@shared/types";
import { czDateShort, days, money } from "@shared/format";
import { useOverview } from "../api/hooks";
import { OfficeShell } from "../components/Shell";
import { EmptyState, SkeletonList, useDelayed } from "../components/ui";

const QUEUES: { phase: OrderPhase; title: string }[] = [
  { phase: "k_zamereni", title: "K zaměření" },
  { phase: "k_naceneni", title: "K nacenění" },
  { phase: "k_montazi", title: "K montáži" },
  { phase: "k_fakturaci", title: "K fakturaci" },
];

const STALE_DAYS = 7;

function QueueCard({ order }: { order: OrderListRow & { idle_days: number } }) {
  const who = order.customer_name?.trim() || order.contact_name;
  const stale = order.idle_days >= STALE_DAYS;
  return (
    <Link to={`/zakazky/${order.id}`} className="queue-card">
      <span className="queue-card-title">{who}</span>
      <span className="queue-card-sub">
        <span>
          {order.phase === "k_naceneni"
            ? `${order.item_count} pol.`
            : order.phase === "k_montazi"
              ? order.term_montaz
                ? `montáž ${czDateShort(order.term_montaz)}`
                : "bez termínu montáže"
              : order.phase === "k_fakturaci"
                ? money(order.price_customer, "bez ceny")
                : (order.assignee_name ?? "")}
        </span>
        {!order.assignee_id && order.phase === "k_zamereni" && (
          <span className="queue-card-old">nepřidělen</span>
        )}
        {stale && <span className="queue-card-old">{days(order.idle_days)}</span>}
      </span>
    </Link>
  );
}

export default function PrehledPage() {
  const overview = useOverview();
  const showSkeleton = useDelayed(overview.isPending);
  const data = overview.data;
  const counts = data?.phase_counts;

  return (
    <OfficeShell
      title="Přehled"
      subtitle="Kde co stojí a co je na tahu"
      actions={
        <Link to="/kontakty" className="btn btn-primary">
          + Nová zakázka
        </Link>
      }
    >
      {overview.isPending && showSkeleton && <SkeletonList />}

      {(data?.fresh_contacts ?? 0) > 0 && (
        <div className="banner">
          <span aria-hidden="true">●</span>
          <span>
            {data!.fresh_contacts === 1
              ? "1 nový kontakt — ozvat se"
              : `${data!.fresh_contacts} nových kontaktů — ozvat se`}
          </span>
          <Link to="/kontakty?filtr=fresh">Otevřít kontakty ›</Link>
        </div>
      )}

      {data && (
        <>
          <div className="queues">
            {QUEUES.map((q) => {
              const rows = data.queue.filter((o) => o.phase === q.phase);
              return (
                <div className="queue-col" key={q.phase}>
                  <div className="queue-col-head">
                    <span className="queue-title">{q.title}</span>
                    <span className="queue-count">{rows.length}</span>
                    {rows.length > 4 && (
                      <Link className="queue-more" to={`/zakazky?faze=${q.phase}`}>
                        Vše ›
                      </Link>
                    )}
                  </div>
                  {rows.slice(0, 4).map((o) => (
                    <QueueCard key={o.id} order={o} />
                  ))}
                  {rows.length === 0 && <p className="muted t-caption">Prázdné</p>}
                </div>
              );
            })}
          </div>

          <div className="phase-strip">
            {PHASE_FLOW.map((p) => (
              <Link className="phase-strip-cell" key={p} to={`/zakazky?faze=${p}`}>
                <span className="phase-strip-n">{counts?.[p] ?? 0}</span>
                <span className="phase-strip-label">{PHASE_LABELS[p]}</span>
              </Link>
            ))}
            <Link className="phase-strip-cell" to="/zakazky?faze=zruseno">
              <span className="phase-strip-n">{counts?.zruseno ?? 0}</span>
              <span className="phase-strip-label">Zrušeno</span>
            </Link>
          </div>

          {data.queue.length === 0 && (
            <EmptyState icon="✓" title="Žádná rozjetá zakázka">
              <p>Nová zakázka vzniká z kontaktu — zadáním termínu zaměření.</p>
              <Link to="/kontakty" className="btn btn-secondary" style={{ marginTop: 12 }}>
                Otevřít kontakty
              </Link>
            </EmptyState>
          )}
        </>
      )}
    </OfficeShell>
  );
}
