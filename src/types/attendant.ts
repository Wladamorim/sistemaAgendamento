export interface AttendantRole {
  id: string;
  name: "Administrador" | "Atendente" | string;
}

export interface AttendantRecord {
  id: string;
  auth_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_access_at?: string | null;
  roles: AttendantRole | AttendantRole[] | null;
}

export interface AttendantFormValues {
  name: string;
  email: string;
  phone: string;
  password: string;
  admin_password: string;
  role_id: string;
  is_active: boolean;
}
