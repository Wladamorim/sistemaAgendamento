import type { AttendantRecord, AttendantRole } from "../types/attendant";

export function getAttendantRole(attendant: AttendantRecord) {
  return normalizeRole(attendant.roles);
}

export function normalizeRole(role: AttendantRole | AttendantRole[] | null) {
  return Array.isArray(role) ? role[0] ?? null : role;
}

export function formatAttendantStatus(isActive: boolean | null) {
  return isActive === false ? "Inativo" : "Ativo";
}

export function formatAttendantDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function getRoleDescription(roleName: string | null | undefined) {
  if (roleName === "Administrador") {
    return "Acesso total ao sistema, incluindo financeiro, equipe, servicos e usuarios.";
  }

  if (roleName === "Atendente") {
    return "Acesso operacional para agenda, clientes e visualizacao de dados.";
  }

  return "Perfil sem descricao cadastrada.";
}
