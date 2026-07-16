import { useState } from "react";
import { useStatsMonth, useStatsWeek } from "../api/hooks";
import { ErrorBanner, Spinner } from "../components/ui";

// Statistiky pro admina: měsíční souhrn (celkem + po technicích) a týdenní
// pohled po dnech. Šipkami se listuje obdobími.

const MONTH_NAMES = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${y}`;
}

function currentMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function shiftWeek(monday: string, delta: number): string {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().slice(0, 10);
}

function czDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}. ${Number(m)}.`;
}

function Bar({ value, max, kind }: { value: number; max: number; kind: "zalozeno" | "objednano" }) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 0;
  return (
    <div className="stats-bar-track">
      {value > 0 && <div className={`stats-bar stats-bar-${kind}`} style={{ width: `${width}%` }} />}
    </div>
  );
}

function MonthView() {
  const [month, setMonth] = useState(currentMonth());
  const stats = useStatsMonth(month);

  return (
    <>
      <div className="stats-period">
        <button type="button" className="btn btn-ghost" onClick={() => setMonth(shiftMonth(month, -1))}>
          ‹
        </button>
        <strong>{monthLabel(month)}</strong>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={month >= currentMonth()}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>

      {stats.isPending && <Spinner />}
      {stats.isError && <ErrorBanner message="Statistiky se nepodařilo načíst." onRetry={() => void stats.refetch()} />}
      {stats.data && (
        <>
          <div className="stats-totals">
            <div className="stats-total">
              <span className="stats-total-num">{stats.data.zalozeno}</span>
              <span className="stats-total-label">vyměřeno (založené zakázky)</span>
            </div>
            <div className="stats-total">
              <span className="stats-total-num">{stats.data.objednano}</span>
              <span className="stats-total-label">objednáno</span>
            </div>
          </div>

          <h2 className="section-title">Po technicích</h2>
          {stats.data.users.length === 0 && <p className="muted">V tomto měsíci nic neproběhlo.</p>}
          <ul className="stats-users">
            {stats.data.users.map((u) => (
              <li key={u.name} className="stats-user">
                <span className="stats-user-name">{u.name}</span>
                <span className="stats-user-counts">
                  {u.zalozeno} vyměřeno · {u.objednano} objednáno
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function WeekView() {
  const [monday, setMonday] = useState(currentMonday());
  const stats = useStatsWeek(monday);
  const maxCount = Math.max(1, ...(stats.data?.days.flatMap((d) => [d.zalozeno, d.objednano]) ?? []));

  return (
    <>
      <div className="stats-period">
        <button type="button" className="btn btn-ghost" onClick={() => setMonday(shiftWeek(monday, -1))}>
          ‹
        </button>
        <strong>
          {czDate(monday)} – {czDate(shiftWeek(monday, 1).slice(0, 10))}
        </strong>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={monday >= currentMonday()}
          onClick={() => setMonday(shiftWeek(monday, 1))}
        >
          ›
        </button>
      </div>

      {stats.isPending && <Spinner />}
      {stats.isError && <ErrorBanner message="Statistiky se nepodařilo načíst." onRetry={() => void stats.refetch()} />}
      {stats.data && (
        <ul className="stats-days">
          {stats.data.days.map((d, i) => (
            <li key={d.date} className="stats-day">
              <div className="stats-day-head">
                <span className="stats-day-name">
                  {DAY_NAMES[i]} {czDate(d.date)}
                </span>
                <span className="muted">
                  {d.zalozeno} vyměřeno · {d.objednano} objednáno
                </span>
              </div>
              <Bar value={d.zalozeno} max={maxCount} kind="zalozeno" />
              <Bar value={d.objednano} max={maxCount} kind="objednano" />
              {d.users.length > 0 && (
                <p className="stats-day-users muted">
                  {d.users
                    .map((u) => {
                      const parts = [];
                      if (u.zalozeno) parts.push(`${u.zalozeno}× vyměřil`);
                      if (u.objednano) parts.push(`${u.objednano}× objednal`);
                      return `${u.name.split(" ")[0]} ${parts.join(", ")}`;
                    })
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function StatsPage() {
  const [view, setView] = useState<"month" | "week">("month");

  return (
    <div className="page">
      <h1>Statistiky</h1>

      <div className="segmented" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "month"}
          className={`segmented-btn ${view === "month" ? "segmented-active" : ""}`}
          onClick={() => setView("month")}
        >
          Měsíc
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "week"}
          className={`segmented-btn ${view === "week" ? "segmented-active" : ""}`}
          onClick={() => setView("week")}
        >
          Týden
        </button>
      </div>

      {view === "month" ? <MonthView /> : <WeekView />}

      <p className="muted stats-legend">
        Vyměřeno = založení zakázky technikem · Objednáno = přepnutí na stav Objednáno.
      </p>
    </div>
  );
}
