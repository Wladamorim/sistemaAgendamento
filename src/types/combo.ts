import type { ClientRecord } from "./client";
import type { ServiceCategory, ServiceRecord } from "./service";

export type ComboLinkedType = "procedure" | "category";
export type ComboStatus = "active" | "completed" | "expired" | "cancelled";
export type ComboPaymentMethod =
  | "dinheiro"
  | "pix"
  | "cartao_debito"
  | "cartao_credito"
  | "transferencia"
  | "cortesia"
  | "multiplas"
  | "outro"
  | "combo"
  | "nao_informado";

export interface ComboTemplate {
  id: string;
  name: string;
  description: string | null;
  linked_type: ComboLinkedType;
  procedure_id: string | null;
  category_id: string | null;
  total_sessions: number;
  validity_days: number;
  package_price: number | string;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  procedures?: Pick<ServiceRecord, "id" | "name" | "price" | "duration_minutes" | "category_id"> | null;
  procedure_categories?: Pick<ServiceCategory, "id" | "name"> | null;
}

export interface ClientCombo {
  id: string;
  client_id: string;
  combo_template_id: string;
  name: string;
  linked_type: ComboLinkedType;
  procedure_id: string | null;
  category_id: string | null;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  start_date: string;
  expiration_date: string;
  package_price: number | string;
  purchase_payment_method: string;
  purchase_payment_installments: number | null;
  purchase_payment_details: unknown | null;
  status: ComboStatus;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  clients?: Pick<ClientRecord, "id" | "full_name" | "phone"> | null;
  combo_templates?: Pick<ComboTemplate, "id" | "name"> | null;
  procedures?: Pick<ServiceRecord, "id" | "name" | "price" | "duration_minutes" | "category_id"> | null;
  procedure_categories?: Pick<ServiceCategory, "id" | "name"> | null;
}

export interface ClientComboFull {
  id: string;
  client_id: string;
  client_name: string | null;
  client_phone: string | null;
  combo_template_id: string;
  name: string;
  linked_type: ComboLinkedType;
  procedure_id: string | null;
  procedure_name: string | null;
  category_id: string | null;
  category_name: string | null;
  total_sessions: number;
  used_sessions: number;
  remaining_sessions: number;
  start_date: string;
  expiration_date: string;
  package_price: number | string;
  purchase_payment_method: string;
  purchase_payment_installments: number | null;
  purchase_payment_details: unknown | null;
  effective_status: ComboStatus;
  status: ComboStatus;
  notes: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ComboUsage {
  id: string;
  client_combo_id: string;
  appointment_id: string;
  client_id: string;
  procedure_id: string;
  professional_id: string | null;
  sessions_used: number;
  production_value: number | string | null;
  used_at: string | null;
  used_by: string | null;
  notes: string | null;
  procedures?: { name: string | null } | null;
  professionals?: { name: string | null } | null;
}

export interface ComboUsageFull {
  id: string;
  client_combo_id: string;
  combo_name: string | null;
  appointment_id: string;
  client_id: string;
  client_name: string | null;
  procedure_id: string;
  procedure_name: string | null;
  category_id: string | null;
  category_name: string | null;
  professional_id: string | null;
  professional_name: string | null;
  sessions_used: number;
  production_value: number | string | null;
  used_at: string | null;
  used_by: string | null;
  used_by_name: string | null;
  notes: string | null;
}

export interface ComboTemplateFormValues {
  name: string;
  description: string;
  linked_type: ComboLinkedType;
  procedure_id: string;
  category_id: string;
  total_sessions: string;
  validity_days: string;
  package_price: string;
  notes: string;
  is_active: boolean;
}

export interface ClientComboFormValues {
  client_id: string;
  combo_template_id: string;
  start_date: string;
  purchase_payment_method: string;
  payment_installments: string;
  notes: string;
}

export interface ClientComboEditFormValues {
  expiration_date: string;
  notes: string;
  total_sessions: string;
}
