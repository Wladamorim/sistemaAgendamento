import type { Professional } from "../../types/agenda";

interface ProfessionalColumnProps {
  professional: Professional;
}

export function ProfessionalColumn({ professional }: ProfessionalColumnProps) {
  const description = professional.work_description ?? professional.work_type ?? "Atendimento";

  return (
    <div className="professional-heading">
      <strong>{professional.name}</strong>
      <span>{description}</span>
    </div>
  );
}
