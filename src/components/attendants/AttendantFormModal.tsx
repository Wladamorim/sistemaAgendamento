import { useEffect, useMemo, useState } from "react";
import { getAttendantRole } from "../../lib/attendants";
import { maskPhone } from "../../lib/phone";
import type { AttendantFormValues, AttendantRecord, AttendantRole } from "../../types/attendant";

interface AttendantFormModalProps {
  attendant: AttendantRecord | null;
  isSaving: boolean;
  mode: "create" | "edit";
  roles: AttendantRole[];
  onClose: () => void;
  onSubmit: (values: AttendantFormValues) => void;
}

const emptyValues: AttendantFormValues = {
  admin_password: "",
  email: "",
  is_active: true,
  name: "",
  password: "",
  phone: "",
  role_id: "",
};

export function AttendantFormModal({
  attendant,
  isSaving,
  mode,
  roles,
  onClose,
  onSubmit,
}: AttendantFormModalProps) {
  const [values, setValues] = useState<AttendantFormValues>(emptyValues);
  const isEditing = mode === "edit";
  const roleOptions = useMemo(
    () => roles.filter((role) => role.name === "Administrador" || role.name === "Atendente"),
    [roles],
  );
  const selectedRole = roleOptions.find((role) => role.id === values.role_id);

  useEffect(() => {
    if (!attendant) {
      setValues({
        ...emptyValues,
        role_id: roleOptions.find((role) => role.name === "Atendente")?.id ?? "",
      });
      return;
    }

    const role = getAttendantRole(attendant);

    setValues({
      admin_password: "",
      email: attendant.email ?? "",
      is_active: attendant.is_active !== false,
      name: attendant.name ?? "",
      password: "",
      phone: maskPhone(attendant.phone ?? ""),
      role_id: role?.id ?? "",
    });
  }, [attendant, roleOptions]);

  function updateValue(field: keyof AttendantFormValues, value: string | boolean) {
    setValues((current) => ({
      ...current,
      [field]: field === "phone" && typeof value === "string" ? maskPhone(value) : value,
    }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="attendant-form-title"
        className="appointment-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="appointment-modal__header">
          <div>
            <h2 id="attendant-form-title">{mode === "create" ? "Adicionar atendente" : "Editar dados"}</h2>
            <p>{mode === "create" ? "Crie um novo acesso ao sistema" : "Atualize os dados cadastrais do usuario"}</p>
          </div>
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            x
          </button>
        </div>

        <div className="appointment-modal__body">
          <div className="modal-form-grid modal-form-grid--two">
            <label className="field-label">
              Nome completo
              <input onChange={(event) => updateValue("name", event.target.value)} type="text" value={values.name} />
            </label>

            <label className="field-label">
              E-mail
              <input
                disabled={isEditing}
                onChange={(event) => updateValue("email", event.target.value)}
                type="email"
                value={values.email}
              />
            </label>
          </div>

          <div className="modal-form-grid modal-form-grid--two">
            <label className="field-label">
              Telefone
              <input onChange={(event) => updateValue("phone", event.target.value)} type="tel" value={values.phone} />
            </label>

            <label className="field-label">
              Perfil
              <select
                disabled={isEditing}
                onChange={(event) => updateValue("role_id", event.target.value)}
                value={values.role_id}
              >
                <option value="">Selecione um perfil</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedRole?.name === "Administrador" ? (
            <div className="attendant-security-warning">
              <strong>Perfil Administrador</strong>
              <span>Este usuario tera acesso total ao sistema, incluindo financeiro e controle de usuarios.</span>
            </div>
          ) : null}

          {mode === "create" ? (
            <div className="modal-form-grid modal-form-grid--two">
              <label className="field-label">
                Senha inicial
                <input
                  onChange={(event) => updateValue("password", event.target.value)}
                  type="password"
                  value={values.password}
                />
              </label>

              {selectedRole?.name === "Administrador" ? (
                <label className="field-label">
                  Sua senha de administrador
                  <input
                    onChange={(event) => updateValue("admin_password", event.target.value)}
                    type="password"
                    value={values.admin_password}
                  />
                </label>
              ) : null}
            </div>
          ) : (
            <div className="client-notes-box">
              <span>Alteracoes criticas</span>
              <p>Use as acoes "Alterar permissao" e "Desativar/Reativar acesso" para mudancas protegidas por senha.</p>
            </div>
          )}
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
