export interface ProfessionalRecord {
  id: string;
  name: string;
  work_description: string | null;
  work_type: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProfessionalServiceCategory {
  id: string;
  name: string;
}

export interface ProfessionalServiceRecord {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  duration_minutes: number | null;
  is_active: boolean | null;
  procedure_categories: ProfessionalServiceCategory | ProfessionalServiceCategory[] | null;
}

export interface ProfessionalAppointmentRecord {
  id: string;
  professional_id: string | null;
  client_name: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  procedure_name: string | null;
  price_at_booking: number | string | null;
  status_code: string | null;
  status_name: string | null;
}

export interface ProfessionalScheduleBlock {
  id: string;
  professional_id: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

export interface ProfessionalOperationalSummary {
  appointmentsToday: number;
  nextAppointments: ProfessionalAppointmentRecord[];
  completedThisMonth: number;
  monthlyRevenue: number;
  averageTicket: number;
  history: ProfessionalAppointmentRecord[];
  futureBlocks: ProfessionalScheduleBlock[];
  blocksToday: ProfessionalScheduleBlock[];
  operationalStatus: string;
}

export type ProfessionalFilterKey =
  | "all"
  | "active"
  | "inactive"
  | "with_services"
  | "without_services"
  | "today_schedule"
  | "blocked_today";

export interface ProfessionalFormValues {
  name: string;
  work_description: string;
  work_type: string;
  phone: string;
  email: string;
}
