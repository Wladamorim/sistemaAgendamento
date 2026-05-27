import { formatTime } from "../../lib/agenda";
import type { ClientOperationalSummary, ClientRecord } from "../../types/client";

interface ClientTableProps {
  canDelete: boolean;
  clientSummaries: Record<string, ClientOperationalSummary>;
  clients: ClientRecord[];
  emptyDescription: string;
  emptyTitle: string;
  onDeactivate: (client: ClientRecord) => void;
  onEdit: (client: ClientRecord) => void;
  onNewAppointment: (client: ClientRecord) => void;
  onView: (client: ClientRecord) => void;
}

function formatDateValue(value: string | null) {
  if (!value) {
    return "Não informado";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function formatAppointmentDate(value: string) {
  return formatDateValue(value);
}

function getStatusLabel(client: ClientRecord) {
  return client.is_active === false ? "Inativo" : "Ativo";
}

function getAppointmentSummary(summary: ClientOperationalSummary, type: "last" | "next") {
  const appointment = type === "last" ? summary.lastCompleted : summary.nextAppointment;

  if (!appointment) {
    return {
      detail: "",
      title: type === "last" ? "Sem atendimentos" : "Sem agendamento futuro",
    };
  }

  if (type === "last") {
    return {
      detail: appointment.procedure_name ?? "Serviço não informado",
      title: formatAppointmentDate(appointment.scheduled_date),
    };
  }

  return {
    detail: appointment.procedure_name ?? "Serviço não informado",
    title: `${formatAppointmentDate(appointment.scheduled_date)} às ${formatTime(appointment.start_time)}`,
  };
}

function getRelationshipLabel(summary: ClientOperationalSummary) {
  if (summary.totalCompleted >= 2) {
    return "Cliente recorrente";
  }

  if (summary.totalCompleted === 1) {
    return "Uma visita concluída";
  }

  if (summary.nextAppointment) {
    return "Novo agendamento";
  }

  return "Sem histórico";
}

export function ClientTable({
  canDelete,
  clientSummaries,
  clients,
  emptyDescription,
  emptyTitle,
  onDeactivate,
  onEdit,
  onNewAppointment,
  onView,
}: ClientTableProps) {
  return (
    <section className="clients-table-panel clients-table-panel--operational clients-list-panel">
      {clients.length === 0 ? (
        <div className="clients-empty-state">
          <strong>{emptyTitle}</strong>
          <span>{emptyDescription}</span>
        </div>
      ) : (
        <div className="clients-list">
          <div className="clients-list__header" aria-hidden="true">
            <span>Cliente</span>
            <span>Agenda</span>
            <span>Situação</span>
            <span>Ações</span>
          </div>

          {clients.map((client) => {
            const summary = clientSummaries[client.id] ?? {
              history: [],
              lastCompleted: null,
              nextAppointment: null,
              totalCompleted: 0,
              totalSpent: 0,
            };
            const nextAppointment = getAppointmentSummary(summary, "next");
            const lastVisit = getAppointmentSummary(summary, "last");

            return (
              <article className="client-list-row" key={client.id}>
                <button className="client-name-button client-list-row__client" onClick={() => onView(client)} type="button">
                  <strong>{client.full_name}</strong>
                  <span>{client.phone || "Sem telefone"}</span>
                  {client.notes ? <em>Com observação</em> : null}
                </button>

                <div className="client-list-row__agenda">
                  <div>
                    <span className="client-list-label">Próximo</span>
                    <strong>{nextAppointment.title}</strong>
                    {nextAppointment.detail ? <span>{nextAppointment.detail}</span> : null}
                  </div>
                  <div>
                    <span className="client-list-label">Última visita</span>
                    <strong>{lastVisit.title}</strong>
                    {lastVisit.detail ? <span>{lastVisit.detail}</span> : null}
                  </div>
                </div>

                <div className="client-list-row__status">
                  <span
                    className={
                      client.is_active === false
                        ? "status-pill client-status-pill"
                        : "status-pill status-pill--active client-status-pill"
                    }
                  >
                    {getStatusLabel(client)}
                  </span>
                  <span className="client-table-secondary">{getRelationshipLabel(summary)}</span>
                </div>

                <div className="client-row-actions client-list-row__actions">
                  <button className="table-action-button" onClick={() => onView(client)} type="button">
                    Ver ficha
                  </button>
                  <details className="client-actions-menu">
                    <summary>Ações</summary>
                    <div className="client-actions-menu__content">
                      <button onClick={() => onEdit(client)} type="button">
                        Editar
                      </button>
                      <button onClick={() => onNewAppointment(client)} type="button">
                        Novo agendamento
                      </button>
                      {canDelete ? (
                        <button className="client-actions-menu__danger" onClick={() => onDeactivate(client)} type="button">
                          Desativar
                        </button>
                      ) : null}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
