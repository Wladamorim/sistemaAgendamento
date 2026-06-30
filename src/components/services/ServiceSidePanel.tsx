import { formatCurrency, formatTime } from "../../lib/agenda";
import type { ServiceAppointmentRecord, ServiceOperationalSummary, ServiceRecord } from "../../types/service";
import {
  formatServiceDate,
  formatServiceDateTime,
  formatServiceDuration,
  getAppointmentClientName,
  getAppointmentProfessionalName,
  getServiceCategoryName,
} from "./serviceUiHelpers";

interface ServiceSidePanelProps {
  canManage: boolean;
  relationshipMessage: string | null;
  service: ServiceRecord;
  summary: ServiceOperationalSummary;
  onClose: () => void;
  onEdit: (service: ServiceRecord) => void;
  onManageProfessionals: (service: ServiceRecord) => void;
}

function formatReturn(service: ServiceRecord) {
  if (!service.requires_return) {
    return "Não";
  }

  return service.return_after_days ? `Sim, apos ${service.return_after_days} dias` : "Sim";
}

function AppointmentItem({ appointment }: { appointment: ServiceAppointmentRecord }) {
  return (
    <li className="client-history-item">
      <div>
        <strong>{getAppointmentClientName(appointment)}</strong>
        <span>{getAppointmentProfessionalName(appointment)}</span>
      </div>
      <div>
        <span>
          {formatServiceDate(appointment.scheduled_date)} · {formatTime(appointment.start_time)} -{" "}
          {formatTime(appointment.end_time)}
        </span>
        <span>
          {formatCurrency(appointment.price_at_booking)} · {appointment.status_code ?? "Sem status"}
        </span>
      </div>
    </li>
  );
}

export function ServiceSidePanel({
  canManage,
  relationshipMessage,
  service,
  summary,
  onClose,
  onEdit,
  onManageProfessionals,
}: ServiceSidePanelProps) {
  const categoryName = getServiceCategoryName(service);
  const isInactive = service.is_active === false;
  const hasConfigurationIssue = service.is_active !== false && service.professionals.length === 0;

  return (
    <div
      className="client-drawer-backdrop client-profile-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        aria-label="Ficha do serviço"
        aria-modal="true"
        className="client-side-panel service-side-panel client-profile-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div>
            <span className={isInactive ? "status-pill client-status-pill" : "status-pill status-pill--active client-status-pill"}>
              {isInactive ? "Inativo" : "Ativo"}
            </span>
            <h2>{service.name}</h2>
            <p>{categoryName}</p>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        {canManage ? (
          <div className="client-side-panel__actions service-side-panel__actions detail-action-group">
            <button className="primary-button" onClick={() => onEdit(service)} type="button">
              Editar
            </button>
            <button className="secondary-button" onClick={() => onManageProfessionals(service)} type="button">
              Vincular profissionais
            </button>
          </div>
        ) : null}

        {relationshipMessage ? <p className="agenda-alert">{relationshipMessage}</p> : null}
        {hasConfigurationIssue ? (
          <div className="professional-drawer-warning">
            <strong>Configuração incompleta</strong>
            <span>Este serviço está ativo, mas não possui profissional vinculado. Ele não poderá ser agendado corretamente.</span>
            {canManage ? (
              <button className="secondary-button" onClick={() => onManageProfessionals(service)} type="button">
                Vincular profissionais
              </button>
            ) : null}
          </div>
        ) : null}

        <section className="client-drawer-section">
          <h3>Dados do serviço</h3>
          <dl className="client-detail-grid">
            <div>
              <dt>Nome</dt>
              <dd>{service.name}</dd>
            </div>
            <div>
              <dt>Categoria</dt>
              <dd>{categoryName}</dd>
            </div>
            <div>
              <dt>Valor</dt>
              <dd>{formatCurrency(service.price)}</dd>
            </div>
            <div>
              <dt>Duração média</dt>
              <dd>{formatServiceDuration(service.duration_minutes)}</dd>
            </div>
            <div>
              <dt>Exige retorno</dt>
              <dd>{formatReturn(service)}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatServiceDateTime(service.created_at)}</dd>
            </div>
          </dl>
          <div className="client-notes-box">
            <span>Descrição</span>
            <p>{service.description || "Descrição não informada."}</p>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Desempenho do serviço</h3>
          <div className="client-summary-grid">
            <div>
              <span>Concluidos no mes</span>
              <strong>{summary.completedThisMonth}</strong>
            </div>
            <div>
              <span>Rendimento no mes</span>
              <strong>{formatCurrency(summary.monthlyRevenue)}</strong>
            </div>
            <div>
              <span>Ticket médio</span>
              <strong>{formatCurrency(summary.averageTicket)}</strong>
            </div>
            <div>
              <span>Último atendimento</span>
              <strong>
                {summary.lastCompleted
                  ? `${formatServiceDate(summary.lastCompleted.scheduled_date)} · ${getAppointmentClientName(summary.lastCompleted)}`
                  : "Sem dados no período"}
              </strong>
            </div>
            <div>
              <span>Próximo agendamento</span>
              <strong>
                {summary.nextAppointment
                  ? `${formatServiceDate(summary.nextAppointment.scheduled_date)} as ${formatTime(
                      summary.nextAppointment.start_time,
                    )}`
                  : "Sem agendamento futuro"}
              </strong>
            </div>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Profissionais vinculados</h3>
          {service.professionals.length === 0 ? (
            <div className="client-panel-empty">Este serviço ainda não possui profissionais vinculados.</div>
          ) : (
            <ul className="professional-service-list">
              {service.professionals.map((professional) => (
                <li className="professional-service-item" key={professional.id}>
                  <div>
                    <strong>{professional.name}</strong>
                    <span>{professional.work_type || "Sem tipo"}</span>
                  </div>
                  <div>
                    <span>{professional.phone || "Sem telefone"}</span>
                    <span className={professional.is_active === false ? "status-pill" : "status-pill status-pill--active"}>
                      {professional.is_active === false ? "Inativo" : "Ativo"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="client-drawer-section">
          <h3>Histórico recente</h3>
          {summary.history.length === 0 ? (
            <div className="client-panel-empty">Nenhum atendimento registrado para este serviço.</div>
          ) : (
            <ul className="client-history-list">
              {summary.history.slice(0, 8).map((appointment) => (
                <AppointmentItem appointment={appointment} key={appointment.id} />
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
