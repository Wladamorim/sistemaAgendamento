import { formatCurrency } from "../../lib/agenda";
import { getServiceCategory } from "../../lib/services";
import type { ServiceRecord } from "../../types/service";

interface ServiceDetailsModalProps {
  canManage: boolean;
  relationshipMessage: string | null;
  service: ServiceRecord;
  onClose: () => void;
  onEdit: (service: ServiceRecord) => void;
}

function formatDuration(duration: number | null) {
  return duration ? `${duration} minutos` : "Não informado";
}

function formatReturn(service: ServiceRecord) {
  if (!service.requires_return) {
    return "Não";
  }

  return service.return_after_days ? `Sim, após ${service.return_after_days} dias` : "Sim";
}

export function ServiceDetailsModal({
  canManage,
  relationshipMessage,
  service,
  onClose,
  onEdit,
}: ServiceDetailsModalProps) {
  const category = getServiceCategory(service);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="service-details-title"
        className="appointment-modal appointment-modal--wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="service-details-title">Detalhes do serviço</h2>
            <p>{service.name}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          <section className="details-list">
            <div>
              <span>Nome do serviço</span>
              <strong>{service.name}</strong>
            </div>
            <div>
              <span>Categoria/tipo</span>
              <strong>{category?.name ?? "Sem categoria"}</strong>
            </div>
            <div>
              <span>Descrição</span>
              <strong>{service.description || "Não informado"}</strong>
            </div>
            <div>
              <span>Valor</span>
              <strong>{formatCurrency(service.price)}</strong>
            </div>
            <div>
              <span>Duração média</span>
              <strong>{formatDuration(service.duration_minutes)}</strong>
            </div>
            <div>
              <span>Exige retorno</span>
              <strong>{formatReturn(service)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{service.is_active ? "Ativo" : "Inativo"}</strong>
            </div>
          </section>

          <section className="modal-section">
            <h3>Profissionais vinculados</h3>
            {relationshipMessage ? <p className="inline-error">{relationshipMessage}</p> : null}
            {service.professionals.length === 0 ? (
              <p className="muted-text">Nenhum profissional vinculado.</p>
            ) : (
              <div className="linked-professionals">
                {service.professionals.map((professional) => (
                  <article className="linked-professional-card" key={professional.id}>
                    <strong>{professional.name}</strong>
                    <span>{professional.work_description || "Sem descrição"}</span>
                    <small>
                      {professional.work_type || "Sem tipo"}
                      {professional.phone ? ` · ${professional.phone}` : ""}
                      {professional.email ? ` · ${professional.email}` : ""}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" onClick={onClose} type="button">
            Fechar
          </button>
          {canManage ? (
            <button className="save-button" onClick={() => onEdit(service)} type="button">
              Editar
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
