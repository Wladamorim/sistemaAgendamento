import { useEffect, useMemo, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import {
  AttendantCriticalActionModal,
  type AttendantCriticalAction,
} from "../components/attendants/AttendantCriticalActionModal";
import { AttendantFormModal } from "../components/attendants/AttendantFormModal";
import { AttendantSearch } from "../components/attendants/AttendantSearch";
import { AttendantSidePanel } from "../components/attendants/AttendantSidePanel";
import { AttendantTable } from "../components/attendants/AttendantTable";
import { isAdmin } from "../components/AppShell";
import { RestrictedAccess } from "../components/RestrictedAccess";
import { getAttendantRole } from "../lib/attendants";
import { supabase } from "../lib/supabase";
import type { AttendantFormValues, AttendantRecord, AttendantRole } from "../types/attendant";
import type { AppUser } from "../types/user";

interface AtendentesProps {
  user: AppUser;
}

interface AdminCreateUserResponse {
  ok?: boolean;
  message?: string;
  error?: string;
  user?: AttendantRecord;
}

type AttendantFilter =
  | "all"
  | "admins"
  | "attendants"
  | "active"
  | "inactive"
  | "without_phone"
  | "without_access";

const filterOptions: { label: string; value: AttendantFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Administradores", value: "admins" },
  { label: "Atendentes", value: "attendants" },
  { label: "Ativos", value: "active" },
  { label: "Inativos", value: "inactive" },
  { label: "Sem telefone", value: "without_phone" },
  { label: "Sem registro de acesso", value: "without_access" },
];

function getFunctionMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? payload : null;
  }

  if ("message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  if ("error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return null;
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getFilterMatch(attendant: AttendantRecord, filter: AttendantFilter) {
  const role = getAttendantRole(attendant);

  if (filter === "admins") {
    return role?.name === "Administrador";
  }

  if (filter === "attendants") {
    return role?.name === "Atendente";
  }

  if (filter === "active") {
    return attendant.is_active !== false;
  }

  if (filter === "inactive") {
    return attendant.is_active === false;
  }

  if (filter === "without_phone") {
    return !attendant.phone;
  }

  if (filter === "without_access") {
    return !attendant.last_access_at;
  }

  return true;
}

function getSearchMatch(attendant: AttendantRecord, searchTerm: string) {
  const searchValue = normalizeSearch(searchTerm);

  if (!searchValue) {
    return true;
  }

  const role = getAttendantRole(attendant);
  return normalizeSearch([attendant.name, attendant.email, attendant.phone, role?.name].filter(Boolean).join(" ")).includes(
    searchValue,
  );
}

export function Atendentes({ user }: AtendentesProps) {
  const [attendants, setAttendants] = useState<AttendantRecord[]>([]);
  const [roles, setRoles] = useState<AttendantRole[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<AttendantFilter>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedAttendant, setSelectedAttendant] = useState<AttendantRecord | null>(null);
  const [panelAttendant, setPanelAttendant] = useState<AttendantRecord | null>(null);
  const [criticalAction, setCriticalAction] = useState<AttendantCriticalAction | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAdmin(user)) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadAttendants() {
      setIsLoading(true);
      setErrorMessage(null);

      const [usersResult, rolesResult] = await Promise.all([
        supabase
          .from("users")
          .select(
            `
          id,
          auth_user_id,
          name,
          email,
          phone,
          is_active,
          created_at,
          updated_at,
          roles (
            id,
            name
          )
        `,
          )
          .order("name"),
        supabase.from("roles").select("id, name").in("name", ["Administrador", "Atendente"]).order("name"),
      ]);

      if (!isMounted) {
        return;
      }

      if (usersResult.error) {
        console.error("ATTENDANTS ERROR:", usersResult.error);
        setErrorMessage("Erro ao carregar atendentes.");
        setAttendants([]);
      } else {
        setAttendants((usersResult.data ?? []) as unknown as AttendantRecord[]);
      }

      if (rolesResult.error) {
        console.error("ATTENDANT ROLES ERROR:", rolesResult.error);
        setErrorMessage("Erro ao carregar perfis.");
        setRoles([]);
      } else {
        setRoles((rolesResult.data ?? []) as AttendantRole[]);
      }

      setIsLoading(false);
    }

    loadAttendants();

    return () => {
      isMounted = false;
    };
  }, [reloadKey, user]);

  useEffect(() => {
    if (!panelAttendant) {
      return;
    }

    const updatedAttendant = attendants.find((attendant) => attendant.id === panelAttendant.id);

    if (updatedAttendant) {
      setPanelAttendant(updatedAttendant);
    }
  }, [attendants, panelAttendant]);

  const filteredAttendants = useMemo(
    () =>
      attendants.filter(
        (attendant) => getFilterMatch(attendant, activeFilter) && getSearchMatch(attendant, searchTerm),
      ),
    [activeFilter, attendants, searchTerm],
  );

  function showToast(message: string) {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3600);
  }

  async function readFunctionHttpError(error: FunctionsHttpError) {
    const body = await error.context
      .clone()
      .json()
      .catch(async () => {
        const text = await error.context
          .clone()
          .text()
          .catch(() => "");

        return text || null;
      });

    console.error("HTTP ERROR BODY:", body);
    return getFunctionMessage(body);
  }

  function closeModal() {
    setModalMode(null);
    setSelectedAttendant(null);
    setIsSaving(false);
  }

  function getRoleName(roleId: string | undefined) {
    return roles.find((role) => role.id === roleId)?.name ?? "";
  }

  function getActiveAdminCount() {
    return attendants.filter((attendant) => {
      const role = getAttendantRole(attendant);
      return attendant.is_active !== false && role?.name === "Administrador";
    }).length;
  }

  function isLastActiveAdmin(attendant: AttendantRecord) {
    const role = getAttendantRole(attendant);
    return attendant.is_active !== false && role?.name === "Administrador" && getActiveAdminCount() <= 1;
  }

  async function verifyAdminPassword(password: string) {
    if (!user.email) {
      setErrorMessage("Nao foi possivel validar o administrador logado.");
      return false;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) {
      console.error("ADMIN PASSWORD ERROR:", error);
      setErrorMessage("Senha incorreta.");
      return false;
    }

    return true;
  }

  function validateCreate(values: AttendantFormValues) {
    if (!values.name.trim()) {
      setErrorMessage("Nome completo e obrigatorio.");
      return false;
    }

    if (!values.email.trim()) {
      setErrorMessage("E-mail e obrigatorio.");
      return false;
    }

    if (!values.password.trim()) {
      setErrorMessage("Senha inicial e obrigatoria.");
      return false;
    }

    if (!values.role_id) {
      setErrorMessage("Perfil e obrigatorio.");
      return false;
    }

    if (getRoleName(values.role_id) === "Administrador" && !values.admin_password.trim()) {
      setErrorMessage("Informe sua senha de administrador para criar outro administrador.");
      return false;
    }

    return true;
  }

  function validateEdit(values: AttendantFormValues) {
    if (!values.name.trim()) {
      setErrorMessage("Nome completo e obrigatorio.");
      return false;
    }

    return true;
  }

  async function handleCreateAttendant(values: AttendantFormValues) {
    if (!validateCreate(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const name = values.name.trim();
    const email = values.email.trim();
    const phone = values.phone.trim() || null;
    const password = values.password;
    const roleName = getRoleName(values.role_id);

    if (!roleName) {
      setErrorMessage("Perfil e obrigatorio.");
      setIsSaving(false);
      return;
    }

    if (roleName === "Administrador") {
      const passwordIsValid = await verifyAdminPassword(values.admin_password);

      if (!passwordIsValid) {
        setIsSaving(false);
        return;
      }
    }

    console.log("Chamando admin-create-user");
    console.log("Payload:", { name, email, phone, roleName });

    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email,
        name,
        password,
        phone,
        roleName,
      },
    });

    console.log("Function data:", data);
    console.log("Function error:", error);
    const functionData = data as AdminCreateUserResponse | null;

    if (error) {
      console.error("error.name", error.name);
      console.error("error.message", error.message);
      console.error("error.context", error.context);

      const httpErrorMessage = error instanceof FunctionsHttpError ? await readFunctionHttpError(error) : null;

      setErrorMessage(httpErrorMessage ?? error.message ?? "Erro ao cadastrar atendente.");
      setIsSaving(false);
      return;
    }

    if (functionData?.ok === false) {
      setErrorMessage(getFunctionMessage(functionData) ?? "Erro ao cadastrar atendente.");
      setIsSaving(false);
      return;
    }

    if (functionData?.ok !== true) {
      setErrorMessage("Resposta inesperada da funcao admin-create-user.");
      setIsSaving(false);
      return;
    }

    closeModal();
    setReloadKey((current) => current + 1);
    showToast("Atendente cadastrado com sucesso.");
  }

  async function handleUpdateAttendant(values: AttendantFormValues) {
    if (!selectedAttendant || !validateEdit(values)) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from("users")
      .update({
        name: values.name.trim(),
        phone: values.phone.trim() || null,
      })
      .eq("id", selectedAttendant.id);

    if (error) {
      console.error(error);
      setErrorMessage("Erro ao atualizar atendente.");
      setIsSaving(false);
      return;
    }

    closeModal();
    setReloadKey((current) => current + 1);
    showToast("Atendente atualizado com sucesso.");
  }

  async function handleCriticalActionConfirm(payload: { adminPassword: string; roleId?: string }) {
    if (!criticalAction) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    if (criticalAction.type === "permission") {
      const nextRoleName = getRoleName(payload.roleId);

      if (!payload.roleId || !nextRoleName) {
        setErrorMessage("Selecione um perfil.");
        setIsSaving(false);
        return;
      }

      if (nextRoleName !== "Administrador" && isLastActiveAdmin(criticalAction.attendant)) {
        setErrorMessage("Nao e possivel remover o ultimo administrador ativo.");
        setIsSaving(false);
        return;
      }

      const passwordIsValid = await verifyAdminPassword(payload.adminPassword);

      if (!passwordIsValid) {
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({ role_id: payload.roleId })
        .eq("id", criticalAction.attendant.id);

      if (error) {
        console.error(error);
        setErrorMessage("Erro ao alterar permissao.");
        setIsSaving(false);
        return;
      }

      setCriticalAction(null);
      setIsSaving(false);
      setReloadKey((current) => current + 1);
      showToast("Permissao alterada com sucesso.");
      return;
    }

    if (criticalAction.type === "status") {
      if (!criticalAction.nextActive && criticalAction.attendant.id === user.id) {
        setErrorMessage("Voce nao pode desativar seu proprio acesso.");
        setIsSaving(false);
        return;
      }

      if (!criticalAction.nextActive && isLastActiveAdmin(criticalAction.attendant)) {
        setErrorMessage("Nao e possivel desativar o ultimo administrador ativo.");
        setIsSaving(false);
        return;
      }

      const passwordIsValid = await verifyAdminPassword(payload.adminPassword);

      if (!passwordIsValid) {
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({ is_active: criticalAction.nextActive })
        .eq("id", criticalAction.attendant.id);

      if (error) {
        console.error(error);
        setErrorMessage(criticalAction.nextActive ? "Erro ao reativar acesso." : "Erro ao desativar acesso.");
        setIsSaving(false);
        return;
      }

      setCriticalAction(null);
      setIsSaving(false);
      setReloadKey((current) => current + 1);
      showToast(criticalAction.nextActive ? "Acesso reativado com sucesso." : "Acesso desativado com sucesso.");
    }
  }

  function handleEditAttendant(attendant: AttendantRecord) {
    setSelectedAttendant(attendant);
    setModalMode("edit");
  }

  function handleToggleStatus(attendant: AttendantRecord) {
    if (attendant.id === user.id && attendant.is_active !== false) {
      setErrorMessage("Voce nao pode desativar seu proprio acesso.");
      return;
    }

    setCriticalAction({
      attendant,
      nextActive: attendant.is_active === false,
      type: "status",
    });
  }

  if (!isAdmin(user)) {
    return <RestrictedAccess />;
  }

  return (
    <main className="clients-page clients-page--operational attendants-page">
      <header className="clients-header">
        <div>
          <h1>Atendentes</h1>
          <p>Gerencie usuarios, permissoes e acesso ao sistema</p>
        </div>

        <button className="add-button" onClick={() => setModalMode("create")} type="button">
          + Adicionar atendente
        </button>
      </header>

      {toastMessage ? <p className="agenda-toast">{toastMessage}</p> : null}
      {errorMessage ? <p className="agenda-alert">{errorMessage}</p> : null}

      <section className="clients-toolbar--operational">
        <div className="clients-toolbar-top">
          <AttendantSearch searchTerm={searchTerm} onSearchTermChange={setSearchTerm} />
        </div>

        <div className="clients-filter-chips" aria-label="Filtros de atendentes">
          {filterOptions.map((option) => (
            <button
              className={activeFilter === option.value ? "filter-chip filter-chip--active" : "filter-chip"}
              key={option.value}
              onClick={() => setActiveFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {isLoading ? (
        <section className="clients-table-panel clients-loading-panel">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="clients-skeleton-row" key={index}>
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          ))}
        </section>
      ) : attendants.length === 0 ? (
        <section className="clients-table-panel">
          <div className="clients-empty-state">
            <strong>Nenhum atendente cadastrado</strong>
            <span>Adicione usuarios para permitir acesso ao sistema.</span>
            <button className="add-button" onClick={() => setModalMode("create")} type="button">
              Adicionar atendente
            </button>
          </div>
        </section>
      ) : (
        <AttendantTable
          attendants={filteredAttendants}
          currentUserId={user.id}
          onChangePermission={(attendant) => setCriticalAction({ attendant, type: "permission" })}
          onEdit={handleEditAttendant}
          onResetPassword={(attendant) => setCriticalAction({ attendant, type: "reset_password" })}
          onToggleStatus={handleToggleStatus}
          onViewDetails={setPanelAttendant}
        />
      )}

      {panelAttendant ? (
        <AttendantSidePanel
          attendant={panelAttendant}
          currentUserId={user.id}
          onChangePermission={(attendant) => setCriticalAction({ attendant, type: "permission" })}
          onClose={() => setPanelAttendant(null)}
          onEdit={handleEditAttendant}
          onResetPassword={(attendant) => setCriticalAction({ attendant, type: "reset_password" })}
          onToggleStatus={handleToggleStatus}
        />
      ) : null}

      {modalMode ? (
        <AttendantFormModal
          attendant={selectedAttendant}
          isSaving={isSaving}
          mode={modalMode}
          roles={roles}
          onClose={closeModal}
          onSubmit={modalMode === "create" ? handleCreateAttendant : handleUpdateAttendant}
        />
      ) : null}

      {criticalAction ? (
        <AttendantCriticalActionModal
          action={criticalAction}
          isSaving={isSaving}
          roles={roles}
          onClose={() => {
            setCriticalAction(null);
            setIsSaving(false);
          }}
          onConfirm={handleCriticalActionConfirm}
        />
      ) : null}
    </main>
  );
}
