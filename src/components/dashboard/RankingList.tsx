import type { CSSProperties } from "react";
import { formatCurrency } from "../../lib/agenda";
import type { MovementGroupItem } from "../../lib/movement";
import { ChartEmptyState } from "./ModernCharts";

interface RankingListProps {
  title: string;
  items: MovementGroupItem[];
}

export function RankingList({ title, items }: RankingListProps) {
  const visibleItems = items.slice(0, 5);
  const hiddenCount = items.length - visibleItems.length;
  const maxTotal = Math.max(...visibleItems.map((item) => item.total), 1);

  return (
    <section className="dashboard-panel ranking-panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <>
          <div className="ranking-list">
            {visibleItems.map((item, index) => (
              <div className="ranking-item" key={item.name}>
                <span className="ranking-position">{index + 1}</span>
                <div>
                  <strong title={item.name}>{item.name}</strong>
                  <span>
                    {item.count} atendimento{item.count === 1 ? "" : "s"} · {formatCurrency(item.total)}
                  </span>
                  <span>Ticket médio: {formatCurrency(item.averageTicket)}</span>
                  <span
                    aria-label={`Participação de ${item.name}`}
                    className="ranking-bar"
                    role="img"
                    style={{ "--ranking-value": item.total / maxTotal } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
          {hiddenCount > 0 ? <p className="ranking-more">+ {hiddenCount} itens no período</p> : null}
        </>
      )}
    </section>
  );
}
