import { Download, Eye, RefreshCw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  formatMetadataDate,
  formatMetadataTime,
  formatSystemEventDateTime,
  getSystemEventLabel,
  getSystemEventTone,
  systemEventOptions,
  type SystemEventRecord,
  type SystemEventRow,
  type SystemEventType,
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

function getDateBoundary(value: string, endOfDay = false) {
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  return new Date(`${value}${suffix}`).toISOString();
}

function formatSupabaseError(error: {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
  message?: string | null;
}) {
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

function downloadEventsCsv(events: SystemEventRecord[], startDate: string, endDate: string) {
  const rows = events.map((event) => [
    formatSystemEventDateTime(event.created_at),
    event.event_label,
    event.client_name ?? "",
    event.procedure_name ?? "",
    event.professional_name ?? "",
    event.responsible_name ?? "Usuário não identificado",
    event.reason ?? "",
    event.description ?? "",
  ]);
  const csv = [
    ["Data/hora", "Tipo", "Cliente", "Serviço", "Profissional", "Responsável", "Motivo", "Descrição"],
    ...rows,
  ]
    .map((row) => row.map(escapeCsv).join(";"))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `eventos-${startDate}-${endDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [eventType, setEventType] = useState<SystemEventType>("all");
  const [professionalId, setProfessionalId] = useState("all");
  const [clientId, setClientId] = useState("all");
  const [userId, setUserId] = useState("all");
  const [eventRows, setEventRows] = useState<SystemEventRow[]>([]);
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

    async function loadEvents() {
      if (!startDate || !endDate || startDate > endDate) {
        setEventRows([]);
        setErrorMessage("A data final precisa ser igual ou posterior à data inicial.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      const { error: tableCheckError } = await supabase.from("system_events").select("*").limit(1);

      if (!isMounted) {
        return;
      }

      if (tableCheckError) {
        console.error("[SystemEvents] table check error:", tableCheckError);
        setEventRows([]);
        setErrorMessage(`Erro ao verificar public.system_events: ${formatSupabaseError(tableCheckError)}`);
        setIsLoading(false);
        return;
      }

      let query = supabase
        .from("system_events")
        .select("*")
        .gte("created_at", getDateBoundary(startDate))
        .lte("created_at", getDateBoundary(endDate, true))
        .order("created_at", { ascending: false });

      if (eventType !== "all") {
        query = query.eq("event_type", eventType);
      }

      if (professionalId !== "all") {
        query = query.eq("professional_id", professionalId);
      }

      if (clientId !== "all") {
        query = query.eq("client_id", clientId);
      }

      if (userId !== "all") {
        query = query.eq("user_id", userId);
      }

      const { data, error } = await query;

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("[SystemEvents] load error:", error);
        setEventRows([]);
        setErrorMessage(`Não foi possível carregar public.system_events: ${formatSupabaseError(error)}`);
        setIsLoading(false);
        return;
      }

      setEventRows((data ?? []) as SystemEventRow[]);
      setIsLoading(false);
    }

    loadEvents();

    return () => {
      isMounted = false;
    };
  }, [clientId, endDate, eventType, professionalId, reloadKey, startDate, userId]);

  const events = useMemo<SystemEventRecord[]>(() => {
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

  const summary = useMemo(
    () => ({
      blocked: events.filter((event) => event.event_type === "schedule_block_created").length,
      cancelled: events.filter((event) => event.event_type === "appointment_cancelled").length,
      completed: events.filter((event) => event.event_type === "appointment_completed").length,
      identified: events.filter((event) => Boolean(event.user_id)).length,
      total: events.length,
    }),
    [events],
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
          <select onChange={(event) => setEventType(event.target.value as SystemEventType)} value={eventType}>
            {systemEventOptions.map((option) => (
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
            aria-label="Atualizar eventos"
            className="icon-button"
            onClick={() => setReloadKey((current) => current + 1)}
            title="Atualizar eventos"
            type="button"
          >
            <RefreshCw aria-hidden="true" size={18} />
          </button>
          <button
            className="secondary-button"
            disabled={events.length === 0}
            onClick={() => downloadEventsCsv(events, startDate, endDate)}
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
          <span>Total de eventos</span>
          <strong>{summary.total}</strong>
        </article>
        <article className="system-events-summary--danger">
          <span>Agendamentos cancelados</span>
          <strong>{summary.cancelled}</strong>
        </article>
        <article className="system-events-summary--warning">
          <span>Horários bloqueados</span>
          <strong>{summary.blocked}</strong>
        </article>
        <article className="system-events-summary--success">
          <span>Finalizações</span>
          <strong>{summary.completed}</strong>
        </article>
        <article>
          <span>Ações com responsável</span>
          <strong>{summary.identified}</strong>
        </article>
      </div>

      <section className="dashboard-panel system-events-table-panel">
        <div className="dashboard-panel__header">
          <div>
            <h2>Histórico de movimentações</h2>
            <p>Eventos registrados entre as datas selecionadas.</p>
          </div>
          <span>{events.length} registro(s)</span>
        </div>

        {isLoading ? (
          <div className="system-events-loading" aria-live="polite">
            <span />
            <span />
            <span />
          </div>
        ) : events.length === 0 ? (
          <div className="movement-empty-state">
            <strong>Nenhum evento encontrado</strong>
            <span>Ajuste os filtros ou escolha outro período.</span>
          </div>
        ) : (
          <div className="system-events-table-wrap">
            <table className="system-events-table">
              <thead>
                <tr>
                  <th>Data/hora</th>
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
                {events.map((event) => (
                  <tr key={event.id}>
                    <td data-label="Data/hora">{formatSystemEventDateTime(event.created_at)}</td>
                    <td data-label="Tipo">
                      <span className={`system-event-badge system-event-badge--${getSystemEventTone(event.event_type)}`}>
                        {event.event_label}
                      </span>
                    </td>
                    <td data-label="Cliente">{event.client_name ?? "—"}</td>
                    <td data-label="Serviço">{event.procedure_name ?? "—"}</td>
                    <td data-label="Profissional">{event.professional_name ?? "—"}</td>
                    <td data-label="Responsável">{event.responsible_name ?? "Usuário não identificado"}</td>
                    <td data-label="Motivo">{event.reason ?? "—"}</td>
                    <td data-label="Detalhes">
                      <button
                        aria-label={`Ver detalhes de ${event.event_label}`}
                        className="icon-button"
                        onClick={() => setSelectedEvent(event)}
                        title="Ver detalhes"
                        type="button"
                      >
                        <Eye aria-hidden="true" size={18} />
                      </button>
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
