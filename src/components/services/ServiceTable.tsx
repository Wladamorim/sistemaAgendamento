import { formatCurrency } from "../../lib/agenda";
import type { ServiceOperationalSummary, ServiceRecord } from "../../types/service";
import { formatServiceDuration, getServiceCategoryName } from "./serviceUiHelpers";

interface ServiceTableProps {
  canManage: boolean;
  serviceSummaries: Record<string, ServiceOperationalSummary>;
  services: ServiceRecord[];
  onDelete: (service: ServiceRecord) => void;
  onEdit: (service: ServiceRecord) => void;
  onManageProfessionals: (service: ServiceRecord) => void;
  onViewDetails: (service: ServiceRecord) => void;
}

function getProfessionalChips(service: ServiceRecord) {
  const visibleProfessionals = service.professionals.slice(0, 2);
  const remaining = service.professionals.length - visibleProfessionals.length;

  return (
    <div className="professional-service-chips service-professional-chips">
      {visibleProfessionals.map((professional) => (
        <span key={professional.id}>{professional.name}</span>
      ))}
      {remaining > 0 ? <span>+{remaining}</span> : null}
    </div>
  );
}

function getServiceStatus(service: ServiceRecord) {
  if (service.is_active === false) {
    return {
      className: "status-pill",
      label: "Inativo",
      subtext: "",
    };
  }

  if (service.professionals.length === 0) {
    return {
      className: "status-pill professional-status-warning",
      label: "Sem profissional",
      subtext: "Configuracao pendente",
    };
  }

  return {
    className: "status-pill status-pill--active",
    label: "Ativo",
    subtext: "",
  };
}

export function ServiceTable({
  canManage,
  serviceSummaries,
  services,
  onDelete,
  onEdit,
  onManageProfessionals,
  onViewDetails,
}: ServiceTableProps) {
  return (
    <section className="clients-table-panel service-list-panel">
      {services.length === 0 ? (
        <div className="clients-empty-state">
          <strong>Nenhum servico encontrado</strong>
          <span>Tente ajustar a busca ou limpar os filtros.</span>
        </div>
      ) : (
        <div className="service-list">
          <div className="service-list__header" aria-hidden="true">
            <span>Servico</span>
            <span>Valor/Duracao</span>
            <span>Profissionais</span>
            <span>Situacao</span>
            <span>Acoes</span>
          </div>

          {services.map((service) => {
            const categoryName = getServiceCategoryName(service);
            const status = getServiceStatus(service);
            const summary = serviceSummaries[service.id];

            return (
              <article className="service-list-row" key={service.id}>
                <button className="service-list-row__name" onClick={() => onViewDetails(service)} type="button">
                  <strong>{service.name}</strong>
                  <span>{categoryName}</span>
                  {service.description ? <em>{service.description}</em> : null}
                </button>

                <div className="service-list-row__price">
                  <strong>{formatCurrency(service.price)}</strong>
                  <span>{formatServiceDuration(service.duration_minutes)}</span>
                </div>

                <div className="service-list-row__professionals">
                  <strong>{service.professionals.length} profissional(is)</strong>
                  {service.professionals.length > 0 ? (
                    getProfessionalChips(service)
                  ) : (
                    <span className="professional-config-alert">Sem profissional vinculado</span>
                  )}
                </div>

                <div className="service-list-row__status">
                  <span className={status.className}>{status.label}</span>
                  {status.subtext ? <span className="client-table-secondary">{status.subtext}</span> : null}
                  {summary?.completedThisMonth ? (
                    <span className="client-table-secondary">{summary.completedThisMonth} no mes</span>
                  ) : null}
                </div>

                <div className="client-row-actions service-list-row__actions">
                  <button className="table-action-button" onClick={() => onViewDetails(service)} type="button">
                    Ver detalhes
                  </button>
                  {canManage ? (
                    <details className="client-actions-menu">
                      <summary>Acoes</summary>
                      <div className="client-actions-menu__content">
                        <button onClick={() => onEdit(service)} type="button">
                          Editar
                        </button>
                        <button onClick={() => onManageProfessionals(service)} type="button">
                          Vincular profissionais
                        </button>
                        <button className="client-actions-menu__danger" onClick={() => onDelete(service)} type="button">
                          Desativar
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
