import { useState } from "react";
import { useStatsMonth } from "../api/hooks";
import { ErrorBanner, Spinner } from "../components/ui";

// Statistiky pro admina: měsíční souhrn + rozpad podle uživatelů
// s proporcionálními pruhy. Šipkami se listuje měsíci (max. do aktuálního).

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

function Bar({ value, max, kind }: { value: number; max: number; kind: "zalozeno" | "objednano" }) {
  const width = max > 0 && value > 0 ? Math.max(10, (value / max) * 100) : 0;
  return (
    <div className="stats-bar-track">
      {value > 0 && <div className={`stats-bar stats-bar-${kind}`} style={{ width: `${width}%` }} />}
    </div>
  );
}

export default function StatsPage() {
  const [month, setMonth] = useState(currentMonth());
  const stats = useStatsMonth(month);

  const maxUser = Math.max(
    1,
    ...(stats.data?.users.flatMap((u) => [u.zalozeno, u.objednano]) ?? []),
  );

  return (
    <div className="page">
      <h1>Statistiky</h1>

      <div className="stats-period">
        <button
          type="button"
          className="btn btn-secondary stats-arrow"
          aria-label="Předchozí měsíc"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <strong className="stats-period-label">{monthLabel(month)}</strong>
        <button
          type="button"
          className="btn btn-secondary stats-arrow"
          aria-label="Další měsíc"
          disabled={month >= currentMonth()}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>

      {stats.isPending && <Spinner />}
      {stats.isError && (
        <ErrorBanner message="Statistiky se nepodařilo načíst." onRetry={() => void stats.refetch()} />
      )}
      {stats.data && (
        <>
          <div className="stats-totals">
            <div className="stats-total">
              <span className="stats-total-num">{stats.data.zalozeno}</span>
              <span className="stats-total-label">vyměřeno</span>
            </div>
            <div className="stats-total stats-total-green">
              <span className="stats-total-num">{stats.data.objednano}</span>
              <span className="stats-total-label">objednáno</span>
            </div>
          </div>

          <h2 className="section-title">Podle uživatelů</h2>
          {stats.data.users.length === 0 && <p className="muted">V tomto měsíci nic neproběhlo.</p>}
          <ul className="stats-users">
            {stats.data.users.map((u) => (
              <li key={u.name} className="stats-user">
                <div className="stats-user-head">
                  <span className="stats-user-name">{u.name}</span>
                  <span className="stats-user-counts muted">
                    {u.zalozeno} vyměřeno · {u.objednano} objednáno
                  </span>
                </div>
                <Bar value={u.zalozeno} max={maxUser} kind="zalozeno" />
                <Bar value={u.objednano} max={maxUser} kind="objednano" />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
