import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { isAdmin } from "../components/AppShell";
import { RestrictedAccess } from "../components/RestrictedAccess";
import { MetricCard } from "../components/dashboard/MetricCard";
import { MovementTable } from "../components/dashboard/MovementTable";
import { RankingList } from "../components/dashboard/RankingList";
import {
  addDays,
  formatCurrency,
  formatDate,
  formatDateForQuery,
  getRelativeDateLabel,
  parseDateInput,
} from "../lib/agenda";
import {
  buildPaymentBreakdown,
  getAppointmentCashAmount,
  getAppointmentProductionAmount,
  getComboSaleCashAmount,
  getCompletedAppointments,
  getPaymentLabel,
  getTopItem,
  groupByCategory,
  groupByProfessional,
  type MovementComboSale,
  type MovementAppointment,
  type PaymentBreakdownItem,
} from "../lib/movement";
import { supabase } from "../lib/supabase";
import type { AppUser } from "../types/user";

interface MovimentacaoProps {
  user: AppUser;
}

type MovementPeriod = "day" | "week" | "month" | "quarter" | "semester" | "year";
type MovementStatusFilter = "all" | "completed" | "scheduled" | "confirmed" | "cancelled" | "no_show";
type MovementPaymentFilter =
  | "all"
  | "pix"
  | "cartao_credito"
  | "cartao_debito"
  | "dinheiro"
  | "transferencia"
  | "cortesia"
  | "multiplas"
  | "combo"
  | "nao_informado";

interface PeriodRange {
  start: Date;
  end: Date;
  startValue: string;
  endValue: string;
}

interface ChartItem {
  label: string;
  total: number;
}

interface RawAppointmentRow {
  id: string;
  client_id: string | null;
  procedure_id: string | null;
  professional_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_at_booking: number | string | null;
  status_code: string | null;
  payment_method?: string | null;
  payment_installments?: number | null;
  payment_details?: unknown | null;
  paid_amount?: number | string | null;
  clients: { full_name: string | null } | { full_name: string | null }[] | null;
  procedures:
    | {
        name: string | null;
        procedure_categories: { name: string | null } | { name: string | null }[] | null;
      }
    | {
        name: string | null;
        procedure_categories: { name: string | null } | { name: string | null }[] | null;
      }[]
    | null;
  professionals: { name: string | null } | { name: string | null }[] | null;
}

interface RawViewAppointmentRow {
  id: string;
  client_id?: string | null;
  procedure_id?: string | null;
  professional_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  client_name: string | null;
  procedure_name: string | null;
  category_name: string | null;
  professional_name: string | null;
  price_at_booking: number | string | null;
  status_code: string | null;
  status_name: string | null;
  payment_method?: string | null;
  payment_installments?: number | null;
  payment_details?: unknown | null;
  paid_amount?: number | string | null;
}

interface RawComboSaleRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  name: string;
  created_at: string | null;
  start_date: string;
  package_price: number | string | null;
  purchase_payment_method: string | null;
  purchase_payment_details: unknown | null;
  effective_status: string | null;
  status?: string | null;
}

const periodOptions: { label: string; value: MovementPeriod }[] = [
  { label: "Diario", value: "day" },
  { label: "Semanal", value: "week" },
  { label: "Mensal", value: "month" },
  { label: "Trimestral", value: "quarter" },
  { label: "Semestral", value: "semester" },
  { label: "Anual", value: "year" },
];

const periodAdjective: Record<MovementPeriod, string> = {
  day: "do dia",
  month: "mensal",
  quarter: "trimestral",
  semester: "semestral",
  week: "semanal",
  year: "anual",
};

const previousPeriodLabel: Record<MovementPeriod, string> = {
  day: "dia anterior",
  month: "mes anterior",
  quarter: "trimestre anterior",
  semester: "semestre anterior",
  week: "semana anterior",
  year: "ano anterior",
};

