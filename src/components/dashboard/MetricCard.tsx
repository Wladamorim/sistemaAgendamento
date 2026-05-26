import type { ReactNode } from "react";

type MetricIcon = "users" | "revenue" | "category" | "professional";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon?: MetricIcon;
  tone?: "positive" | "negative" | "neutral";
}

function MetricIcon({ name }: { name: MetricIcon }) {
  const paths: Record<MetricIcon, ReactNode> = {
    users: (
      <>
        <path d="M16 19v-1.2a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 17.8V19" />
        <path d="M10 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M20 19v-1a3.4 3.4 0 0 0-2.4-3.2M16.2 5a3 3 0 0 1 0 5.7" />
      </>
    ),
    revenue: (
      <>
        <path d="M12 3v18" />
        <path d="M16.5 7.5a3.5 3.5 0 0 0-4.5-2.2c-2.1.6-3.2 2.8-1.3 4.2 1 .7 2.4.9 3.6 1.3 2.3.8 2.8 3.4.8 4.8a4.2 4.2 0 0 1-6.2-2.1" />
      </>
    ),
    category: (
      <>
        <path d="M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v5H4zM13 14h7v5h-7z" />
      </>
    ),
    professional: (
      <>
        <path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
        <path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <path d="M9 12h6" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="metric-card__icon" fill="none" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function MetricCard({ label, value, detail, icon = "category", tone = "neutral" }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <MetricIcon name={icon} />
        <span className="metric-card__label" title={label}>
          {label}
        </span>
      </div>
      <strong className="metric-card__value" title={value}>
        {value}
      </strong>
      {detail ? (
        <p className={`metric-card__detail metric-card__detail--${tone}`} title={detail}>
          {detail}
        </p>
      ) : null}
    </article>
  );
}
