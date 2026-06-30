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
    return "Nunca acessou";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Nunca acessou";
  }

  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);

  const formattedTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);

  return `${formattedDate} às ${formattedTime}`;
}

export function getRoleDescription(roleName: string | null | undefined) {
  if (roleName === "Administrador") {
    return "Acesso total ao sistema, incluindo financeiro, equipe, serviços e usuários.";
  }

  if (roleName === "Atendente") {
    return "Acesso operacional para agenda, clientes e visualizacao de dados.";
  }

  return "Perfil sem descricao cadastrada.";
}
