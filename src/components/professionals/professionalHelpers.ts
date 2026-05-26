import type { ProfessionalServiceCategory, ProfessionalServiceRecord } from "../../types/professional";

export function getProfessionalServiceCategory(service: ProfessionalServiceRecord) {
  const category = service.procedure_categories;
  return Array.isArray(category) ? category[0] ?? null : (category as ProfessionalServiceCategory | null);
}

export function formatDateValue(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

export function formatDateTimeValue(value: string | null) {
  if (!value) {
    return "Nao informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
