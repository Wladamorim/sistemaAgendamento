export interface ClientRecord {
  id: string;
  full_name: string;
  phone: string;
  birth_date: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ClientAppointmentRecord {
  id: string;
  client_id: string | null;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  procedure_name: string | null;
  professional_name: string | null;
  price_at_booking: number | string | null;
  status_code: string | null;
  status_name: string | null;
}

export interface ClientOperationalSummary {
  totalCompleted: number;
  totalSpent: number;
  lastCompleted: ClientAppointmentRecord | null;
  nextAppointment: ClientAppointmentRecord | null;
  history: ClientAppointmentRecord[];
}

export type ClientFilterKey = "all" | "future" | "no_future" | "completed" | "recent" | "inactive";

export interface ClientFormValues {
  full_name: string;
  phone: string;
  birth_date: string;
  notes: string;
  is_active: boolean;
}
