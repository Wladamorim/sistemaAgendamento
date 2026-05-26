import { formatCurrency } from "./agenda";
import type { ClientCombo, ComboLinkedType, ComboPaymentMethod, ComboStatus, ComboTemplate } from "../types/combo";

export const comboPaymentOptions: { label: string; value: Exclude<ComboPaymentMethod, "combo" | "nao_informado"> }[] = [
  { label: "Dinheiro", value: "dinheiro" },
  { label: "Pix", value: "pix" },
  { label: "Cartao de debito", value: "cartao_debito" },
  { label: "Cartao de credito", value: "cartao_credito" },
  { label: "Transferencia", value: "transferencia" },
  { label: "Cortesia", value: "cortesia" },
  { label: "Multiplas formas", value: "multiplas" },
  { label: "Outro", value: "outro" },
];

export const comboPaymentLabels: Record<ComboPaymentMethod | string, string> = {
  cartao_credito: "Cartao de credito",
  cartao_debito: "Cartao de debito",
  combo: "Combo",
  cortesia: "Cortesia",
  dinheiro: "Dinheiro",
  multiplas: "Multiplas formas",
  nao_informado: "Nao informado",
  outro: "Outro",
  pix: "Pix",
  transferencia: "Transferencia",
};

export const comboStatusLabels: Record<ComboStatus, string> = {
  active: "Ativo",
  cancelled: "Cancelado",
  completed: "Finalizado",
  expired: "Expirado",
};

export const comboLinkedTypeLabels: Record<ComboLinkedType, string> = {
  category: "Categoria",
  procedure: "Servico",
};

export function parseMoneyValue(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = String(value).includes(",")
    ? String(value).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
    : String(value).replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDateValue(value: string | null | undefined) {
  if (!value) {
    return "Nao informado";
  }

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(year, month - 1, day));
}

export function addDaysToDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getComboPaymentLabel(method: string | null | undefined) {
  if (!method) {
    return comboPaymentLabels.nao_informado;
  }

  return comboPaymentLabels[method] ?? method;
}

export function getComboStatusLabel(status: string | null | undefined) {
  if (!status) {
    return "Sem status";
  }

  return comboStatusLabels[status as ComboStatus] ?? status;
}

export function getComboLinkedLabel(
  combo: Pick<ComboTemplate | ClientCombo, "linked_type"> & {
    category_name?: string | null;
    procedure_categories?: { name?: string | null } | null;
    procedure_name?: string | null;
    procedures?: { name?: string | null } | null;
  },
) {
  if (combo.linked_type === "procedure") {
    return combo.procedure_name ?? combo.procedures?.name ?? "Servico nao informado";
  }

  return combo.category_name ?? combo.procedure_categories?.name ?? "Categoria nao informada";
}

export function isComboExpired(combo: Pick<ClientCombo, "expiration_date" | "status">) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expirationDate = new Date(`${combo.expiration_date}T00:00:00`);

  return combo.status === "expired" || expirationDate.getTime() < today.getTime();
}

export function isComboUsable(combo: Pick<ClientCombo, "expiration_date" | "remaining_sessions" | "status">) {
  return combo.status === "active" && combo.remaining_sessions > 0 && !isComboExpired(combo);
}

export function getComboBalanceLabel(combo: Pick<ClientCombo, "remaining_sessions" | "total_sessions">) {
  return `Restam ${combo.remaining_sessions} de ${combo.total_sessions} sessoes`;
}

export function getComboPriceLabel(combo: Pick<ClientCombo | ComboTemplate, "package_price">) {
  return formatCurrency(parseMoneyValue(combo.package_price));
}
