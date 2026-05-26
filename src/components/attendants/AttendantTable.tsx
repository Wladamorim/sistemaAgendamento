import { formatAttendantDateTime, formatAttendantStatus, getAttendantRole } from "../../lib/attendants";
import type { AttendantRecord } from "../../types/attendant";

interface AttendantTableProps {
  attendants: AttendantRecord[];
  currentUserId: string;
  onChangePermission: (attendant: AttendantRecord) => void;
  onEdit: (attendant: AttendantRecord) => void;
  onResetPassword: (attendant: AttendantRecord) => void;
  onToggleStatus: (attendant: AttendantRecord) => void;
  onViewDetails: (attendant: AttendantRecord) => void;
}

function getRoleBadgeClass(roleName: string | null | undefined) {
  return roleName === "Administrador" ? "role-badge role-badge--admin" : "role-badge";
}

export function AttendantTable({
  attendants,
  currentUserId,
  onChangePermission,
  onEdit,
  onResetPassword,
  onToggleStatus,
  onViewDetails,
}: AttendantTableProps) {
  return (
    <section className="clients-table-panel attendant-list-panel">
      {attendants.length === 0 ? (
        <div className="clients-empty-state">
          <strong>Nenhum usuario encontrado</strong>
          <span>Tente ajustar a busca ou limpar os filtros.</span>
        </div>
      ) : (
        <div className="attendant-list">
          <div className="attendant-list__header" aria-hidden="true">
            <span>Usuario</span>
            <span>Perfil</span>
            <span>Status</span>
            <span>Acesso</span>
            <span>Acoes</span>
          </div>

          {attendants.map((attendant) => {
            const role = getAttendantRole(attendant);
            const roleName = role?.name ?? "Sem perfil";
            const isActive = attendant.is_active !== false;
            const isCurrentUser = attendant.id === currentUserId;

            return (
              <article className="attendant-list-row" key={attendant.id}>
                <button className="attendant-name-button" onClick={() => onViewDetails(attendant)} type="button">
                  <strong>{attendant.name || "Nao informado"}</strong>
                  <span>{attendant.email || "E-mail nao informado"}</span>
                  <span>{attendant.phone || "Sem telefone"}</span>
                </button>

                <div className="attendant-list-row__role">
                  <span className={getRoleBadgeClass(role?.name)}>{roleName}</span>
                </div>

                <div className="attendant-list-row__status">
                  <span className={isActive ? "status-pill status-pill--active" : "status-pill"}>
                    {formatAttendantStatus(attendant.is_active)}
                  </span>
                </div>

                <div className="attendant-list-row__access">
                  <strong>{formatAttendantDateTime(attendant.last_access_at)}</strong>
                  <span>Ultimo acesso</span>
                </div>

                <div className="client-row-actions attendant-list-row__actions">
                  <button className="table-action-button" onClick={() => onViewDetails(attendant)} type="button">
                    Ver ficha
                  </button>
                  <details className="client-actions-menu">
                    <summary>Acoes</summary>
                    <div className="client-actions-menu__content">
                      <button onClick={() => onEdit(attendant)} type="button">
                        Editar dados
                      </button>
                      <button onClick={() => onChangePermission(attendant)} type="button">
                        Alterar permissao
                      </button>
                      <button onClick={() => onResetPassword(attendant)} type="button">
                        Redefinir senha
                      </button>
                      <button
                        className={isActive ? "client-actions-menu__danger" : undefined}
                        disabled={isCurrentUser && isActive}
                        onClick={() => onToggleStatus(attendant)}
                        title={isCurrentUser && isActive ? "Voce nao pode desativar seu proprio acesso." : undefined}
                        type="button"
                      >
                        {isActive ? "Desativar acesso" : "Reativar acesso"}
                      </button>
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
