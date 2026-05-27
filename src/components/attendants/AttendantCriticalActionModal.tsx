import { useMemo, useState } from "react";
import { getAttendantRole, getRoleDescription } from "../../lib/attendants";
import type { AttendantRecord, AttendantRole } from "../../types/attendant";

export type AttendantCriticalAction =
  | { attendant: AttendantRecord; type: "permission" }
  | { attendant: AttendantRecord; nextActive: boolean; type: "status" }
  | { attendant: AttendantRecord; type: "reset_password" };

interface AttendantCriticalActionModalProps {
  action: AttendantCriticalAction;
  isSaving: boolean;
  roles: AttendantRole[];
  onClose: () => void;
  onConfirm: (payload: { adminPassword: string; roleId?: string }) => void;
}

export function AttendantCriticalActionModal({
  action,
  isSaving,
  roles,
  onClose,
  onConfirm,
}: AttendantCriticalActionModalProps) {
  const roleOptions = useMemo(
    () => roles.filter((role) => role.name === "Administrador" || role.name === "Atendente"),
    [roles],
  );
  const currentRole = getAttendantRole(action.attendant);
  const [roleId, setRoleId] = useState(currentRole?.id ?? "");
  const [adminPassword, setAdminPassword] = useState("");
  const selectedRole = roleOptions.find((role) => role.id === roleId);
  const isPermissionAction = action.type === "permission";
  const isStatusAction = action.type === "status";
  const isResetAction = action.type === "reset_password";

  function getTitle() {
    if (isPermissionAction) {
      return "Alterar permissão";
    }

    if (isStatusAction) {
      return action.nextActive ? "Reativar acesso" : "Desativar acesso";
    }

    return "Redefinir senha";
  }

  function getDescription() {
    if (isPermissionAction) {
      return "Escolha o novo perfil e confirme sua identidade para salvar a alteração.";
    }

    if (isStatusAction) {
      return action.nextActive
        ? "Confirme sua senha para reativar o acesso deste usuário."
        : "Confirme sua senha para desativar o acesso deste usuário.";
    }

    return "A redefinicao segura de senha precisa de uma Edge Function administrativa. O botao fica preparado, sem expor chaves administrativas no frontend.";
  }

  if (isResetAction) {
    return (
      <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
        <section className="confirm-dialog attendant-critical-modal" onMouseDown={(event) => event.stopPropagation()}>
          <h2>{getTitle()}</h2>
          <p>{getDescription()}</p>
          <div className="client-notes-box">
            <span>Funcionalidade em preparação</span>
            <p>
              Para redefinir senha com seguranca, crie uma Edge Function com a chave administrativa nos secrets do Supabase.
              O frontend não deve atualizar auth.users diretamente.
            </p>
          </div>
          <div className="confirm-dialog__actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Entendi
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="confirm-dialog attendant-critical-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>{getTitle()}</h2>
        <p>{getDescription()}</p>

        <div className="attendant-action-summary">
          <strong>{action.attendant.name || action.attendant.email || "Usuario sem nome"}</strong>
          <span>{action.attendant.email || "E-mail não informado"}</span>
        </div>

        {isPermissionAction ? (
          <>
            <label className="field-label">
              Novo perfil
              <select onChange={(event) => setRoleId(event.target.value)} value={roleId}>
                <option value="">Selecione um perfil</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <div className={selectedRole?.name === "Administrador" ? "attendant-security-warning" : "client-notes-box"}>
              <span>{selectedRole?.name ?? "Perfil"}</span>
              <p>{getRoleDescription(selectedRole?.name)}</p>
            </div>
          </>
        ) : (
          <div className={action.nextActive ? "client-notes-box" : "attendant-security-warning"}>
            <span>{action.nextActive ? "Reativação" : "Ação perigosa"}</span>
            <p>
              {action.nextActive
                ? "O usuário voltará a acessar o sistema se as credenciais estiverem válidas."
                : "O usuário não conseguirá acessar o sistema enquanto estiver inativo."}
            </p>
          </div>
        )}

        <label className="field-label">
          Sua senha de administrador
          <input onChange={(event) => setAdminPassword(event.target.value)} type="password" value={adminPassword} />
        </label>

        <div className="confirm-dialog__actions">
          <button className="cancel-button" onClick={onClose} type="button">
            Cancelar
          </button>
          <button
            className={isStatusAction && !action.nextActive ? "danger-button" : "save-button"}
            disabled={isSaving || !adminPassword.trim() || (isPermissionAction && !roleId)}
            onClick={() => onConfirm({ adminPassword, roleId: isPermissionAction ? roleId : undefined })}
            type="button"
          >
            {isSaving ? "Confirmando..." : "Confirmar"}
          </button>
        </div>
      </section>
    </div>
  );
}
