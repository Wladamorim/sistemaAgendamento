import { useEffect, useState } from "react";
import { maskPhone } from "../../lib/phone";
import type { ProfessionalFormValues, ProfessionalRecord } from "../../types/professional";

interface ProfessionalFormModalProps {
  isSaving: boolean;
  mode: "create" | "edit";
  professional: ProfessionalRecord | null;
  onClose: () => void;
  onSubmit: (values: ProfessionalFormValues) => void;
}

const emptyValues: ProfessionalFormValues = {
  name: "",
  work_description: "",
  work_type: "",
  phone: "",
  email: "",
};

export function ProfessionalFormModal({
  isSaving,
  mode,
  professional,
  onClose,
  onSubmit,
}: ProfessionalFormModalProps) {
  const [values, setValues] = useState<ProfessionalFormValues>(emptyValues);

  useEffect(() => {
    if (!professional) {
      setValues(emptyValues);
      return;
    }

    setValues({
      name: professional.name,
      work_description: professional.work_description ?? "",
      work_type: professional.work_type ?? "",
      phone: maskPhone(professional.phone ?? ""),
      email: professional.email ?? "",
    });
  }, [professional]);

  function updateValue(field: keyof ProfessionalFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: field === "phone" ? maskPhone(value) : value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="professional-form-title"
        className="appointment-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="professional-form-title">
              {mode === "create" ? "Adicionar profissional" : "Editar profissional"}
            </h2>
            <p>{mode === "create" ? "Cadastre um novo profissional" : "Atualize os dados do profissional"}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          <label className="field-label">
            Nome do profissional
            <input onChange={(event) => updateValue("name", event.target.value)} type="text" value={values.name} />
          </label>

          <label className="field-label">
            O que ele faz
            <input
              onChange={(event) => updateValue("work_description", event.target.value)}
              type="text"
              value={values.work_description}
            />
          </label>

          <label className="field-label">
            Tipo de trabalho
            <input
              onChange={(event) => updateValue("work_type", event.target.value)}
              type="text"
              value={values.work_type}
            />
          </label>

          <div className="modal-form-grid modal-form-grid--two">
            <label className="field-label">
              Número de telefone
              <input onChange={(event) => updateValue("phone", event.target.value)} type="tel" value={values.phone} />
            </label>

            <label className="field-label">
              E-mail
              <input onChange={(event) => updateValue("email", event.target.value)} type="email" value={values.email} />
            </label>
          </div>
        </div>

        <div className="appointment-modal__footer">
          <button className="cancel-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="save-button" disabled={isSaving} onClick={() => onSubmit(values)} type="button">
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
