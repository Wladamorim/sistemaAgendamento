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
  "Ver movimentação financeira",
  "Gerenciar atendentes",
  "Bloquear horarios e profissionais",
  "Alterar permissões",
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
    <div className="client-drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        aria-label="Ficha do atendente"
        className="client-side-panel attendant-side-panel"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="client-side-panel__header">
          <div>
            <span className={getRoleBadgeClass(role?.name)}>{roleName}</span>
            <h2>{attendant.name || "Usuario sem nome"}</h2>
            <p>{attendant.email || "E-mail não informado"}</p>
            <div className="attendant-header-badges">
              <span className={isActive ? "status-pill status-pill--active" : "status-pill"}>
                {formatAttendantStatus(attendant.is_active)}
              </span>
            </div>
          </div>
          <button aria-label="Fechar ficha" className="icon-button" onClick={onClose} type="button">
            x
          </button>
        </header>

        <div className="client-side-panel__actions">
          <button className="secondary-button" onClick={() => onEdit(attendant)} type="button">
            Editar
          </button>
          <button className="secondary-button" onClick={() => onChangePermission(attendant)} type="button">
            Alterar permissão
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

        <section className="client-drawer-section">
          <h3>Dados do usuário</h3>
          <dl className="client-detail-grid">
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
              <dt>Atualizado em</dt>
              <dd>{formatAttendantDateTime(attendant.updated_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="client-drawer-section">
          <h3>Permissoes</h3>
          <ul className="attendant-permissions-list">
            {permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        </section>

        <section className="client-drawer-section">
          <h3>Seguranca</h3>
          <div className="client-summary-grid">
            <div>
              <span>Ultimo acesso</span>
              <strong>{formatAttendantDateTime(attendant.last_access_at)}</strong>
            </div>
            <div>
              <span>Status da conta</span>
              <strong>{isActive ? "Acesso liberado" : "Acesso inativo"}</strong>
            </div>
          </div>
          <div className="client-notes-box">
            <span>Ações críticas</span>
            <p>Alterar permissão, desativar acesso e reativar acesso exigem a senha do administrador logado.</p>
          </div>
        </section>

        <section className="client-drawer-section">
          <h3>Ações recentes</h3>
          <div className="client-panel-empty">Nenhuma ação registrada para este usuário.</div>
        </section>
      </aside>
    </div>
  );
}
