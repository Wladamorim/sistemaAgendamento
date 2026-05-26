import { formatCurrency, formatTime } from "../../lib/agenda";
import type { ClientAppointmentRecord, ClientOperationalSummary, ClientRecord } from "../../types/client";

interface ClientSidePanelProps {
  canDelete: boolean;
  client: ClientRecord;
  summary: ClientOperationalSummary;
  onClose: () => void;
  onDeactivate: (client: ClientRecord) => void;
  onEdit: (client: ClientRecord) => void;
  onNewAppointment: (client: ClientRecord) => void;
}

function formatDateValue(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

function formatDateTimeValue(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(appointment: ClientAppointmentRecord) {
  return appointment.status_name ?? appointment.status_code ?? "Sem status";
}

function getAverageTicket(summary: ClientOperationalSummary) {
  if (summary.totalCompleted === 0) {
    return 0;
  }

  return summary.totalSpent / summary.totalCompleted;
}

function AppointmentHistoryItem({ appointment }: { appointment: ClientAppointmentRecord }) {
  return (
    <li className="client-history-item">
      <div>
        <strong>{appointment.procedure_name ?? "Servico nao informado"}</strong>
        <span>{appointment.professional_name ?? "Profissional nao informado"}</span>
      </div>
      <div>
        <span>
          {formatDateValue(appointment.scheduled_date)} · {formatTime(appointment.start_time)} -{" "}
          {formatTime(appointment.end_time)}
        </span>
        <span>
          {formatCurrency(appointment.price_at_booking)} · {getStatusLabel(appointment)}
        </span>
      </div>
    </li>
  );
}

export function ClientSidePanel({
  canDelete,
  client,
  summary,
  onClose,
  onDeactivate,
  onEdit,
  onNewAppointment,
}: ClientSidePanelProps) {
  const isInactive = client.is_active === false;

  return (
    <div className="client-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        aria-label="Ficha do cliente"
        className="client-side-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div>
            <span className={isInactive ? "status-pill client-status-pill" : "status-pill status-pill--active client-status-pill"}>
              {isInactive ? "Inativo" : "Ativo"}
            </span>
            <h2>{client.full_name}</h2>
            <p>{client.phone || "Sem telefone"}</p>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="client-side-panel__actions">
          <button className="primary-button" onClick={() => onNewAppointment(client)} type="button">
            Novo agendamento
          </button>
          <button className="secondary-button" onClick={() => onEdit(client)} type="button">
            Editar
          </button>
          {canDelete ? (
            <button className="danger-button" onClick={() => onDeactivate(client)} type="button">
              Desativar
            </button>
          ) : null}
        </div>

        <section className="client-drawer-section">
          <h3>Dados do cliente</h3>
          <dl className="client-detail-grid">
            <div>
              <dt>Nome completo</dt>
              <dd>{client.full_name}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{client.phone || "Nao informado"}</dd>
            </div>
            <div>
              <dt>Data de nascimento</dt>
              <dd>{formatDateValue(client.birth_date)}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDateTimeValue(client.created_at)}</dd>
            </div>
          </dl>
          <div className="client-notes-box">
            <span>Observacoes adicionais</span>
            <p>{client.notes || "Sem observacoes cadastradas."}</p>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Resumo</h3>
          <div className="client-summary-grid">
            <div>
              <span>Total de atendimentos</span>
              <strong>{summary.totalCompleted}</strong>
            </div>
            <div>
              <span>Total gasto</span>
              <strong>{formatCurrency(summary.totalSpent)}</strong>
            </div>
            <div>
              <span>Ticket medio</span>
              <strong>{formatCurrency(getAverageTicket(summary))}</strong>
            </div>
            <div>
              <span>Ultimo atendimento</span>
              <strong>
                {summary.lastCompleted
                  ? `${formatDateValue(summary.lastCompleted.scheduled_date)} · ${
                      summary.lastCompleted.procedure_name ?? "Servico nao informado"
                    }`
                  : "Sem atendimentos"}
              </strong>
            </div>
            <div>
              <span>Proximo agendamento</span>
              <strong>
                {summary.nextAppointment
                  ? `${formatDateValue(summary.nextAppointment.scheduled_date)} as ${formatTime(
                      summary.nextAppointment.start_time,
                    )}`
                  : "Sem agendamento futuro"}
              </strong>
            </div>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Historico de agendamentos</h3>
          {summary.history.length === 0 ? (
            <div className="client-panel-empty">Nenhum atendimento registrado para este cliente.</div>
          ) : (
            <ul className="client-history-list">
              {summary.history.slice(0, 8).map((appointment) => (
                <AppointmentHistoryItem appointment={appointment} key={appointment.id} />
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
