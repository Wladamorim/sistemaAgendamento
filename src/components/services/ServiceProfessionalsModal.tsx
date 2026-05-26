import { useEffect, useState } from "react";
import type { ServiceProfessional, ServiceRecord } from "../../types/service";

interface ServiceProfessionalsModalProps {
  isSaving: boolean;
  professionals: ServiceProfessional[];
  relationshipMessage: string | null;
  service: ServiceRecord;
  onClose: () => void;
  onSave: (professionalIds: string[]) => void;
}

export function ServiceProfessionalsModal({
  isSaving,
  professionals,
  relationshipMessage,
  service,
  onClose,
  onSave,
}: ServiceProfessionalsModalProps) {
  const [selectedProfessionalIds, setSelectedProfessionalIds] = useState<string[]>(
    service.professionals.map((professional) => professional.id),
  );

  useEffect(() => {
    setSelectedProfessionalIds(service.professionals.map((professional) => professional.id));
  }, [service]);

  function toggleProfessional(professionalId: string) {
    setSelectedProfessionalIds((current) =>
      current.includes(professionalId)
        ? current.filter((id) => id !== professionalId)
        : [...current, professionalId],
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="appointment-modal appointment-modal--wide" onMouseDown={(event) => event.stopPropagation()}>
        <div className="appointment-modal__header">
          <div>
            <h2>Vincular profissionais</h2>
            <p>{service.name}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        {relationshipMessage ? <p className="inline-error">{relationshipMessage}</p> : null}

        <div className="appointment-modal__body">
          {professionals.length === 0 ? (
            <div className="client-panel-empty">Nenhum profissional ativo cadastrado.</div>
          ) : (
            <div className="professional-service-manager">
              {professionals.map((professional) => (
                <label className="professional-service-option" key={professional.id}>
                  <input
                    checked={selectedProfessionalIds.includes(professional.id)}
                    disabled={Boolean(relationshipMessage)}
                    onChange={() => toggleProfessional(professional.id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{professional.name}</strong>
                    <small>
                      {professional.work_type || "Sem tipo"} · {professional.phone || "Sem telefone"} ·{" "}
                      {professional.is_active === false ? "Inativo" : "Ativo"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className="save-button"
            disabled={isSaving || Boolean(relationshipMessage)}
            onClick={() => onSave(selectedProfessionalIds)}
            type="button"
          >
            {isSaving ? "Salvando..." : "Salvar vinculos"}
          </button>
        </div>
      </section>
    </div>
  );
}
