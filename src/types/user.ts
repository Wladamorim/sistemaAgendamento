export type AppRole = "Administrador" | "Atendente" | string;

export interface AppUser {
  id: string;
  auth_user_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: AppRole;
  is_active: boolean;
}

export interface PublicUserRow {
  id: string;
  auth_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean | null;
  last_access_at?: string | null;
  roles: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
}
