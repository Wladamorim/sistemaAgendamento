import { type CSSProperties, useId } from "react";
import { ChartArea } from "lucide-react";

export const CHART_COLORS = {
  danger: "#DC2626",
  grid: "#E5EAF2",
  neutral: "#94A3B8",
  positive: "#16A34A",
  primary: "#2563EB",
  secondary: "#60A5FA",
  warning: "#F59E0B",
} as const;

const chartPalette = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.positive,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.neutral,
];

export interface ModernChartItem {
  averageTicket?: number;
  color?: string;
  completedAppointments?: number;
  fullLabel?: string;
  label: string;
  productionTotal?: number;
  topCategory?: string | null;
  topProfessional?: string | null;
  value: number;
}

interface ModernAreaChartProps {
  items: ModernChartItem[];
  valueFormatter: (value: number) => string;
}

interface ModernDoughnutChartProps {
  centerLabel: string;
  centerValue: string;
  items: ModernChartItem[];
  valueFormatter: (value: number) => string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getSafeNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getXAxisStep(total: number) {
  if (total <= 12) {
    return 1;
  }

  if (total <= 18) {
    return 2;
  }

  if (total <= 31) {
    return 4;
  }

  return Math.ceil(total / 10);
}

function getPointPath(points: { x: number; y: number }[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function getArcPath(center: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(center, center, radius, endAngle);
  const end = polarToCartesian(center, center, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function ChartEmptyState() {
  return (
    <div className="chart-empty-state">
      <ChartArea aria-hidden="true" size={22} strokeWidth={1.8} />
      <strong>Nenhum dado disponível</strong>
      <span>Os dados aparecerão quando houver movimentações.</span>
    </div>
  );
}

function ProductionTooltip({ item, valueFormatter }: { item: ModernChartItem; valueFormatter: (value: number) => string }) {
  const productionTotal = getSafeNumber(item.productionTotal ?? item.value);
  const completedAppointments = Math.max(0, Math.round(getSafeNumber(item.completedAppointments)));
  const averageTicket =
    completedAppointments > 0 ? getSafeNumber(item.averageTicket ?? productionTotal / completedAppointments) : 0;
  const hasProduction = productionTotal > 0;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{item.fullLabel ?? item.label}</p>

      {hasProduction ? (
        <>
          <div className="chart-tooltip-row">
            <span>Produção total</span>
            <strong>{valueFormatter(productionTotal)}</strong>
          </div>

          <div className="chart-tooltip-row">
            <span>Atendimentos finalizados</span>
            <strong>{completedAppointments}</strong>
          </div>

          <div className="chart-tooltip-row">
            <span>Ticket médio</span>
            <strong>{valueFormatter(averageTicket)}</strong>
          </div>

          {item.topProfessional ? (
            <div className="chart-tooltip-row">
              <span>Profissional destaque</span>
              <strong>{item.topProfessional}</strong>
            </div>
          ) : null}

          {item.topCategory ? (
            <div className="chart-tooltip-row">
              <span>Categoria destaque</span>
              <strong>{item.topCategory}</strong>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="chart-tooltip-empty">Sem produção registrada</p>
          <div className="chart-tooltip-row">
            <span>Atendimentos finalizados</span>
            <strong>{completedAppointments}</strong>
          </div>
        </>
      )}
    </div>
  );
}

export function ModernAreaChart({ items, valueFormatter }: ModernAreaChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const width = 680;
  const height = 286;
  const padding = { bottom: 38, left: 34, right: 18, top: 20 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...items.map((item) => item.value), 0);
  const domainMax = maxValue > 0 ? maxValue * 1.18 : 1;
  const xStep = getXAxisStep(items.length);

  if (items.length === 0 || maxValue === 0) {
    return <ChartEmptyState />;
  }

  const points = items.map((item, index) => {
    const x = items.length === 1 ? padding.left + chartWidth / 2 : padding.left + (chartWidth / (items.length - 1)) * index;
    const y = padding.top + chartHeight - (item.value / domainMax) * chartHeight;

    return { item, x, y };
  });
  const visualPoints =
    points.length === 1
      ? [
          { x: padding.left, y: points[0].y },
          { x: width - padding.right, y: points[0].y },
        ]
      : points;
  const linePath = getPointPath(visualPoints);
  const areaPath = `${linePath} L ${visualPoints[visualPoints.length - 1].x} ${padding.top + chartHeight} L ${visualPoints[0].x} ${
    padding.top + chartHeight
  } Z`;
  const gridLines = Array.from({ length: 4 }, (_, index) => padding.top + (chartHeight / 3) * index);

  return (
    <div className="modern-area-chart">
      <svg aria-label="Gráfico de produção por período" role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`${gradientId}-area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity="0.18" />
            <stop offset="72%" stopColor={CHART_COLORS.primary} stopOpacity="0.045" />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="modern-area-chart__grid">
          {gridLines.map((y) => (
            <line key={y} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
          ))}
        </g>

        <path className="modern-area-chart__fill" d={areaPath} fill={`url(#${gradientId}-area)`} />
        <path className="modern-area-chart__line" d={linePath} />

        <g className="modern-area-chart__markers">
          {points.map(({ item, x, y }, index) => {
            const tooltipX = clamp(x - 112, 8, width - 236);
            const tooltipY = clamp(y - 154, 6, height - 172);

            return (
              <g className="modern-area-chart__point" key={`${item.label}-${index}`} tabIndex={0}>
                <line className="modern-area-chart__hover-line" x1={x} x2={x} y1={padding.top} y2={padding.top + chartHeight} />
                <circle cx={x} cy={y} r="4.2" />
                <foreignObject className="modern-chart-tooltip" height="166" width="228" x={tooltipX} y={tooltipY}>
                  <ProductionTooltip item={item} valueFormatter={valueFormatter} />
                </foreignObject>
              </g>
            );
          })}
        </g>

        <g className="modern-area-chart__axis">
          {items.map((item, index) => {
            const shouldShow = index === 0 || index === items.length - 1 || index % xStep === 0;
            const point = points[index];

            return shouldShow ? (
              <text key={`${item.label}-${index}`} x={point.x} y={height - 12}>
                {item.label}
              </text>
            ) : null;
          })}
        </g>
      </svg>
    </div>
  );
}

export function ModernDoughnutChart({ centerLabel, centerValue, items, valueFormatter }: ModernDoughnutChartProps) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const center = 70;
  const radius = 52;
  let currentAngle = 0;

  if (items.length === 0 || total === 0) {
    return <ChartEmptyState />;
  }

  const coloredItems = items.map((item, index) => ({
    ...item,
    color: item.color ?? chartPalette[index % chartPalette.length],
  }));

  return (
    <div className="modern-doughnut-chart">
      <div className="modern-doughnut-chart__figure">
        <svg aria-label="Gráfico de distribuição por forma de pagamento" role="img" viewBox="0 0 140 140">
          <circle className="modern-doughnut-chart__track" cx={center} cy={center} r={radius} />
          {coloredItems.map((item, index) => {
            const sliceAngle = (item.value / total) * 360;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;
            currentAngle = endAngle;
            const commonProps = {
              className: "modern-doughnut-chart__slice",
              key: `${item.label}-${index}`,
              stroke: item.color,
              style: { "--slice-index": index } as CSSProperties,
            };

            if (sliceAngle >= 359.99) {
              return (
                <circle {...commonProps} cx={center} cy={center} r={radius}>
                  <title>
                    {item.label}: {valueFormatter(item.value)}
                  </title>
                </circle>
              );
            }

            return (
              <path
                {...commonProps}
                d={getArcPath(center, radius, startAngle, endAngle)}
              >
                <title>
                  {item.label}: {valueFormatter(item.value)}
                </title>
              </path>
            );
          })}
        </svg>
        <div className="modern-doughnut-chart__center">
          <span>{centerLabel}</span>
          <strong>{centerValue}</strong>
        </div>
      </div>

      <div className="modern-doughnut-chart__legend">
        {coloredItems.map((item, index) => (
          <div className="modern-doughnut-chart__legend-item" key={`${item.label}-${index}`}>
            <span aria-hidden="true" style={{ "--legend-color": item.color } as CSSProperties} />
            <div>
              <strong>{item.label}</strong>
              <small>
                {valueFormatter(item.value)} · {((item.value / total) * 100).toFixed(0)}%
              </small>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
