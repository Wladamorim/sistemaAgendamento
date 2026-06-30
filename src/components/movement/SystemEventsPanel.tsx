import { Download, Eye, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatMetadataDate,
  formatMetadataTime,
  formatSystemEventDateTime,
  getSystemEventLabel,
  getSystemEventTone,
  type SystemEventRecord,
  type SystemEventRow,
} from "../../lib/systemEvents";
import { supabase } from "../../lib/supabase";
import { AppDatePicker } from "../ui/AppDatePicker";

interface SystemEventsPanelProps {
  initialEndDate: string;
  initialStartDate: string;
}

interface FilterOption {
  id: string;
  label: string;
  secondary?: string | null;
}

interface AffectedAppointment {
  appointment_id?: string;
  client_name?: string;
  phone?: string;
  procedure_name?: string;
  start_time?: string;
  end_time?: string;
}

interface RawAppointmentRow {
  id: string;
  client_id: string | null;
  professional_id: string | null;
  procedure_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status_code: string | null;
  cancellation_reason?: string | null;
  clients: { full_name: string | null; phone: string | null } | { full_name: string | null; phone: string | null }[] | null;
  professionals: { name: string | null } | { name: string | null }[] | null;
  procedures: { name: string | null } | { name: string | null }[] | null;
}

interface OperationalAppointment {
  id: string;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  professional_id: string | null;
  professional_name: string | null;
  procedure_id: string | null;
  procedure_name: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status_code: string | null;
  status_label: string;
  cancellation_reason: string | null;
}

interface RawScheduleBlockRow {
  id: string;
  professional_id: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by?: string | null;
  created_at?: string | null;
}

interface ScheduleBlockRecord {
  id: string;
  professional_id: string | null;
  professional_name: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
  created_by: string | null;
  created_at: string | null;
}

interface SupabaseErrorInfo {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
}

type MovementEventTypeFilter =
  | "all"
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "blocked"
  | "registered";

interface MovementListRecord {
  id: string;
  source: "appointment" | "schedule_block" | "system_event";
  sourceLabel: string;
  sortValue: string;
  dateTimeLabel: string;
  typeLabel: string;
  tone: string;
  clientName: string;
  procedureName: string;
  professionalName: string;
  responsibleName: string;
  reason: string;
  details: string;
  systemEvent?: SystemEventRecord;
}

const eventTypeOptions: { label: string; value: MovementEventTypeFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Agendados", value: "scheduled" },
  { label: "Confirmados", value: "confirmed" },
  { label: "Finalizados", value: "completed" },
  { label: "Cancelados", value: "cancelled" },
  { label: "Horários bloqueados", value: "blocked" },
  { label: "Eventos registrados", value: "registered" },
];

const appointmentStatusByFilter: Partial<Record<MovementEventTypeFilter, string>> = {
  cancelled: "cancelled",
  completed: "completed",
  confirmed: "confirmed",
  scheduled: "scheduled",
};

const systemEventTypeByFilter: Partial<Record<MovementEventTypeFilter, string>> = {
  blocked: "schedule_block_created",
  cancelled: "appointment_cancelled",
  completed: "appointment_completed",
  confirmed: "appointment_confirmed",
  scheduled: "appointment_created",
};

const appointmentStatusEventType: Record<string, string> = {
  cancelled: "appointment_cancelled",
  completed: "appointment_completed",
  confirmed: "appointment_confirmed",
  scheduled: "appointment_created",
};

function getDateBoundary(value: string, endOfDay = false) {
  return `${value}${endOfDay ? "T23:59:59" : "T00:00:00"}`;
}