const statusFilterOptions: { label: string; value: MovementStatusFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Finalizados", value: "completed" },
  { label: "Agendados", value: "scheduled" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Cancelados", value: "cancelled" },
  { label: "No-show", value: "no_show" },
];

const paymentFilterOptions: { label: string; value: MovementPaymentFilter }[] = [
  { label: "Todos pagamentos", value: "all" },
  { label: "Pix", value: "pix" },
  { label: "Credito", value: "cartao_credito" },
  { label: "Debito", value: "cartao_debito" },
  { label: "Dinheiro", value: "dinheiro" },
  { label: "Transferencia", value: "transferencia" },
  { label: "Cortesia", value: "cortesia" },
  { label: "Multiplas", value: "multiplas" },
  { label: "Combo", value: "combo" },
  { label: "Nao informado", value: "nao_informado" },
];

function startOfWeek(date: Date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  nextDate.setDate(nextDate.getDate() + diff);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate;
}

function getPeriodRange(date: Date, period: MovementPeriod): PeriodRange {
  const start = new Date(date);
  const end = new Date(date);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (period === "week") {
    const weekStart = startOfWeek(date);
    const weekEnd = addDays(weekStart, 6);

    return {
      end: weekEnd,
      endValue: formatDateForQuery(weekEnd),
      start: weekStart,
      startValue: formatDateForQuery(weekStart),
    };
  }

  if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }

  if (period === "quarter") {
    const firstQuarterMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(firstQuarterMonth, 1);
    end.setMonth(firstQuarterMonth + 3, 0);
  }

  if (period === "semester") {
    const firstSemesterMonth = start.getMonth() < 6 ? 0 : 6;
    start.setMonth(firstSemesterMonth, 1);
    end.setMonth(firstSemesterMonth + 6, 0);
  }

  if (period === "year") {
    start.setMonth(0, 1);
    end.setMonth(12, 0);
  }

  return {
    end,
    endValue: formatDateForQuery(end),
    start,
    startValue: formatDateForQuery(start),
  };
}

function getPreviousPeriodRange(range: PeriodRange, period: MovementPeriod) {
  return getPeriodRange(addDays(range.start, -1), period);
}

