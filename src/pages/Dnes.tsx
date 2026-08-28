import { Link } from "react-router-dom";
import type { ContactRow, OrderListRow } from "@shared/types";
import { czDateShort } from "@shared/format";
import { useMe, useToday } from "../api/hooks";
import { TechScreen } from "../components/Shell";
import { EmptyState, PhaseBadge, Queue, SkeletonList, ToneBadge, useDelayed } from "../components/ui";

/** „Dobré ráno" / „Dobrý den" / „Dobrý večer" podle hodiny. */
function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 10) return "Dobré ráno";
  if (h < 18) return "Dobrý den";
  return "Dobrý večer";
}

function czToday(now: Date): string {
  const days = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
  const months = [
    "ledna", "února", "března", "dubna", "května", "června",
    "července", "srpna", "září", "října", "listopadu", "prosince",
  ];
  return `${days[now.getDay()]} ${now.getDate()}. ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function OrderCard({ order, urgent }: { order: OrderListRow; urgent?: string }) {
  const me = useMe();
  const who = order.customer_name?.trim() || order.contact_name;
  return (
    <div className="card">
      <Link to={`/zakazky/${order.id}`} className="card-link">
        <span className="card-main">
          <span className="card-badges">
            <PhaseBadge phase={order.phase} role={me.data?.role ?? "technik"} />
            {urgent && <span className="badge badge-warn">{urgent}</span>}
          </span>
          <span className="card-title">{who}</span>
          <span className="card-sub">
            {order.addr_montaz || "adresa se doplní"}
            {order.item_count > 0 ? ` · ${order.item_count} pol.` : ""}
          </span>
        </span>
        <span className="card-chevron" aria-hidden="true">
          ›
        </span>
      </Link>
    </div>
  );
}

function ContactCard({ contact }: { contact: ContactRow }) {
  return (
    <div className="card">
      <Link to={`/kontakty/${contact.id}`} className="card-link">
        <span className="card-main">
          <span className="card-badges">
            <ToneBadge tone="todo">Ozvat se</ToneBadge>
          </span>
          <span className="card-title">{contact.name || contact.phone}</span>
          <span className="card-sub">
            {[contact.phone, contact.place].filter(Boolean).join(" · ") || "bez dalších údajů"}
          </span>
        </span>
        <span className="card-chevron" aria-hidden="true">
          ›
        </span>
      </Link>
    </div>
  );
}

export default function DnesPage() {
  const me = useMe();
  const today = useToday();
  const showSkeleton = useDelayed(today.isPending);
  const now = new Date();

  const data = today.data;
  const total = (data?.namontovat.length ?? 0) + (data?.dokoncit.length ?? 0) + (data?.ozvat.length ?? 0);
  const firstName = me.data?.name.split(" ")[0] ?? "";
  // 5. pád: Jakub → Jakube, Marek → Marku (jednoduchá heuristika pro česká jména)
  const vocative = firstName.endsWith("k") ? `${firstName.slice(0, -1)}ku` : firstName ? `${firstName}e` : "";

  return (
    <TechScreen
      title={vocative ? `${greeting(now)}, ${vocative}` : greeting(now)}
      subtitle={czToday(now)}
      bell
    >
      {today.isPending && showSkeleton && <SkeletonList />}

      {data && total === 0 && (
        <EmptyState icon="✓" title="Na dnešek nic nečeká">
          <p>Nové zakázky vznikají z kontaktů — mrkni, jestli není komu zavolat.</p>
          <Link to="/kontakty" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Otevřít kontakty
          </Link>
        </EmptyState>
      )}

      {data && total > 0 && (
        <p className="muted t-body-s" style={{ margin: "0 4px" }}>
          {total === 1 ? "1 věc na dnešek" : total < 5 ? `${total} věci na dnešek` : `${total} věcí na dnešek`}
        </p>
      )}

      <Queue title="Namontovat" count={data?.namontovat.length ?? 0}>
        {data?.namontovat.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            urgent={o.term_montaz ? `Montáž ${czDateShort(o.term_montaz)}` : "Chybí termín montáže"}
          />
        ))}
      </Queue>

      <Queue title="Dokončit zaměření" count={data?.dokoncit.length ?? 0}>
        {data?.dokoncit.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}
      </Queue>

      <Queue title="Ozvat se" count={data?.ozvat.length ?? 0}>
        {data?.ozvat.map((c) => (
          <ContactCard key={c.id} contact={c} />
        ))}
      </Queue>

      {(data?.v_kancelari ?? 0) > 0 && (
        <div className="info-row">
          <span aria-hidden="true">○</span>
          <span>
            {data!.v_kancelari === 1
              ? "1 zakázka čeká na kancelář"
              : data!.v_kancelari < 5
                ? `${data!.v_kancelari} zakázky čekají na kancelář`
                : `${data!.v_kancelari} zakázek čeká na kancelář`}
          </span>
        </div>
      )}
    </TechScreen>
  );
}
