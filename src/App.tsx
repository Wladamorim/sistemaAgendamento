import { useEffect, useState } from "react";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import type { AppUser, PublicUserRow } from "./types/user";

const INVALID_CREDENTIALS_MESSAGE = "E-mail ou senha inválidos.";
const INACTIVE_USER_MESSAGE = "Usuário inativo. Entre em contato com o administrador.";
const USER_NOT_FOUND_MESSAGE = "Usuário não encontrado no sistema.";

function getRoleName(row: PublicUserRow) {
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  return role?.name ?? "";
}

function mapUserRow(row: PublicUserRow): AppUser {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    name: row.name ?? row.email ?? "Usuário",
    email: row.email ?? "",
    phone: row.phone,
    role: getRoleName(row),
    is_active: Boolean(row.is_active),
  };
}

async function updateCurrentUserLastAccess(appUser: AppUser) {
  try {
    console.log("[Auth] atualizando last_access_at para:", appUser.auth_user_id);

    const { error } = await supabase.rpc("update_current_user_last_access");

    if (error) {
      console.warn("[Auth] Falha ao atualizar last_access_at:", error);
    }
  } catch (error) {
    console.warn("[Auth] Falha ao atualizar last_access_at:", error);
  }
}

async function fetchAppUser(authUser: SupabaseAuthUser): Promise<AppUser> {
  console.log("AUTH USER ID:", authUser.id);
  console.log("AUTH EMAIL:", authUser.email);

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select(`
      id,
      auth_user_id,
      name,
      email,
      phone,
      is_active,
      roles (
        id,
        name
      )
    `)
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  console.log("PROFILE:", profile);
  console.log("PROFILE ERROR:", profileError);

  if (profileError) {
    console.error("PROFILE ERROR:", profileError);
    throw profileError;
  }

  if (!profile) {
    await supabase.auth.signOut();
    throw new Error(USER_NOT_FOUND_MESSAGE);
  }

  const appUser = mapUserRow(profile as PublicUserRow);

  if (!appUser.is_active) {
    await supabase.auth.signOut();
    throw new Error(INACTIVE_USER_MESSAGE);
  }

  return appUser;
}

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      setIsLoadingSession(true);
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error || !data.session?.user) {
        setUser(null);
        setIsLoadingSession(false);
        return;
      }

      try {
        const appUser = await fetchAppUser(data.session.user);
        if (isMounted) {
          setUser(appUser);
          setErrorMessage(null);
        }
      } catch (error) {
        if (isMounted) {
          setUser(null);
          setErrorMessage(error instanceof Error ? error.message : INVALID_CREDENTIALS_MESSAGE);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSession(false);
        }
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(email: string, password: string) {
    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      setUser(null);
      setErrorMessage(INVALID_CREDENTIALS_MESSAGE);
      setIsSubmitting(false);
      return;
    }

    try {
      const appUser = await fetchAppUser(data.user);
      setUser(appUser);
      setErrorMessage(null);
      void updateCurrentUserLastAccess(appUser);
    } catch (error) {
      setUser(null);
      setErrorMessage(error instanceof Error ? error.message : INVALID_CREDENTIALS_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage(null);
    await supabase.auth.signOut();
    setUser(null);
    setIsSigningOut(false);
  }

  if (isLoadingSession) {
    return (
      <main className="loading-shell" aria-live="polite">
        <div className="loading-card">
          <span className="loader" aria-hidden="true" />
          <p>Validando sessão...</p>
        </div>
      </main>
    );
  }

  if (user) {
    return <Home isSigningOut={isSigningOut} onSignOut={handleSignOut} user={user} />;
  }

  return <Login errorMessage={errorMessage} isSubmitting={isSubmitting} onLogin={handleLogin} />;
}
