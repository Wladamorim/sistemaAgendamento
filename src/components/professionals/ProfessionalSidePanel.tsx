import { formatCurrency, formatTime } from "../../lib/agenda";
import type {
  ProfessionalAppointmentRecord,
  ProfessionalOperationalSummary,
  ProfessionalRecord,
  ProfessionalServiceRecord,
} from "../../types/professional";
import { formatDateTimeValue, formatDateValue, getProfessionalServiceCategory } from "./professionalHelpers";

interface ProfessionalSidePanelProps {
  canManage: boolean;
  linkedServices: ProfessionalServiceRecord[];
  professional: ProfessionalRecord;
  summary: ProfessionalOperationalSummary;
  onBlockAgenda: (professional: ProfessionalRecord) => void;
  onClose: () => void;
  onEdit: (professional: ProfessionalRecord) => void;
  onManageServices: (professional: ProfessionalRecord) => void;
  onViewAgenda: (professional: ProfessionalRecord) => void;
}

function AppointmentItem({ appointment }: { appointment: ProfessionalAppointmentRecord }) {
  return (
    <li className="client-history-item">
      <div>
        <strong>{appointment.client_name ?? "Cliente não informado"}</strong>
        <span>{appointment.procedure_name ?? "Serviço não informado"}</span>
      </div>
      <div>
        <span>
          {formatDateValue(appointment.scheduled_date)} · {formatTime(appointment.start_time)} -{" "}
          {formatTime(appointment.end_time)}
        </span>
        <span>
          {formatCurrency(appointment.price_at_booking)} · {appointment.status_name ?? appointment.status_code ?? "Sem status"}
        </span>
      </div>
    </li>
  );
}

function ServiceItem({ service }: { service: ProfessionalServiceRecord }) {
  const category = getProfessionalServiceCategory(service);

  return (
    <li className="professional-service-item">
      <div>
        <strong>{service.name}</strong>
        <span>{category?.name ?? "Sem categoria"}</span>
      </div>
      <div>
        <span>{service.duration_minutes ? `${service.duration_minutes} min` : "Duração não informada"}</span>
        <span>{formatCurrency(service.price)}</span>
        <span className={service.is_active ? "status-pill status-pill--active" : "status-pill"}>
          {service.is_active ? "Ativo" : "Inativo"}
        </span>
      </div>
    </li>
  );
}

export function ProfessionalSidePanel({
  canManage,
  linkedServices,
  professional,
  summary,
  onBlockAgenda,
  onClose,
  onEdit,
  onManageServices,
  onViewAgenda,
}: ProfessionalSidePanelProps) {
  const isInactive = professional.is_active === false;

  return (
    <div
      className="client-drawer-backdrop client-profile-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        aria-label="Ficha do profissional"
        aria-modal="true"
        className="client-side-panel professional-side-panel client-profile-modal"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div>
            <span className={isInactive ? "status-pill client-status-pill" : "status-pill status-pill--active client-status-pill"}>
              {isInactive ? "Inativo" : "Ativo"}
            </span>
            <h2>{professional.name}</h2>
            <p>{professional.work_type || "Especialidade não informada"}</p>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="client-side-panel__actions professional-side-panel__actions detail-action-group">
          <button className="primary-button" onClick={() => onViewAgenda(professional)} type="button">
            Ver agenda
          </button>
          {canManage ? (
            <>
              <button className="secondary-button" onClick={() => onBlockAgenda(professional)} type="button">
                Bloquear agenda
              </button>
              <button className="secondary-button" onClick={() => onEdit(professional)} type="button">
                Editar
              </button>
              <button className="secondary-button" onClick={() => onManageServices(professional)} type="button">
                Gerenciar serviços
              </button>
            </>
          ) : null}
        </div>

        {linkedServices.length === 0 ? (
          <div className="professional-drawer-warning">
            <strong>Sem serviços vinculados</strong>
            <span>Este profissional não aparecerá corretamente no fluxo de agendamento.</span>
          </div>
        ) : null}

        <section className="client-drawer-section">
          <h3>Dados do profissional</h3>
          <dl className="client-detail-grid">
            <div>
              <dt>Nome</dt>
              <dd>{professional.name}</dd>
            </div>
            <div>
              <dt>Telefone</dt>
              <dd>{professional.phone || "Não informado"}</dd>
            </div>
            <div>
              <dt>E-mail</dt>
              <dd>{professional.email || "Não informado"}</dd>
            </div>
            <div>
              <dt>Tipo de trabalho</dt>
              <dd>{professional.work_type || "Não informado"}</dd>
            </div>
            <div>
              <dt>Status operacional</dt>
              <dd>{summary.operationalStatus}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDateTimeValue(professional.created_at)}</dd>
            </div>
          </dl>
          <div className="client-notes-box">
            <span>O que faz</span>
            <p>{professional.work_description || "Descrição não informada."}</p>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Resumo operacional</h3>
          <div className="client-summary-grid">
            <div>
              <span>Atendimentos hoje</span>
              <strong>{summary.appointmentsToday}</strong>
            </div>
            <div>
              <span>Próximos agendamentos</span>
              <strong>{summary.nextAppointments.length}</strong>
            </div>
            <div>
              <span>Finalizados no mes</span>
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
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Serviços vinculados</h3>
          {linkedServices.length === 0 ? (
            <div className="client-panel-empty">Este profissional ainda não possui serviços vinculados.</div>
          ) : (
            <ul className="professional-service-list">
              {linkedServices.map((service) => (
                <ServiceItem key={service.id} service={service} />
              ))}
            </ul>
          )}
        </section>

        <section className="client-drawer-section">
          <h3>Bloqueios ativos e futuros</h3>
          {summary.futureBlocks.length === 0 ? (
            <div className="client-panel-empty">Nenhum bloqueio futuro registrado.</div>
          ) : (
            <ul className="professional-block-list">
              {summary.futureBlocks.slice(0, 6).map((block) => (
                <li key={block.id}>
                  <strong>{formatDateValue(block.block_date)}</strong>
                  <span>
                    {formatTime(block.start_time)} - {formatTime(block.end_time)}
                  </span>
                  <span>{block.reason || "Sem motivo informado"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="client-drawer-section">
          <h3>Histórico recente</h3>
          {summary.history.length === 0 ? (
            <div className="client-panel-empty">Nenhum atendimento registrado para este profissional.</div>
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
