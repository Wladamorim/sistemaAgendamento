import type { ServiceProfessional } from "../../types/service";

interface ProfessionalMultiSelectProps {
  professionals: ServiceProfessional[];
  relationshipMessage: string | null;
  selectedProfessionalIds: string[];
  onChange: (professionalIds: string[]) => void;
}

export function ProfessionalMultiSelect({
  professionals,
  relationshipMessage,
  selectedProfessionalIds,
  onChange,
}: ProfessionalMultiSelectProps) {
  function toggleProfessional(professionalId: string) {
    if (relationshipMessage) {
      return;
    }

    if (selectedProfessionalIds.includes(professionalId)) {
      onChange(selectedProfessionalIds.filter((id) => id !== professionalId));
      return;
    }

    onChange([...selectedProfessionalIds, professionalId]);
  }

  return (
    <section className="modal-section">
      <h3>Profissionais vinculados</h3>

      {relationshipMessage ? <p className="inline-error">{relationshipMessage}</p> : null}

      {professionals.length === 0 ? (
        <p className="muted-text">Nenhum profissional ativo cadastrado.</p>
      ) : (
        <div className="professional-checkbox-list">
          {professionals.map((professional) => (
            <label className="professional-checkbox" key={professional.id}>
              <input
                checked={selectedProfessionalIds.includes(professional.id)}
                disabled={Boolean(relationshipMessage)}
                onChange={() => toggleProfessional(professional.id)}
                type="checkbox"
              />
              <span>
                <strong>{professional.name}</strong>
                <small>
                  {professional.work_description || "Sem descrição"} · {professional.work_type || "Sem tipo"}
                </small>
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}
