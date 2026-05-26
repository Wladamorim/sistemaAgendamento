export interface ServiceCategory {
  id: string;
  name: string;
  description?: string | null;
  is_active?: boolean | null;
}

export interface ServiceProfessional {
  id: string;
  name: string;
  work_description: string | null;
  work_type: string | null;
  phone: string | null;
  email: string | null;
  is_active?: boolean | null;
}

export interface ServiceRecord {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number | string | null;
  duration_minutes: number | null;
  requires_return: boolean | null;
  return_after_days: number | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  procedure_categories: ServiceCategory | ServiceCategory[] | null;
  professionals: ServiceProfessional[];
}

export interface ServiceAppointmentRecord {
  id: string;
  procedure_id: string | null;
  professional_id: string | null;
  client_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_at_booking: number | string | null;
  status_code: string | null;
  clients: { full_name: string | null } | { full_name: string | null }[] | null;
  professionals: { name: string | null } | { name: string | null }[] | null;
}

export interface ServiceOperationalSummary {
  completedThisMonth: number;
  monthlyRevenue: number;
  averageTicket: number;
  lastCompleted: ServiceAppointmentRecord | null;
  nextAppointment: ServiceAppointmentRecord | null;
  history: ServiceAppointmentRecord[];
}

export type ServiceFilterKey =
  | "all"
  | "active"
  | "inactive"
  | "with_professionals"
  | "without_professionals"
  | "most_scheduled"
  | "without_recent";

export interface ProcedureProfessionalLink {
  id: string;
  procedure_id: string;
  professional_id: string;
  professionals: ServiceProfessional | ServiceProfessional[] | null;
}

export interface ServiceFormValues {
  name: string;
  category_id: string;
  description: string;
  price: string;
  duration_minutes: string;
  requires_return: boolean;
  return_after_days: string;
  is_active: boolean;
  professional_ids: string[];
  new_category_name: string;
  new_category_description: string;
}
