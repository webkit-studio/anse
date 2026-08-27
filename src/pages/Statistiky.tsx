import { useState } from "react";
import { money } from "@shared/format";
import { useStatsMonth } from "../api/hooks";
import { OfficeShell } from "../components/Shell";
import { Button, EmptyState, SkeletonList, useDelayed } from "../components/ui";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = [
    "leden", "únor", "březen", "duben", "květen", "červen",
    "červenec", "srpen", "září", "říjen", "listopad", "prosinec",
  ];
  return `${names[(m ?? 1) - 1]} ${y}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y!, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StatistikyPage() {
  const [month, setMonth] = useState(thisMonth());
  const stats = useStatsMonth(month);
  const showSkeleton = useDelayed(stats.isPending);
  const data = stats.data;
  const max = Math.max(1, ...(data?.funnel ?? []).map((f) => f.value));

  const KPI = [
    { label: "Nové kontakty", value: data?.kpi.nove_kontakty },
    { label: "Zaměřeno", value: data?.kpi.zamereno },
    { label: "Objednáno", value: data?.kpi.objednano },
    { label: "Hotovo", value: data?.kpi.hotovo },
  ];

  return (
    <OfficeShell
      title="Statistiky"
      subtitle={monthLabel(month)}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Předchozí měsíc">
            ‹
          </Button>
          <Button
            variant="secondary"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= thisMonth()}
            aria-label="Další měsíc"
          >
            ›
          </Button>
        </div>
      }
    >
      {stats.isPending && showSkeleton && <SkeletonList />}

      {data && (
        <>
          <div className="kpi-grid">
            {KPI.map((k) => (
              <div className="kpi" key={k.label}>
                <div className="kpi-value">{k.value ?? 0}</div>
                <div className="kpi-label">{k.label}</div>
              </div>
            ))}
          </div>

          <section className="card card-pad">
            <h2 className="card-section-title">Trychtýř</h2>
            <div className="funnel">
              {data.funnel.map((f) => (
                <div className="funnel-row" key={f.label}>
                  <span>{f.label}</span>
                  <span className="funnel-track">
                    <span className="funnel-fill" style={{ width: `${(f.value / max) * 100}%` }} />
                  </span>
                  <span className="funnel-value">{f.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="card-section-title">Po technicích</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Technik</th>
                    <th className="num">Zaměřeno</th>
                    <th className="num">Namontováno</th>
                    <th className="num">Cena práce</th>
                  </tr>
                </thead>
                <tbody>
                  {data.techs.map((t) => (
                    <tr key={t.name}>
                      <td className="cell-strong">{t.name}</td>
                      <td className="num">{t.zamereno}</td>
                      <td className="num">{t.namontovano}</td>
                      <td className="num">{money(t.price_montage_sum, "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.techs.length === 0 && (
              <EmptyState icon="◔" title="Za tenhle měsíc nic">
                <p>Statistiky se plní, jakmile technici odešlou zaměření nebo dokončí montáž.</p>
              </EmptyState>
            )}
          </section>
        </>
      )}
    </OfficeShell>
  );
}