function formatSupabaseError(error: SupabaseErrorInfo) {
  return [
    error.message,
    error.details,
    error.hint,
    error.code ? `Código: ${error.code}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function escapeCsv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadMovementCsv(records: MovementListRecord[], startDate: string, endDate: string) {
  const rows = records.map((record) => [
    record.dateTimeLabel,
    record.sourceLabel,
    record.typeLabel,
    record.clientName,
    record.procedureName,
    record.professionalName,
    record.responsibleName,
    record.reason,
    record.details,
  ]);
  const csv = [
    ["Data/hora", "Origem", "Tipo", "Cliente", "Serviço", "Profissional", "Responsável", "Motivo", "Detalhes"],
    ...rows,
  ]
    .map((row) => row.map(escapeCsv).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `movimentacoes-${startDate}-${endDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function getSingle<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeAppointment(row: RawAppointmentRow): OperationalAppointment {
  const client = getSingle(row.clients);
  const professional = getSingle(row.professionals);
  const procedure = getSingle(row.procedures);

  return {
    cancellation_reason: row.cancellation_reason ?? null,
    client_id: row.client_id,
    client_name: client?.full_name ?? null,
    client_phone: client?.phone ?? null,
    end_time: row.end_time,
    id: row.id,
    procedure_id: row.procedure_id,
    procedure_name: procedure?.name ?? null,
    professional_id: row.professional_id,
    professional_name: professional?.name ?? null,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time,
    status_code: row.status_code,
    status_label: getAppointmentStatusLabel(row.status_code),
  };
}

function normalizeScheduleBlock(row: RawScheduleBlockRow, professionalMap: Map<string, FilterOption>): ScheduleBlockRecord {
  return {
    block_date: row.block_date,
    created_at: row.created_at ?? null,
    created_by: row.created_by ?? null,
    end_time: row.end_time,
    id: row.id,
    professional_id: row.professional_id,
    professional_name: row.professional_id ? professionalMap.get(row.professional_id)?.label ?? null : null,
    reason: row.reason,
    start_time: row.start_time,
  };
}

function getAppointmentStatusLabel(statusCode: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Cancelado",
    completed: "Finalizado",
    confirmed: "Confirmado",
    in_progress: "Em atendimento",
    no_show: "No-show",
    rescheduled: "Remarcado",
    scheduled: "Agendado",
  };

  return statusCode ? labels[statusCode] ?? statusCode : "Status não informado";
}

function getAppointmentMovementLabel(statusCode: string | null) {
  const labels: Record<string, string> = {
    cancelled: "Agendamento cancelado",
    completed: "Agendamento finalizado",
    confirmed: "Agendamento confirmado",
    in_progress: "Agendamento em atendimento",
    no_show: "Agendamento no-show",
    rescheduled: "Agendamento remarcado",
    scheduled: "Agendamento agendado",
  };

  return statusCode ? labels[statusCode] ?? "Agendamento" : "Agendamento";
}

function getAppointmentTone(statusCode: string | null) {
  if (statusCode === "cancelled" || statusCode === "no_show") {
    return "danger";
  }

  if (statusCode === "completed" || statusCode === "confirmed") {
    return "success";
  }

  return "primary";
}

function formatDateValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function formatTimeValue(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "--:--";
}

function formatOperationalDateTime(date: string, startTime: string) {
  return `${formatDateValue(date)} ${formatTimeValue(startTime)}`;
}

function getRecordTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getAffectedAppointments(event: SystemEventRecord) {
  const value = event.metadata?.affected_appointments;
  return Array.isArray(value) ? (value as AffectedAppointment[]) : [];
}

function getEventSchedule(event: SystemEventRecord) {
  const date = formatMetadataDate(event.metadata?.appointment_date ?? event.metadata?.block_date);
  const start = formatMetadataTime(event.metadata?.start_time);
  const end = formatMetadataTime(event.metadata?.end_time);

  return {
    date,
    time: start && end ? `${start} às ${end}` : start,
  };
}

function getAppointmentQueryColumns(includeCancellationReason: boolean) {
  return `
    id,
    client_id,
    professional_id,
    procedure_id,
    scheduled_date,
    start_time,
    end_time,
    status_code,
    ${includeCancellationReason ? "cancellation_reason," : ""}
    clients:client_id(full_name, phone),
    professionals:professional_id(name),
    procedures:procedure_id(name)
  `;
}

function isMissingAppointmentOptionalColumn(error: SupabaseErrorInfo | null) {
  if (!error) {
    return false;
  }

  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || message.includes("cancellation_reason");
}

function isMissingScheduleBlocksTable(error: SupabaseErrorInfo | null) {
  if (!error) {
    return false;
  }

  const message = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("schedule_blocks") && (message.includes("does not exist") || message.includes("not find"))
  );
}

async function loadAppointments(startDate: string, endDate: string) {
  const result = await supabase
    .from("appointments")
    .select(getAppointmentQueryColumns(true))
    .gte("scheduled_date", startDate)
    .lte("scheduled_date", endDate)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (!result.error) {
    return {
      data: ((result.data ?? []) as unknown as RawAppointmentRow[]).map(normalizeAppointment),
      error: null,
    };
  }

  if (isMissingAppointmentOptionalColumn(result.error)) {
    console.warn("[MovimentacaoEventos] cancellation_reason não disponível em appointments:", result.error);

    const fallbackResult = await supabase
      .from("appointments")
      .select(getAppointmentQueryColumns(false))
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true });

    return {
      data: ((fallbackResult.data ?? []) as unknown as RawAppointmentRow[]).map(normalizeAppointment),
      error: fallbackResult.error,
    };
  }

  return {
    data: [],
    error: result.error,
  };
}

