import type { ServiceCategory, ServiceProfessional, ServiceRecord } from "../types/service";

export const NEW_CATEGORY_ID = "__new_category__";

export const RELATIONSHIP_TABLE_MESSAGE =
  "Para vincular profissionais aos serviços, crie a tabela procedure_professional no Supabase.";

export function getServiceCategory(service: ServiceRecord) {
  return normalizeCategory(service.procedure_categories);
}

export function normalizeCategory(category: ServiceCategory | ServiceCategory[] | null) {
  return Array.isArray(category) ? category[0] ?? null : category;
}

export function normalizeProfessional(professional: ServiceProfessional | ServiceProfessional[] | null) {
  return Array.isArray(professional) ? professional[0] ?? null : professional;
}

export function isMissingRelationshipTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const errorText = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();

  return (
    errorText.includes("procedure_professional") ||
    errorText.includes("schema cache") ||
    errorText.includes("could not find") ||
    errorText.includes("does not exist") ||
    error.code === "42P01" ||
    error.code === "PGRST205"
  );
}