function shiftDateByPeriod(date: Date, period: MovementPeriod, direction: -1 | 1) {
  if (period === "day") {
    return addDays(date, direction);
  }

  if (period === "week") {
    return addDays(date, direction * 7);
  }

  const nextDate = new Date(date);

  if (period === "month") {
    nextDate.setMonth(nextDate.getMonth() + direction);
  } else if (period === "quarter") {
    nextDate.setMonth(nextDate.getMonth() + direction * 3);
  } else if (period === "semester") {
    nextDate.setMonth(nextDate.getMonth() + direction * 6);
  } else {
    nextDate.setFullYear(nextDate.getFullYear() + direction);
  }

  return nextDate;
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPeriodLabel(range: PeriodRange, period: MovementPeriod) {
  if (period === "day") {
    return formatDate(range.start);
  }

  if (period === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(range.start);
  }

  if (period === "quarter") {
    const quarter = Math.floor(range.start.getMonth() / 3) + 1;
    return `${quarter} trimestre de ${range.start.getFullYear()}`;
  }

  if (period === "semester") {
    const semester = range.start.getMonth() < 6 ? 1 : 2;
    return `${semester} semestre de ${range.start.getFullYear()}`;
  }

  if (period === "year") {
    return String(range.start.getFullYear());
  }

  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function formatPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")}%`;
}

function formatComparison(current: number, previous: number, label: string, formatter: (value: number) => string) {
  const diff = current - previous;
  const signedValue = `${diff > 0 ? "+" : ""}${formatter(diff)}`;

  if (previous === 0) {
    return current > 0 ? `${signedValue} vs ${label}` : `Sem variacao vs ${label}`;
  }

  return `${signedValue} (${formatPercent((diff / previous) * 100)}) vs ${label}`;
}

function getComparisonTone(current: number, previous: number) {
  if (current > previous) {
    return "positive" as const;
  }

  if (current < previous) {
    return "negative" as const;
  }

  return "neutral" as const;
}

function getSingle<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeMovementAppointment(row: RawAppointmentRow): MovementAppointment {
  const client = getSingle(row.clients);
  const procedure = getSingle(row.procedures);
  const category = getSingle(procedure?.procedure_categories ?? null);
  const professional = getSingle(row.professionals);

  return {
    category_name: category?.name ?? null,
    client_id: row.client_id,
    client_name: client?.full_name ?? null,
    end_time: row.end_time,
    id: row.id,
    paid_amount: row.paid_amount ?? null,
    payment_details: row.payment_details ?? null,
    payment_installments: row.payment_installments ?? null,
    payment_method: row.payment_method ?? null,
    price_at_booking: row.price_at_booking,
    procedure_id: row.procedure_id,
    procedure_name: procedure?.name ?? null,
    professional_id: row.professional_id,
    professional_name: professional?.name ?? null,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    status_code: row.status_code,
    status_name: getStatusLabel(row.status_code),
  };
}

function normalizeViewMovementAppointment(row: RawViewAppointmentRow): MovementAppointment {
  return {
    category_name: row.category_name ?? null,
    client_id: row.client_id ?? null,
    client_name: row.client_name ?? null,
    end_time: row.end_time,
    id: row.id,
    paid_amount: row.paid_amount ?? null,
    payment_details: row.payment_details ?? null,
    payment_installments: row.payment_installments ?? null,
    payment_method: row.payment_method ?? null,
    price_at_booking: row.price_at_booking,
    procedure_id: row.procedure_id ?? null,
    procedure_name: row.procedure_name ?? null,
    professional_id: row.professional_id,
    professional_name: row.professional_name ?? null,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    status_code: row.status_code,
    status_name: row.status_name ?? getStatusLabel(row.status_code),
  };
}

function normalizeComboSale(row: RawComboSaleRow): MovementComboSale {
  return {
    client_id: row.client_id,
    client_name: row.client_name ?? null,
    created_at: row.created_at,
    id: row.id,
    name: row.name,
    package_price: row.package_price,
    purchase_payment_details: row.purchase_payment_details ?? null,
    purchase_payment_method: row.purchase_payment_method ?? null,
    start_date: row.start_date,
    status: row.effective_status ?? row.status ?? null,
  };
}

function getStatusLabel(statusCode: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Cancelado",
    completed: "Finalizado",
    confirmed: "Confirmado",
    in_progress: "Em atendimento",
    no_show: "No-show",
    rescheduled: "Remarcado",
    scheduled: "Agendado",
  };

  return statusCode ? labels[statusCode] ?? statusCode : null;
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getAppointmentDateTime(appointment: MovementAppointment) {
  return new Date(`${appointment.scheduled_date}T${appointment.start_time || "00:00"}`);
}

function buildChartData(appointments: MovementAppointment[], range: PeriodRange, period: MovementPeriod): ChartItem[] {
  const buckets = new Map<string, ChartItem>();

  if (period === "day") {
    appointments.forEach((appointment) => {
      const hour = appointment.start_time.slice(0, 2);
      const key = `${hour}h`;
      const current = buckets.get(key) ?? { label: key, total: 0 };
      current.total += getAppointmentProductionAmount(appointment);
      buckets.set(key, current);
    });

    return [...buckets.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  if (period === "week" || period === "month") {
    let current = new Date(range.start);

    while (current <= range.end) {
      const key = formatDateForQuery(current);
      buckets.set(key, {
        label: period === "week" ? new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(current) : String(current.getDate()),
        total: 0,
      });
      current = addDays(current, 1);
    }

    appointments.forEach((appointment) => {
      const currentBucket = buckets.get(appointment.scheduled_date);
      if (currentBucket) {
        currentBucket.total += getAppointmentProductionAmount(appointment);
      }
    });

    return [...buckets.values()];
  }

  let current = new Date(range.start.getFullYear(), range.start.getMonth(), 1);

  while (current <= range.end) {
    const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(current),
      total: 0,
    });
    current.setMonth(current.getMonth() + 1);
  }

  appointments.forEach((appointment) => {
    const key = appointment.scheduled_date.slice(0, 7);
    const currentBucket = buckets.get(key);
    if (currentBucket) {
      currentBucket.total += getAppointmentProductionAmount(appointment);
    }
  });

  return [...buckets.values()];
}

function getUniqueOptions(appointments: MovementAppointment[], key: "professional_name" | "category_name") {
  return [...new Set(appointments.map((appointment) => appointment[key]).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

function matchesPaymentFilter(appointment: MovementAppointment, filter: MovementPaymentFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "nao_informado") {
    return !appointment.payment_method;
  }

  return (appointment.payment_method || "nao_informado") === filter;
}

function isMissingPaymentColumnError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const currentError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = [currentError.message, currentError.details, currentError.hint].filter(Boolean).join(" ").toLowerCase();

  return (
    currentError.code === "42703" ||
    currentError.code === "PGRST204" ||
    ["payment_method", "payment_installments", "payment_details", "paid_amount"].some((columnName) =>
      message.includes(columnName),
    )
  );
}

function queryAppointments(range: PeriodRange, includePaymentColumns: boolean) {
  const paymentColumns = includePaymentColumns
    ? `
              payment_method,
              payment_installments,
              payment_details,
              paid_amount,
`
    : "";

  return supabase
    .from("appointments")
    .select(
      `
              id,
              client_id,
              procedure_id,
              professional_id,
              scheduled_date,
              start_time,
              end_time,
              price_at_booking,
              status_code,
${paymentColumns}
              clients ( full_name ),
              procedures (
                name,
                procedure_categories (
                  name
                )
              ),
              professionals ( name )
            `,
    )
    .gte("scheduled_date", range.startValue)
    .lte("scheduled_date", range.endValue)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });
}