function EventDetailsModal({
  event,
  onClose,
}: {
  event: SystemEventRecord;
  onClose: () => void;
}) {
  const schedule = getEventSchedule(event);
  const affectedAppointments = getAffectedAppointments(event);

  return (
    <div className="system-event-modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="system-event-details-title"
        aria-modal="true"
        className="system-event-modal"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
        role="dialog"
      >
        <header className="system-event-modal__header">
          <div>
            <span className={`system-event-badge system-event-badge--${getSystemEventTone(event.event_type)}`}>
              {event.event_label}
            </span>
            <h2 id="system-event-details-title">{event.title}</h2>
            <p>{formatSystemEventDateTime(event.created_at)}</p>
          </div>
          <button aria-label="Fechar detalhes" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="system-event-modal__body">
          <dl className="system-event-details-grid">
            <div>
              <dt>Cliente</dt>
              <dd>{event.client_name ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{event.client_phone ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Serviço</dt>
              <dd>{event.procedure_name ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Profissional</dt>
              <dd>{event.professional_name ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Data relacionada</dt>
              <dd>{schedule.date ?? "Não informada"}</dd>
            </div>
            <div>
              <dt>Horário relacionado</dt>
              <dd>{schedule.time ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Responsável</dt>
              <dd>{event.responsible_name ?? "Usuário não identificado"}</dd>
            </div>
            <div>
              <dt>E-mail do responsável</dt>
              <dd>{event.responsible_email ?? "Não informado"}</dd>
            </div>
            <div className="system-event-details-grid__wide">
              <dt>Motivo</dt>
              <dd>{event.reason ?? "Não informado"}</dd>
            </div>
            <div className="system-event-details-grid__wide">
              <dt>Detalhes</dt>
              <dd>{event.description ?? "Sem detalhes adicionais."}</dd>
            </div>
          </dl>

          {affectedAppointments.length > 0 ? (
            <section className="system-event-affected">
              <div>
                <h3>Clientes impactados</h3>
                <span>{affectedAppointments.length} agendamento(s)</span>
              </div>
              <ul>
                {affectedAppointments.map((appointment, index) => (
                  <li key={appointment.appointment_id ?? `${event.id}-${index}`}>
                    <div>
                      <strong>{appointment.client_name ?? "Cliente não informado"}</strong>
                      <span>{appointment.procedure_name ?? "Serviço não informado"}</span>
                    </div>
                    <div>
                      <span>{appointment.phone ?? "Telefone não informado"}</span>
                      <strong>
                        {formatMetadataTime(appointment.start_time) ?? "--:--"} às{" "}
                        {formatMetadataTime(appointment.end_time) ?? "--:--"}
                      </strong>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function SystemEventsPanel({ initialEndDate, initialStartDate }: SystemEventsPanelProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [eventType, setEventType] = useState<MovementEventTypeFilter>("all");
  const [professionalId, setProfessionalId] = useState("all");
  const [clientId, setClientId] = useState("all");
  const [userId, setUserId] = useState("all");
  const [eventRows, setEventRows] = useState<SystemEventRow[]>([]);
  const [appointments, setAppointments] = useState<OperationalAppointment[]>([]);
  const [scheduleBlocks, setScheduleBlocks] = useState<ScheduleBlockRecord[]>([]);
  const [professionals, setProfessionals] = useState<FilterOption[]>([]);
  const [clients, setClients] = useState<FilterOption[]>([]);
  const [procedures, setProcedures] = useState<FilterOption[]>([]);
  const [users, setUsers] = useState<FilterOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SystemEventRecord | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadFilterOptions() {
      const [professionalsResult, clientsResult, proceduresResult, usersResult] = await Promise.all([
        supabase.from("professionals").select("id, name").order("name"),
        supabase.from("clients").select("id, full_name, phone").order("full_name"),
        supabase.from("procedures").select("id, name").order("name"),
        supabase.from("users").select("id, name, email").order("name"),
      ]);

      if (!isMounted) {
        return;
      }

      if (!professionalsResult.error) {
        setProfessionals(
          (professionalsResult.data ?? []).map((item) => ({
            id: item.id,
            label: item.name ?? "Profissional sem nome",
          })),
        );
      }

      if (!clientsResult.error) {
        setClients(
          (clientsResult.data ?? []).map((item) => ({
            id: item.id,
            label: item.full_name ?? "Cliente sem nome",
            secondary: item.phone,
          })),
        );
      }

      if (!proceduresResult.error) {
        setProcedures(
          (proceduresResult.data ?? []).map((item) => ({
            id: item.id,
            label: item.name ?? "Serviço sem nome",
          })),
        );
      }

      if (!usersResult.error) {
        setUsers(
          (usersResult.data ?? []).map((item) => ({
            id: item.id,
            label: item.name ?? item.email ?? "Usuário sem nome",
            secondary: item.email,
          })),
        );
      }
    }

    loadFilterOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMovements() {
      if (!startDate || !endDate || startDate > endDate) {
        setEventRows([]);
        setAppointments([]);
        setScheduleBlocks([]);
        setErrorMessage("A data final precisa ser igual ou posterior à data inicial.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      let systemEventsQuery = supabase
        .from("system_events")
        .select("*")
        .gte("created_at", getDateBoundary(startDate))
        .lte("created_at", getDateBoundary(endDate, true))
        .order("created_at", { ascending: false });

      const systemEventType = systemEventTypeByFilter[eventType];
      if (systemEventType) {
        systemEventsQuery = systemEventsQuery.eq("event_type", systemEventType);
      }

      if (professionalId !== "all") {
        systemEventsQuery = systemEventsQuery.eq("professional_id", professionalId);
      }

      if (clientId !== "all") {
        systemEventsQuery = systemEventsQuery.eq("client_id", clientId);
      }

      if (userId !== "all") {
        systemEventsQuery = systemEventsQuery.eq("user_id", userId);
      }

      let blocksQuery = supabase
        .from("schedule_blocks")
        .select("id, professional_id, block_date, start_time, end_time, reason, created_by, created_at")
        .gte("block_date", startDate)
        .lte("block_date", endDate)
        .order("block_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (professionalId !== "all") {
        blocksQuery = blocksQuery.eq("professional_id", professionalId);
      }

      const [appointmentsResult, systemEventsResult, scheduleBlocksResult] = await Promise.all([
        loadAppointments(startDate, endDate),
        systemEventsQuery,
        blocksQuery,
      ]);

      console.log("[MovimentacaoEventos] startDate:", startDate);
      console.log("[MovimentacaoEventos] endDate:", endDate);
      console.log("[MovimentacaoEventos] appointments:", appointmentsResult.data);
      console.log("[MovimentacaoEventos] appointmentsError:", appointmentsResult.error);
      console.log("[MovimentacaoEventos] systemEvents:", systemEventsResult.data);
      console.log("[MovimentacaoEventos] systemEventsError:", systemEventsResult.error);
      console.log("[MovimentacaoEventos] scheduleBlocks:", scheduleBlocksResult.data);
      console.log("[MovimentacaoEventos] scheduleBlocksError:", scheduleBlocksResult.error);

      if (!isMounted) {
        return;
      }

      const loadErrors: string[] = [];

      if (appointmentsResult.error) {
        loadErrors.push(`Erro em appointments: ${formatSupabaseError(appointmentsResult.error)}`);
      }

      if (systemEventsResult.error) {
        loadErrors.push(`Erro em system_events: ${formatSupabaseError(systemEventsResult.error)}`);
      }

      if (scheduleBlocksResult.error && !isMissingScheduleBlocksTable(scheduleBlocksResult.error)) {
        loadErrors.push(`Erro em schedule_blocks: ${formatSupabaseError(scheduleBlocksResult.error)}`);
      }

      if (scheduleBlocksResult.error && isMissingScheduleBlocksTable(scheduleBlocksResult.error)) {
        console.warn("[MovimentacaoEventos] schedule_blocks não encontrada. Bloqueios serão exibidos como 0.");
      }

      const professionalMap = new Map(professionals.map((item) => [item.id, item]));

      setAppointments(appointmentsResult.error ? [] : appointmentsResult.data);
      setEventRows(systemEventsResult.error ? [] : ((systemEventsResult.data ?? []) as SystemEventRow[]));
      setScheduleBlocks(
        scheduleBlocksResult.error
          ? []
          : ((scheduleBlocksResult.data ?? []) as RawScheduleBlockRow[]).map((row) =>
              normalizeScheduleBlock(row, professionalMap),
            ),
      );
      setErrorMessage(loadErrors.length > 0 ? loadErrors.join(" | ") : null);
      setIsLoading(false);
    }

    loadMovements();

    return () => {
      isMounted = false;
    };
  }, [clientId, endDate, eventType, professionalId, professionals, reloadKey, startDate, userId]);

  const systemEvents = useMemo<SystemEventRecord[]>(() => {
    const clientMap = new Map(clients.map((item) => [item.id, item]));
    const procedureMap = new Map(procedures.map((item) => [item.id, item]));
    const professionalMap = new Map(professionals.map((item) => [item.id, item]));
    const userMap = new Map(users.map((item) => [item.id, item]));

    return eventRows.map((event) => {
      const client = event.client_id ? clientMap.get(event.client_id) : null;
      const procedure = event.procedure_id ? procedureMap.get(event.procedure_id) : null;
      const professional = event.professional_id ? professionalMap.get(event.professional_id) : null;
      const responsible = event.user_id ? userMap.get(event.user_id) : null;

      return {
        ...event,
        client_name: client?.label ?? null,
        client_phone: client?.secondary ?? null,
        event_label: getSystemEventLabel(event.event_type, event.title),
        procedure_name: procedure?.label ?? null,
        professional_name: professional?.label ?? null,
        responsible_email: responsible?.secondary ?? null,
        responsible_name: responsible?.label ?? "Usuário não identificado",
      };
    });
  }, [clients, eventRows, procedures, professionals, users]);

  const systemEventsByAppointment = useMemo(() => {
    const groupedEvents = new Map<string, SystemEventRecord[]>();

    systemEvents.forEach((event) => {
      if (!event.appointment_id) {
        return;
      }

      const currentEvents = groupedEvents.get(event.appointment_id) ?? [];
      currentEvents.push(event);
      groupedEvents.set(event.appointment_id, currentEvents);
    });

    return groupedEvents;
  }, [systemEvents]);

  const userMap = useMemo(() => new Map(users.map((item) => [item.id, item])), [users]);

  const filteredAppointments = useMemo(() => {
    if (eventType === "blocked" || eventType === "registered") {
      return [];
    }

    const statusFilter = appointmentStatusByFilter[eventType];

    return appointments.filter((appointment) => {
      const relatedEvents = systemEventsByAppointment.get(appointment.id) ?? [];
      const matchesStatus = !statusFilter || appointment.status_code === statusFilter;
      const matchesProfessional = professionalId === "all" || appointment.professional_id === professionalId;
      const matchesClient = clientId === "all" || appointment.client_id === clientId;
      const matchesUser = userId === "all" || relatedEvents.some((event) => event.user_id === userId);

      return matchesStatus && matchesProfessional && matchesClient && matchesUser;
    });
  }, [appointments, clientId, eventType, professionalId, systemEventsByAppointment, userId]);

  const filteredScheduleBlocks = useMemo(() => {
    if (eventType !== "all" && eventType !== "blocked") {
      return [];
    }

    return scheduleBlocks.filter((block) => {
      const matchesProfessional = professionalId === "all" || block.professional_id === professionalId;
      const matchesClient = clientId === "all";
      const matchesUser = userId === "all" || block.created_by === userId;

      return matchesProfessional && matchesClient && matchesUser;
    });
  }, [clientId, eventType, professionalId, scheduleBlocks, userId]);

  const movementRecords = useMemo<MovementListRecord[]>(() => {
    const appointmentRecords = filteredAppointments.map((appointment) => {
      const relatedEvents = systemEventsByAppointment.get(appointment.id) ?? [];
      const relatedEventType = appointment.status_code ? appointmentStatusEventType[appointment.status_code] : null;
      const relatedEvent =
        relatedEvents.find((event) => event.event_type === relatedEventType) ??
        relatedEvents.find((event) => Boolean(event.user_id)) ??
        relatedEvents[0];
      const timeRange = `${formatTimeValue(appointment.start_time)} - ${formatTimeValue(appointment.end_time)}`;
      const reason =
        appointment.status_code === "cancelled"
          ? appointment.cancellation_reason ?? relatedEvent?.reason ?? "Motivo não registrado"
          : "—";

      return {
        clientName: appointment.client_name ?? "Cliente não informado",
        dateTimeLabel: formatOperationalDateTime(appointment.scheduled_date, appointment.start_time),
        details: `Data: ${formatDateValue(appointment.scheduled_date)} | Horário: ${timeRange} | Status: ${appointment.status_label}`,
        id: `appointment-${appointment.id}`,
        procedureName: appointment.procedure_name ?? "Serviço não informado",
        professionalName: appointment.professional_name ?? "Profissional não informado",
        reason,
        responsibleName: relatedEvent?.responsible_name ?? "Responsável não registrado",
        sortValue: `${appointment.scheduled_date}T${appointment.start_time || "00:00:00"}`,
        source: "appointment" as const,
        sourceLabel: "Agendamento",
        tone: getAppointmentTone(appointment.status_code),
        typeLabel: getAppointmentMovementLabel(appointment.status_code),
      };
    });

    const blockRecords = filteredScheduleBlocks.map((block) => {
      const responsible = block.created_by ? userMap.get(block.created_by) : null;
      const timeRange = `${formatTimeValue(block.start_time)} - ${formatTimeValue(block.end_time)}`;

      return {
        clientName: "Agenda",
        dateTimeLabel: formatOperationalDateTime(block.block_date, block.start_time),
        details: `Data: ${formatDateValue(block.block_date)} | Horário: ${timeRange}`,
        id: `schedule-block-${block.id}`,
        procedureName: "Bloqueio de horário",
        professionalName: block.professional_name ?? "Todos profissionais",
        reason: block.reason ?? "Motivo não registrado",
        responsibleName: responsible?.label ?? "Responsável não registrado",
        sortValue: `${block.block_date}T${block.start_time || "00:00:00"}`,
        source: "schedule_block" as const,
        sourceLabel: "Bloqueio",
        tone: "warning",
        typeLabel: "Horário bloqueado",
      };
    });

    const eventRecords = systemEvents.map((event) => ({
      clientName: event.client_name ?? "—",
      dateTimeLabel: formatSystemEventDateTime(event.created_at),
      details: event.description ?? "Sem detalhes adicionais.",
      id: `system-event-${event.id}`,
      procedureName: event.procedure_name ?? "—",
      professionalName: event.professional_name ?? "—",
      reason: event.reason ?? "—",
      responsibleName: event.responsible_name ?? "Usuário não identificado",
      sortValue: event.created_at,
      source: "system_event" as const,
      sourceLabel: "Evento registrado",
      systemEvent: event,
      tone: getSystemEventTone(event.event_type),
      typeLabel: event.event_label,
    }));

    return [...eventRecords, ...appointmentRecords, ...blockRecords].sort(
      (first, second) => getRecordTimestamp(second.sortValue) - getRecordTimestamp(first.sortValue),
    );
  }, [filteredAppointments, filteredScheduleBlocks, systemEvents, systemEventsByAppointment, userMap]);

  const summary = useMemo(
    () => ({
      blocked: filteredScheduleBlocks.length,
      cancelled: filteredAppointments.filter((appointment) => appointment.status_code === "cancelled").length,
      completed: filteredAppointments.filter((appointment) => appointment.status_code === "completed").length,
      confirmed: filteredAppointments.filter((appointment) => appointment.status_code === "confirmed").length,
      identified: systemEvents.filter((event) => Boolean(event.user_id)).length,
      scheduled: filteredAppointments.filter((appointment) => appointment.status_code === "scheduled").length,
      totalAppointments: filteredAppointments.length,
    }),
    [filteredAppointments, filteredScheduleBlocks.length, systemEvents],
  );

  return (
    <section className="system-events-section">
      <div className="system-events-filters">
        <AppDatePicker
          className="movement-date-input"
          label="Data inicial"
          maxDate={endDate || undefined}
          onChange={setStartDate}
          value={startDate}
        />
        <AppDatePicker
          className="movement-date-input"
          label="Data final"
          minDate={startDate || undefined}
          onChange={setEndDate}
          value={endDate}
        />
        <label className="movement-date-input">
          Tipo de evento
          <select onChange={(event) => setEventType(event.target.value as MovementEventTypeFilter)} value={eventType}>
            {eventTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="movement-date-input">
          Profissional
          <select onChange={(event) => setProfessionalId(event.target.value)} value={professionalId}>
            <option value="all">Todos</option>
            {professionals.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="movement-date-input">
          Cliente
          <select onChange={(event) => setClientId(event.target.value)} value={clientId}>
            <option value="all">Todos</option>
            {clients.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="movement-date-input">
          Usuário responsável
          <select onChange={(event) => setUserId(event.target.value)} value={userId}>
            <option value="all">Todos</option>
            {users.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="system-events-filter-actions">
          <button
            aria-label="Atualizar movimentações"
            className="icon-button"
            onClick={() => setReloadKey((current) => current + 1)}
            title="Atualizar movimentações"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} />
          </button>
          <button
            className="secondary-button"
            disabled={movementRecords.length === 0}
            onClick={() => downloadMovementCsv(movementRecords, startDate, endDate)}
            type="button"
          >
            <Download aria-hidden="true" size={17} />
            Exportar CSV
          </button>
        </div>
      </div>

      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      <div className="system-events-summary">
        <article>
          <span>Total de agendamentos</span>
          <strong>{summary.totalAppointments}</strong>
        </article>
        <article>
          <span>Agendados</span>
          <strong>{summary.scheduled}</strong>
        </article>
        <article className="system-events-summary--success">
          <span>Confirmados</span>
          <strong>{summary.confirmed}</strong>
        </article>
        <article className="system-events-summary--success">
          <span>Finalizados</span>
          <strong>{summary.completed}</strong>
        </article>
        <article className="system-events-summary--danger">
          <span>Cancelados</span>
          <strong>{summary.cancelled}</strong>
        </article>
        <article className="system-events-summary--warning">
          <span>Horários bloqueados</span>
          <strong>{summary.blocked}</strong>
        </article>
        <article>
          <span>Ações com responsável</span>
          <strong>{summary.identified}</strong>
        </article>
      </div>

      <section className="dashboard-panel system-events-table-panel">
        <div className="dashboard-panel__header">
          <div>
            <h2>Movimentações do período</h2>
            <p>Eventos registrados, agendamentos e bloqueios entre as datas selecionadas.</p>
          </div>
          <span>{movementRecords.length} registro(s)</span>
        </div>

        {isLoading ? (
          <div className="system-events-loading" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : movementRecords.length === 0 ? (
          <div className="movement-empty-state">
            <strong>{errorMessage ? "Não foi possível carregar todas as movimentações" : "Nenhuma movimentação encontrada"}</strong>
            <span>
              {errorMessage
                ? "Confira o erro acima e tente atualizar a tela."
                : "Nenhuma movimentação encontrada para o período selecionado."}
            </span>
          </div>
        ) : (
          <div className="system-events-table-wrap">
            <table className="system-events-table">
              <thead>
                <tr>
                  <th>Data/hora</th>
                  <th>Origem</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Serviço</th>
                  <th>Profissional</th>
                  <th>Responsável</th>
                  <th>Motivo</th>
                  <th aria-label="Detalhes" />
                </tr>
              </thead>
              <tbody>
                {movementRecords.map((record) => (
                  <tr key={record.id}>
                    <td data-label="Data/hora">{record.dateTimeLabel}</td>
                    <td data-label="Origem">{record.sourceLabel}</td>
                    <td data-label="Tipo">
                      <span className={`system-event-badge system-event-badge--${record.tone}`}>
                        {record.typeLabel}
                      </span>
                    </td>
                    <td data-label="Cliente">{record.clientName}</td>
                    <td data-label="Serviço">{record.procedureName}</td>
                    <td data-label="Profissional">{record.professionalName}</td>
                    <td data-label="Responsável">{record.responsibleName}</td>
                    <td data-label="Motivo">{record.reason}</td>
                    <td data-label="Detalhes">
                      {record.systemEvent ? (
                        <button
                          aria-label={`Ver detalhes de ${record.typeLabel}`}
                          className="icon-button"
                          onClick={() => setSelectedEvent(record.systemEvent ?? null)}
                          title="Ver detalhes"
                          type="button"
                        >
                          <Eye aria-hidden="true" size={18} />
                        </button>
                      ) : (
                        <span className="system-events-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedEvent ? <EventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
    </section>
  );
}
