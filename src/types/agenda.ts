export interface Professional {
  id: string;
  name: string;
  work_description: string | null;
  work_type: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean | null;
}

export interface Appointment {
  id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  client_name: string | null;
  client_phone: string | null;
  procedure_name: string | null;
  category_name: string | null;
  professional_id: string;
  professional_name: string | null;
  professional_work_description: string | null;
  professional_work_type: string | null;
  price_at_booking: number | string | null;
  duration_at_booking: number | null;
  status_code: string | null;
  status_name: string | null;
  appointment_notes: string | null;
}

export interface ProcedureCategory {
  id: string;
  name: string;
}

export interface Procedure {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  duration_minutes: number | null;
  category_id: string | null;
  is_active: boolean | null;
  procedure_categories: ProcedureCategory | ProcedureCategory[] | null;
}

export interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  notes: string | null;
  allergies: string | null;
  preferences: string | null;
  restrictions: string | null;
}

export interface AppointmentDetails {
  id: string;
  client_id: string;
  procedure_id: string;
  professional_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  price_at_booking: number | string | null;
  duration_at_booking: number | null;
  payment_method: string | null;
  payment_installments?: number | null;
  payment_details?: unknown | null;
  paid_amount?: number | string | null;
  status_code: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  client: Client | null;
  procedure: Procedure | null;
  professional: Professional | null;
}

export interface SelectedAgendaSlot {
  professional: Professional;
  startTime: string;
}

export interface ScheduleBlock {
  id: string;
  professional_id: string | null;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}
