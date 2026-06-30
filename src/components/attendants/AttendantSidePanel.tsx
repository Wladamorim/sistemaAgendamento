import { formatAttendantDateTime, formatAttendantStatus, getAttendantRole } from "../../lib/attendants";
import type { AttendantRecord } from "../../types/attendant";

interface AttendantSidePanelProps {
  attendant: AttendantRecord;
  currentUserId: string;
  onChangePermission: (attendant: AttendantRecord) => void;
  onClose: () => void;
  onEdit: (attendant: AttendantRecord) => void;
  onResetPassword: (attendant: AttendantRecord) => void;
  onToggleStatus: (attendant: AttendantRecord) => void;
}

const adminPermissions = [
  "Gerenciar agenda",
  "Gerenciar clientes",
  "Gerenciar profissionais",
  "Gerenciar serviços",
  "Gerenciar combos",
  "Gerenciar atendentes",
  "Visualizar movimentação",
  "Bloquear horários",
];

const attendantPermissions = [
  "Visualizar agenda",
  "Criar agendamentos",
  "Cadastrar clientes",
  "Editar dados permitidos de clientes",
  "Visualizar profissionais",
  "Visualizar serviços",
];

function getPermissions(roleName: string | null | undefined) {
  return roleName === "Administrador" ? adminPermissions : attendantPermissions;
}

function getRoleBadgeClass(roleName: string | null | undefined) {
  return roleName === "Administrador" ? "role-badge role-badge--admin" : "role-badge";
}

function PermissionItem({ permission }: { permission: string }) {
  return (
    <li>
      <span>{permission}</span>
      <span aria-hidden="true" className="attendant-permission-toggle" />
    </li>
  );
}

export function AttendantSidePanel({
  attendant,
  currentUserId,
  onChangePermission,
  onClose,
  onEdit,
  onResetPassword,
  onToggleStatus,
}: AttendantSidePanelProps) {
  const role = getAttendantRole(attendant);
  const roleName = role?.name ?? "Sem perfil";
  const isActive = attendant.is_active !== false;
  const isCurrentUser = attendant.id === currentUserId;
  const permissions = getPermissions(role?.name);

  return (
    <div
      className="client-drawer-backdrop client-profile-modal-overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        aria-label="Ficha do atendente"
        aria-modal="true"
        className="client-side-panel client-profile-modal attendant-side-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div className="attendant-side-panel__identity">
            <div className="attendant-header-badges">
              <span className={getRoleBadgeClass(role?.name)}>{roleName}</span>
              <span className={isActive ? "status-pill status-pill--active" : "status-pill"}>
                {formatAttendantStatus(attendant.is_active)}
              </span>
            </div>
            <h2>{attendant.name || "Usuário sem nome"}</h2>
            <p>{attendant.email || "E-mail não informado"}</p>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="client-side-panel__actions attendant-side-panel__actions detail-action-group">
          <button className="primary-button" onClick={() => onEdit(attendant)} type="button">
            Editar
          </button>
          <button className="secondary-button" onClick={() => onChangePermission(attendant)} type="button">
            Permissões
          </button>
          <button className="secondary-button" onClick={() => onResetPassword(attendant)} type="button">
            Redefinir senha
          </button>
          <button
            className={isActive ? "danger-button" : "secondary-button"}
            disabled={isCurrentUser && isActive}
            onClick={() => onToggleStatus(attendant)}
            type="button"
          >
            {isActive ? "Desativar acesso" : "Reativar acesso"}
          </button>
        </div>

        <div className="client-profile-modal__body attendant-side-panel__body">
          <section className="client-drawer-section">
            <h3>Dados do usuário</h3>
            <dl className="client-detail-grid attendant-info-grid">
              <div>
                <dt>Nome</dt>
                <dd>{attendant.name || "Não informado"}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{attendant.email || "Não informado"}</dd>
              </div>
              <div>
                <dt>Telefone</dt>
                <dd>{attendant.phone || "Sem telefone"}</dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>{roleName}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{formatAttendantStatus(attendant.is_active)}</dd>
              </div>
              <div>
                <dt>Criado em</dt>
                <dd>{formatAttendantDateTime(attendant.created_at)}</dd>
              </div>
              <div>
                <dt>Último acesso</dt>
                <dd>{formatAttendantDateTime(attendant.last_access_at)}</dd>
              </div>
              <div>
                <dt>Atualizado em</dt>
                <dd>{formatAttendantDateTime(attendant.updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="client-drawer-section">
            <div className="attendant-section-heading">
              <h3>Permissões</h3>
              <span>{permissions.length} permissões</span>
            </div>
            <ul className="attendant-permissions-list">
              {permissions.map((permission) => (
                <PermissionItem key={permission} permission={permission} />
              ))}
            </ul>
          </section>

          <section className="client-drawer-section">
            <h3>Segurança</h3>
            <div className="client-notes-box attendant-security-note">
              <span>Ações críticas</span>
              <p>Alterar permissões, desativar acesso e reativar acesso exigem a senha do administrador logado.</p>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
