import { useEffect, useState } from "react";
import { NEW_CATEGORY_ID } from "../../lib/services";
import type { ServiceCategory, ServiceFormValues, ServiceProfessional, ServiceRecord } from "../../types/service";
import { CategorySelect } from "./CategorySelect";
import { ProfessionalMultiSelect } from "./ProfessionalMultiSelect";

interface ServiceFormModalProps {
  categories: ServiceCategory[];
  isSaving: boolean;
  mode: "create" | "edit";
  professionals: ServiceProfessional[];
  relationshipMessage: string | null;
  service: ServiceRecord | null;
  onClose: () => void;
  onSubmit: (values: ServiceFormValues) => void;
}

const emptyValues: ServiceFormValues = {
  name: "",
  category_id: "",
  description: "",
  price: "",
  duration_minutes: "",
  requires_return: false,
  return_after_days: "",
  is_active: true,
  professional_ids: [],
  new_category_name: "",
  new_category_description: "",
};

export function ServiceFormModal({
  categories,
  isSaving,
  mode,
  professionals,
  relationshipMessage,
  service,
  onClose,
  onSubmit,
}: ServiceFormModalProps) {
  const [values, setValues] = useState<ServiceFormValues>(emptyValues);

  useEffect(() => {
    if (!service) {
      setValues(emptyValues);
      return;
    }

    setValues({
      name: service.name,
      category_id: service.category_id ?? "",
      description: service.description ?? "",
      price: service.price === null ? "" : String(service.price),
      duration_minutes: service.duration_minutes === null ? "" : String(service.duration_minutes),
      requires_return: Boolean(service.requires_return),
      return_after_days: service.return_after_days === null ? "" : String(service.return_after_days),
      is_active: Boolean(service.is_active),
      professional_ids: service.professionals.map((professional) => professional.id),
      new_category_name: "",
      new_category_description: "",
    });
  }, [service]);

  function updateValue(field: keyof ServiceFormValues, value: string | boolean | string[]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="service-form-title"
        className="appointment-modal appointment-modal--wide"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="service-form-title">{mode === "create" ? "Adicionar serviço" : "Editar serviço"}</h2>
            <p>{mode === "create" ? "Cadastre um novo serviço" : "Atualize as especificações do serviço"}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          <section className="modal-section">
            <h3>Especificações</h3>

            <label className="field-label">
              Nome do serviço
              <input onChange={(event) => updateValue("name", event.target.value)} type="text" value={values.name} />
            </label>

            <label className="field-label">
              Descrição
              <textarea
                onChange={(event) => updateValue("description", event.target.value)}
                value={values.description}
              />
            </label>

            <div className="modal-form-grid modal-form-grid--two">
              <label className="field-label">
                Valor
                <input
                  min="0"
                  onChange={(event) => updateValue("price", event.target.value)}
                  step="0.01"
                  type="number"
                  value={values.price}
                />
              </label>

              <label className="field-label">
                Duração média em minutos
                <input
                  min="1"
                  onChange={(event) => updateValue("duration_minutes", event.target.value)}
                  type="number"
                  value={values.duration_minutes}
                />
              </label>
            </div>

            <div className="modal-form-grid modal-form-grid--two">
              <label className="checkbox-field">
                <input
                  checked={values.requires_return}
                  onChange={(event) => updateValue("requires_return", event.target.checked)}
                  type="checkbox"
                />
                Exige retorno?
              </label>

              <label className="field-label">
                Retorno sugerido em dias
                <input
                  disabled={!values.requires_return}
                  min="1"
                  onChange={(event) => updateValue("return_after_days", event.target.value)}
                  type="number"
                  value={values.return_after_days}
                />
              </label>
            </div>

            {mode === "edit" ? (
              <label className="checkbox-field">
                <input
                  checked={values.is_active}
                  onChange={(event) => updateValue("is_active", event.target.checked)}
                  type="checkbox"
                />
                Serviço ativo
              </label>
            ) : null}
          </section>

          <CategorySelect
            categories={categories}
            newCategoryDescription={values.new_category_description}
            newCategoryName={values.new_category_name}
            selectedCategoryId={values.category_id}
            onNewCategoryDescriptionChange={(value) => updateValue("new_category_description", value)}
            onNewCategoryNameChange={(value) => updateValue("new_category_name", value)}
            onSelectedCategoryChange={(value) => {
              updateValue("category_id", value);
              if (value !== NEW_CATEGORY_ID) {
                updateValue("new_category_name", "");
                updateValue("new_category_description", "");
              }
            }}
          />

          <ProfessionalMultiSelect
            professionals={professionals}
            relationshipMessage={relationshipMessage}
            selectedProfessionalIds={values.professional_ids}
            onChange={(professionalIds) => updateValue("professional_ids", professionalIds)}
          />
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