function queryAppointmentsView(range: PeriodRange, includePaymentColumns: boolean) {
  const paymentColumns = includePaymentColumns
    ? `
              payment_method,
              payment_installments,
              payment_details,
              paid_amount,
`
    : "";

  return supabase
    .from("v_appointments_full")
    .select(
      `
              id,
              client_id,
              procedure_id,
              professional_id,
              scheduled_date,
              start_time,
              end_time,
              client_name,
              procedure_name,
              category_name,
              professional_name,
              price_at_booking,
              status_code,
              status_name,
${paymentColumns}
            `,
    )
    .gte("scheduled_date", range.startValue)
    .lte("scheduled_date", range.endValue)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });
}

async function loadMovementAppointments(range: PeriodRange) {
  const appointmentsWithPayment = await queryAppointments(range, true);

  if (!appointmentsWithPayment.error) {
    return ((appointmentsWithPayment.data ?? []) as unknown as RawAppointmentRow[]).map(normalizeMovementAppointment);
  }

  console.error("Erro ao carregar movimentação:", appointmentsWithPayment.error);

  if (isMissingPaymentColumnError(appointmentsWithPayment.error)) {
    console.warn(
      "Colunas de pagamento ausentes em appointments. Rodar: alter table public.appointments add column if not exists payment_method text, add column if not exists payment_installments integer, add column if not exists payment_details jsonb, add column if not exists paid_amount numeric(10,2);",
    );

    const appointmentsWithoutPayment = await queryAppointments(range, false);

    if (!appointmentsWithoutPayment.error) {
      return ((appointmentsWithoutPayment.data ?? []) as unknown as RawAppointmentRow[]).map(normalizeMovementAppointment);
    }

    console.error("Erro ao carregar movimentação:", appointmentsWithoutPayment.error);
  }

  const viewWithPayment = await queryAppointmentsView(range, true);

  if (!viewWithPayment.error) {
    return ((viewWithPayment.data ?? []) as unknown as RawViewAppointmentRow[]).map(normalizeViewMovementAppointment);
  }

  console.error("Erro ao carregar movimentação:", viewWithPayment.error);

  if (isMissingPaymentColumnError(viewWithPayment.error)) {
    console.warn(
      "A view v_appointments_full nao possui colunas de pagamento. A Movimentacao vai carregar dados antigos sem fechamento detalhado.",
    );

    const viewWithoutPayment = await queryAppointmentsView(range, false);

    if (!viewWithoutPayment.error) {
      return ((viewWithoutPayment.data ?? []) as unknown as RawViewAppointmentRow[]).map(normalizeViewMovementAppointment);
    }

    console.error("Erro ao carregar movimentação:", viewWithoutPayment.error);
    throw viewWithoutPayment.error;
  }

  throw viewWithPayment.error;
}

