import { useEffect, useState } from "react";
import { formatCurrency } from "../../lib/agenda";
import type { ProfessionalRecord, ProfessionalServiceRecord } from "../../types/professional";
import { getProfessionalServiceCategory } from "./professionalHelpers";

interface ProfessionalServicesModalProps {
  allServices: ProfessionalServiceRecord[];
  isSaving: boolean;
  linkedServiceIds: string[];
  professional: ProfessionalRecord;
  onClose: () => void;
  onSave: (serviceIds: string[]) => void;
}

export function ProfessionalServicesModal({
  allServices,
  isSaving,
  linkedServiceIds,
  professional,
  onClose,
  onSave,
}: ProfessionalServicesModalProps) {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>(linkedServiceIds);

  useEffect(() => {
    setSelectedServiceIds(linkedServiceIds);
  }, [linkedServiceIds]);

  function toggleService(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId],
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="appointment-modal appointment-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
        <div className="appointment-modal__header">
          <div>
            <h2>Gerenciar servicos</h2>
            <p>{professional.name}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          {allServices.length === 0 ? (
            <div className="client-panel-empty">Nenhum servico ativo cadastrado.</div>
          ) : (
            <div className="professional-service-manager">
              {allServices.map((service) => {
                const category = getProfessionalServiceCategory(service);

                return (
                  <label className="professional-service-option" key={service.id}>
                    <input
                      checked={selectedServiceIds.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                      type="checkbox"
                    />
                    <span>
                      <strong>{service.name}</strong>
                      <small>
                        {category?.name ?? "Sem categoria"} ·{" "}
                        {service.duration_minutes ? `${service.duration_minutes} min` : "Duracao nao informada"} ·{" "}
                        {formatCurrency(service.price)}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="save-button" disabled={isSaving} onClick={() => onSave(selectedServiceIds)} type="button">
            {isSaving ? "Salvando..." : "Salvar vinculos"}
          </button>
        </div>
      </section>
    </div>
  );
}
