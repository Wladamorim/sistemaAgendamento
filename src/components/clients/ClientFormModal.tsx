import { useEffect, useState } from "react";
import { isAdmin } from "../AppShell";
import { maskPhone } from "../../lib/phone";
import type { ClientFormValues, ClientRecord } from "../../types/client";
import type { AppUser } from "../../types/user";
import { AppDatePicker } from "../ui/AppDatePicker";

interface ClientFormModalProps {
  client: ClientRecord | null;
  isSaving: boolean;
  mode: "create" | "edit";
  user: AppUser;
  onClose: () => void;
  onSubmit: (values: ClientFormValues) => void;
}

const emptyValues: ClientFormValues = {
  full_name: "",
  phone: "",
  birth_date: "",
  notes: "",
  is_active: true,
};

export function ClientFormModal({ client, isSaving, mode, user, onClose, onSubmit }: ClientFormModalProps) {
  const [values, setValues] = useState<ClientFormValues>(emptyValues);
  const userIsAdmin = isAdmin(user);
  const isEditing = mode === "edit";

  useEffect(() => {
    if (!client) {
      setValues(emptyValues);
      return;
    }

    setValues({
      full_name: client.full_name,
      phone: maskPhone(client.phone),
      birth_date: client.birth_date ?? "",
      notes: client.notes ?? "",
      is_active: Boolean(client.is_active),
    });
  }, [client]);

  function updateValue(field: keyof ClientFormValues, value: string | boolean) {
    setValues((current) => ({
      ...current,
      [field]: field === "phone" && typeof value === "string" ? maskPhone(value) : value,
    }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="client-form-title"
        className="appointment-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="client-form-title">{mode === "create" ? "Adicionar cliente" : "Editar cliente"}</h2>
            <p>{mode === "create" ? "Cadastre um novo cliente" : "Atualize os dados permitidos"}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="appointment-modal__body">
          {isEditing && !userIsAdmin ? (
            <section className="client-readonly-box">
              <div>
                <span>Nome completo</span>
                <strong>{values.full_name}</strong>
              </div>
              <div>
                <span>Data de nascimento</span>
                <strong>{values.birth_date || "Não informado"}</strong>
              </div>
            </section>
          ) : (
            <div className="modal-form-grid">
              <label className="field-label">
                Nome completo
                <input
                  onChange={(event) => updateValue("full_name", event.target.value)}
                  type="text"
                  value={values.full_name}
                />
              </label>

              <label className="field-label">
                Número de telefone
                <input
                  onChange={(event) => updateValue("phone", event.target.value)}
                  type="tel"
                  value={values.phone}
                />
              </label>

              <AppDatePicker
                allowClear
                className="field-label"
                label="Data de nascimento"
                maxDate={new Date().toISOString().slice(0, 10)}
                onChange={(value) => updateValue("birth_date", value)}
                value={values.birth_date}
              />
            </div>
          )}

          {isEditing && !userIsAdmin ? (
            <label className="field-label">
              Número de telefone
              <input onChange={(event) => updateValue("phone", event.target.value)} type="tel" value={values.phone} />
            </label>
          ) : null}

          <label className="field-label">
            Observações adicionais
            <textarea onChange={(event) => updateValue("notes", event.target.value)} value={values.notes} />
          </label>

          {isEditing && userIsAdmin ? (
            <label className="checkbox-field">
              <input
                checked={values.is_active}
                onChange={(event) => updateValue("is_active", event.target.checked)}
                type="checkbox"
              />
              Cliente ativo
            </label>
          ) : null}
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