async function loadMovementComboSales(range: PeriodRange) {
  const nextDay = formatDateForQuery(addDays(range.end, 1));
  const { data, error } = await supabase
    .from("v_client_combos_full")
    .select("id, client_id, client_name, name, created_at, start_date, package_price, purchase_payment_method, purchase_payment_details, effective_status, status")
    .gte("created_at", `${range.startValue}T00:00:00`)
    .lt("created_at", `${nextDay}T00:00:00`)
    .neq("effective_status", "cancelled")
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("Nao foi possivel carregar vendas de combos na movimentacao:", error);
    return [];
  }

  return ((data ?? []) as unknown as RawComboSaleRow[]).map(normalizeComboSale);
}

function downloadCsv(appointments: MovementAppointment[]) {
  const headers = ["data", "horario", "cliente", "servico", "profissional", "categoria", "valor", "pagamento", "status"];
  const rows = appointments.map((appointment) => [
    appointment.scheduled_date,
    `${appointment.start_time}-${appointment.end_time}`,
    appointment.client_name ?? "",
    appointment.procedure_name ?? "",
    appointment.professional_name ?? "",
    appointment.category_name ?? "",
    String(getAppointmentProductionAmount(appointment)).replace(".", ","),
    getPaymentLabel(appointment.payment_method),
    appointment.status_name ?? appointment.status_code ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "movimentacao.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function PaymentBreakdown({ items, total }: { items: PaymentBreakdownItem[]; total: number }) {
  return (
    <section className="dashboard-panel cash-closing-panel">
      <div className="dashboard-panel__header">
        <div>
          <h2>Fechamento de caixa</h2>
          <p>Total recebido: {formatCurrency(total)}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="movement-empty-state">
          <strong>Sem pagamentos registrados</strong>
          <span>Sem pagamentos registrados neste periodo.</span>
        </div>
      ) : (
        <div className="payment-breakdown-list">
          {items.map((item) => (
            <div className="payment-breakdown-item" key={item.key}>
              <div>
                <strong>{item.label}</strong>
                <span>
                  {formatCurrency(item.total)} · {item.percent.toFixed(0)}%
                </span>
              </div>
              <span className="payment-bar" style={{ "--payment-value": item.percent / 100 } as CSSProperties} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RevenueChart({ items }: { items: ChartItem[] }) {
  const maxValue = Math.max(...items.map((item) => item.total), 0);

  return (
    <section className="dashboard-panel revenue-chart-panel">
      <h2>Producao por periodo</h2>
      {maxValue === 0 ? (
        <div className="movement-empty-state">
          <strong>Sem dados para exibir grafico</strong>
          <span>Nao ha atendimentos finalizados neste periodo.</span>
        </div>
      ) : (
        <div className="revenue-chart">
          {items.map((item) => (
            <div className="revenue-chart__item" key={item.label}>
              <span className="revenue-chart__bar" style={{ "--chart-value": item.total / maxValue } as CSSProperties}>
                <em>{formatCurrency(item.total)}</em>
              </span>
              <strong>{item.label}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MovementDashboardSkeleton() {
  return (
    <section className="movement-skeleton">
      {Array.from({ length: 4 }).map((_, index) => (
        <span key={index} />
      ))}
    </section>
  );
}

export function Movimentacao({ user }: MovimentacaoProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<MovementPeriod>("day");
  const [appointments, setAppointments] = useState<MovementAppointment[]>([]);
  const [previousAppointments, setPreviousAppointments] = useState<MovementAppointment[]>([]);
  const [comboSales, setComboSales] = useState<MovementComboSale[]>([]);
  const [previousComboSales, setPreviousComboSales] = useState<MovementComboSale[]>([]);
  const [statusFilter, setStatusFilter] = useState<MovementStatusFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<MovementPaymentFilter>("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedDateValue = formatDateForQuery(selectedDate);
  const currentRange = useMemo(() => getPeriodRange(selectedDate, selectedPeriod), [selectedDate, selectedPeriod]);
  const previousRange = useMemo(
    () => getPreviousPeriodRange(currentRange, selectedPeriod),
    [currentRange, selectedPeriod],
  );

  useEffect(() => {
    if (!isAdmin(user)) {
      return;
    }

    let isMounted = true;

    async function loadMovement() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [currentData, previousData, currentComboSales, previousComboSalesData] = await Promise.all([
          loadMovementAppointments(currentRange),
          loadMovementAppointments(previousRange),
          loadMovementComboSales(currentRange),
          loadMovementComboSales(previousRange),
        ]);

        if (!isMounted) {
          return;
        }

        setAppointments(currentData);
        setPreviousAppointments(previousData);
        setComboSales(currentComboSales);
        setPreviousComboSales(previousComboSalesData);
        setIsLoading(false);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        console.error("Erro ao carregar movimentação:", error);
        setAppointments([]);
        setPreviousAppointments([]);
        setComboSales([]);
        setPreviousComboSales([]);
        setErrorMessage(
          "Não foi possível carregar a movimentação. Verifique se a view v_appointments_full possui as colunas de pagamento.",
        );
        setIsLoading(false);
      }
    }

    loadMovement();

    return () => {
      isMounted = false;
    };
  }, [currentRange.endValue, currentRange.startValue, previousRange.endValue, previousRange.startValue, user]);

  const completedAppointments = useMemo(() => getCompletedAppointments(appointments), [appointments]);
  const previousCompletedAppointments = useMemo(() => getCompletedAppointments(previousAppointments), [previousAppointments]);
  const professionalOptions = useMemo(() => getUniqueOptions(appointments, "professional_name"), [appointments]);
  const categoryOptions = useMemo(() => getUniqueOptions(appointments, "category_name"), [appointments]);
  const professionalRanking = useMemo(() => groupByProfessional(completedAppointments), [completedAppointments]);
  const categoryRanking = useMemo(() => groupByCategory(completedAppointments), [completedAppointments]);
  const busiestProfessional = useMemo(() => getTopItem(professionalRanking), [professionalRanking]);
  const busiestCategory = useMemo(() => getTopItem(categoryRanking), [categoryRanking]);
  const totalPeople = new Set(completedAppointments.map((appointment) => appointment.client_id ?? appointment.id)).size;
  const previousTotalPeople = new Set(previousCompletedAppointments.map((appointment) => appointment.client_id ?? appointment.id)).size;
  const totalCompleted = completedAppointments.length;
  const previousTotalCompleted = previousCompletedAppointments.length;
  const totalProduction = completedAppointments.reduce((sum, appointment) => sum + getAppointmentProductionAmount(appointment), 0);
  const previousTotalProduction = previousCompletedAppointments.reduce(
    (sum, appointment) => sum + getAppointmentProductionAmount(appointment),
    0,
  );
  const comboSalesTotal = comboSales.reduce((sum, sale) => sum + getComboSaleCashAmount(sale), 0);
  const previousComboSalesTotal = previousComboSales.reduce((sum, sale) => sum + getComboSaleCashAmount(sale), 0);
  const totalCash =
    completedAppointments.reduce((sum, appointment) => sum + getAppointmentCashAmount(appointment), 0) + comboSalesTotal;
  const previousTotalCash =
    previousCompletedAppointments.reduce((sum, appointment) => sum + getAppointmentCashAmount(appointment), 0) +
    previousComboSalesTotal;
  const comboUsageCount = completedAppointments.filter((appointment) => appointment.payment_method === "combo").length;
  const averageTicket = totalCompleted > 0 ? totalProduction / totalCompleted : 0;
  const previousAverageTicket =
    previousTotalCompleted > 0 ? previousTotalProduction / previousTotalCompleted : 0;
  const paymentBreakdown = useMemo(
    () => buildPaymentBreakdown(completedAppointments, comboSales),
    [comboSales, completedAppointments],
  );
  const chartData = useMemo(
    () => buildChartData(completedAppointments, currentRange, selectedPeriod),
    [completedAppointments, currentRange, selectedPeriod],
  );

  const filteredAppointments = useMemo(() => {
    const searchValue = normalizeSearch(searchTerm);

    return appointments.filter((appointment) => {
      const matchesStatus = statusFilter === "all" || appointment.status_code === statusFilter;
      const matchesPayment = matchesPaymentFilter(appointment, paymentFilter);
      const matchesProfessional = professionalFilter === "all" || appointment.professional_name === professionalFilter;
      const matchesCategory = categoryFilter === "all" || appointment.category_name === categoryFilter;
      const matchesSearch =
        !searchValue ||
        normalizeSearch(
          [
            appointment.client_name,
            appointment.procedure_name,
            appointment.professional_name,
            appointment.category_name,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(searchValue);

      return matchesStatus && matchesPayment && matchesProfessional && matchesCategory && matchesSearch;
    });
  }, [appointments, categoryFilter, paymentFilter, professionalFilter, searchTerm, statusFilter]);

  const relativeDateLabel = getRelativeDateLabel(selectedDate);
  const currentPeriodLabel = formatPeriodLabel(currentRange, selectedPeriod);
  const previousPeriodRangeLabel = formatPeriodLabel(previousRange, selectedPeriod);
  const previousLabel = previousPeriodLabel[selectedPeriod];
  const revenueLabel = selectedPeriod === "day" ? "Caixa recebido no dia" : `Caixa ${periodAdjective[selectedPeriod]}`;

  if (!isAdmin(user)) {
    return <RestrictedAccess />;
  }

  return (
    <main className="movement-page">
      <header className="movement-header">
        <div>
          <h1>Movimentacao</h1>
          <p>Resumo financeiro e operacional por periodo</p>
        </div>

        <div className="movement-date-controls">
          <label className="movement-date-input">
            Periodo
            <select onChange={(event) => setSelectedPeriod(event.target.value as MovementPeriod)} value={selectedPeriod}>
              {periodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="movement-date-input">
            Data de referencia
            <input
              onChange={(event) => setSelectedDate(parseDateInput(event.target.value))}
              type="date"
              value={selectedDateValue}
            />
          </label>

          <button onClick={() => setSelectedDate(new Date())} type="button">
            {selectedPeriod === "day" ? "Hoje" : "Periodo atual"}
          </button>
          <button onClick={() => setSelectedDate((current) => shiftDateByPeriod(current, selectedPeriod, -1))} type="button">
            {selectedPeriod === "day" ? "Ontem" : "Anterior"}
          </button>
          <button onClick={() => setSelectedDate((current) => shiftDateByPeriod(current, selectedPeriod, 1))} type="button">
            {selectedPeriod === "day" ? "Amanha" : "Proximo"}
          </button>
        </div>
      </header>

      <p className="movement-selected-date">
        <span>{currentPeriodLabel}</span>
        {selectedPeriod === "day" && relativeDateLabel ? <strong>{relativeDateLabel}</strong> : null}
        <small>· Comparando com {previousPeriodRangeLabel}</small>
      </p>

      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      {isLoading ? (
        <MovementDashboardSkeleton />
      ) : (
        <>
          <section className="metrics-grid movement-metrics-grid">
            <MetricCard
              detail={formatComparison(totalPeople, previousTotalPeople, previousLabel, (value) => String(value))}
              icon="users"
              label="Pessoas atendidas"
              tone={getComparisonTone(totalPeople, previousTotalPeople)}
              value={String(totalPeople)}
            />
            <MetricCard
              detail={formatComparison(totalCash, previousTotalCash, previousLabel, formatCurrency)}
              icon="revenue"
              label={revenueLabel}
              tone={getComparisonTone(totalCash, previousTotalCash)}
              value={formatCurrency(totalCash)}
            />
            <MetricCard
              detail={formatComparison(averageTicket, previousAverageTicket, previousLabel, formatCurrency)}
              icon="revenue"
              label="Ticket medio"
              tone={getComparisonTone(averageTicket, previousAverageTicket)}
              value={formatCurrency(averageTicket)}
            />
            <MetricCard
              detail={formatComparison(totalCompleted, previousTotalCompleted, previousLabel, (value) => String(value))}
              icon="category"
              label="Atendimentos finalizados"
              tone={getComparisonTone(totalCompleted, previousTotalCompleted)}
              value={String(totalCompleted)}
            />
          </section>

          <section className="movement-highlight-grid">
            <MetricCard
              detail={`${comboUsageCount} atendimento(s) por combo`}
              icon="revenue"
              label="Producao do periodo"
              value={formatCurrency(totalProduction)}
            />
            <MetricCard
              detail={`${comboSales.length} venda(s) de combo`}
              icon="revenue"
              label="Venda de combos"
              value={formatCurrency(comboSalesTotal)}
            />
            <MetricCard
              detail={busiestCategory ? `${busiestCategory.count} atendimento(s)` : undefined}
              icon="category"
              label="Area mais movimentada"
              value={busiestCategory?.name ?? "Sem dados"}
            />
            <MetricCard
              detail={busiestProfessional ? `${busiestProfessional.count} atendimento(s)` : undefined}
              icon="professional"
              label="Profissional destaque"
              value={busiestProfessional?.name ?? "Sem dados"}
            />
          </section>

          <section className="movement-finance-grid">
            <PaymentBreakdown items={paymentBreakdown} total={totalCash} />
            <RevenueChart items={chartData} />
          </section>

          <section className="dashboard-grid">
            <RankingList items={professionalRanking} title="Ranking por rendimento - profissionais" />
            <RankingList items={categoryRanking} title="Ranking por rendimento - categorias" />
          </section>

          <section className="movement-filters-panel">
            <label className="client-search movement-search">
              <span>Busca</span>
              <input
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar cliente, servico ou profissional"
                type="search"
                value={searchTerm}
              />
            </label>
            <label className="movement-date-input">
              Status
              <select onChange={(event) => setStatusFilter(event.target.value as MovementStatusFilter)} value={statusFilter}>
                {statusFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="movement-date-input">
              Pagamento
              <select onChange={(event) => setPaymentFilter(event.target.value as MovementPaymentFilter)} value={paymentFilter}>
                {paymentFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="movement-date-input">
              Profissional
              <select onChange={(event) => setProfessionalFilter(event.target.value)} value={professionalFilter}>
                <option value="all">Todos profissionais</option>
                {professionalOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="movement-date-input">
              Categoria
              <select onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
                <option value="all">Todas categorias</option>
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button" onClick={() => downloadCsv(filteredAppointments)} type="button">
              Exportar CSV
            </button>
          </section>

          <MovementTable appointments={filteredAppointments} title="Atendimentos do periodo" />
        </>
      )}
    </main>
  );
}
