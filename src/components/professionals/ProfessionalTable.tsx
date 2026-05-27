import type {
  ProfessionalOperationalSummary,
  ProfessionalRecord,
  ProfessionalServiceRecord,
} from "../../types/professional";

interface ProfessionalTableProps {
  canManage: boolean;
  linkedServicesByProfessional: Record<string, ProfessionalServiceRecord[]>;
  professionalSummaries: Record<string, ProfessionalOperationalSummary>;
  professionals: ProfessionalRecord[];
  onBlockAgenda: (professional: ProfessionalRecord) => void;
  onDeactivate: (professional: ProfessionalRecord) => void;
  onEdit: (professional: ProfessionalRecord) => void;
  onManageServices: (professional: ProfessionalRecord) => void;
  onViewAgenda: (professional: ProfessionalRecord) => void;
  onViewDetails: (professional: ProfessionalRecord) => void;
}

function getStatusView(professional: ProfessionalRecord, operationalStatus: string, appointmentsToday: number) {
  if (professional.is_active === false) {
    return {
      className: "status-pill",
      label: "Inativo",
      subtext: "",
    };
  }

  if (operationalStatus === "Sem serviços vinculados") {
    return {
      className: "status-pill professional-status-warning",
      label: "Sem serviços",
      subtext: "Configuração pendente",
    };
  }

  if (operationalStatus === "Bloqueado hoje") {
    return {
      className: "status-pill professional-status-muted",
      label: "Bloqueado hoje",
      subtext: "",
    };
  }

  if (operationalStatus === "Com atendimentos hoje") {
    return {
      className: "status-pill status-pill--active",
      label: "Com agenda",
      subtext: `${appointmentsToday} atendimento(s) hoje`,
    };
  }

  return {
    className: "status-pill status-pill--active",
      label: "Disponível hoje",
    subtext: "",
  };
}

function getServiceChips(services: ProfessionalServiceRecord[]) {
  const visibleServices = services.slice(0, 2);
  const remaining = services.length - visibleServices.length;

  return (
    <div className="professional-service-chips">
      {visibleServices.map((service) => (
        <span key={service.id}>{service.name}</span>
      ))}
      {remaining > 0 ? <span>+{remaining}</span> : null}
    </div>
  );
}

export function ProfessionalTable({
  canManage,
  linkedServicesByProfessional,
  professionalSummaries,
  professionals,
  onBlockAgenda,
  onDeactivate,
  onEdit,
  onManageServices,
  onViewAgenda,
  onViewDetails,
}: ProfessionalTableProps) {
  return (
    <section className="clients-table-panel professional-list-panel">
      {professionals.length === 0 ? (
        <div className="clients-empty-state">
          <strong>Nenhum profissional encontrado</strong>
          <span>Tente ajustar a busca ou limpar os filtros.</span>
        </div>
      ) : (
        <div className="professional-list">
          <div className="professional-list__header" aria-hidden="true">
            <span>Profissional</span>
            <span>Especialidade</span>
            <span>Serviços</span>
            <span>Situação</span>
            <span>Ações</span>
          </div>

          {professionals.map((professional) => {
            const linkedServices = linkedServicesByProfessional[professional.id] ?? [];
            const summary = professionalSummaries[professional.id];
            const operationalStatus =
              professional.is_active === false ? "Inativo" : summary?.operationalStatus ?? "Disponível hoje";
            const statusView = getStatusView(professional, operationalStatus, summary?.appointmentsToday ?? 0);

            return (
              <article className="professional-list-row" key={professional.id}>
                <button
                  className="professional-name-button"
                  onClick={() => onViewDetails(professional)}
                  type="button"
                >
                  <strong>{professional.name}</strong>
                  <span>{professional.phone || "Sem telefone"}</span>
                  {professional.email ? <span>{professional.email}</span> : null}
                </button>

                <div className="professional-list-row__specialty">
                  <strong>{professional.work_type || "Sem especialidade"}</strong>
                  <span>{professional.work_description || "Descrição não informada"}</span>
                </div>

                <div className="professional-list-row__services">
                  <strong>{linkedServices.length} serviço(s)</strong>
                  {linkedServices.length > 0 ? (
                    getServiceChips(linkedServices)
                  ) : (
                    <span className="professional-config-alert">Sem serviços vinculados</span>
                  )}
                </div>

                <div className="professional-list-row__status">
                  <span className={statusView.className}>{statusView.label}</span>
                  {statusView.subtext ? <span className="client-table-secondary">{statusView.subtext}</span> : null}
                </div>

                <div className="client-row-actions professional-list-row__actions">
                  <button className="table-action-button" onClick={() => onViewDetails(professional)} type="button">
                    Ver ficha
                  </button>
                  <details className="client-actions-menu">
                    <summary>Ações</summary>
                    <div className="client-actions-menu__content">
                      <button onClick={() => onViewAgenda(professional)} type="button">
                        Ver agenda
                      </button>
                      {canManage ? (
                        <>
                          <button onClick={() => onEdit(professional)} type="button">
                            Editar
                          </button>
                          <button onClick={() => onBlockAgenda(professional)} type="button">
                            Bloquear agenda
                          </button>
                          <button onClick={() => onManageServices(professional)} type="button">
                            Gerenciar serviços
                          </button>
                          <button className="client-actions-menu__danger" onClick={() => onDeactivate(professional)} type="button">
                            Desativar
                          </button>
                        </>
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
