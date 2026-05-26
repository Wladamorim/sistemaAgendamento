import { useEffect, useState } from "react";
import { AppShell, type AppRoute, isAdmin } from "../components/AppShell";
import { RestrictedAccess } from "../components/RestrictedAccess";
import type { AppUser } from "../types/user";
import { Agenda } from "./Agenda";
import { Atendentes } from "./Atendentes";
import { Clientes } from "./Clientes";
import { Movimentacao } from "./Movimentacao";
import { Profissionais } from "./Profissionais";
import { Servicos } from "./Servicos";

interface HomeProps {
  user: AppUser;
  isSigningOut: boolean;
  onSignOut: () => Promise<void>;
}

const validRoutes: AppRoute[] = [
  "agenda",
  "clientes",
  "profissionais",
  "servicos",
  "movimentacao",
  "atendentes",
];

function getRouteFromHash(): AppRoute {
  const hashRoute = window.location.hash.replace("#/", "") as AppRoute;
  return validRoutes.includes(hashRoute) ? hashRoute : "agenda";
}

export function Home({ user, isSigningOut, onSignOut }: HomeProps) {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(() => getRouteFromHash());
  const adminOnlyRoutes: AppRoute[] = ["movimentacao", "atendentes"];
  const isRestricted = adminOnlyRoutes.includes(activeRoute) && !isAdmin(user);

  useEffect(() => {
    function handleHashChange() {
      setActiveRoute(getRouteFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  function handleNavigate(route: AppRoute) {
    window.location.hash = `/${route}`;
    setActiveRoute(route);
  }

  let content;

  if (isRestricted) {
    content = <RestrictedAccess />;
  } else if (activeRoute === "agenda") {
    content = <Agenda user={user} />;
  } else if (activeRoute === "clientes") {
    content = <Clientes user={user} />;
  } else if (activeRoute === "profissionais") {
    content = <Profissionais user={user} />;
  } else if (activeRoute === "servicos") {
    content = <Servicos user={user} />;
  } else if (activeRoute === "movimentacao") {
    content = <Movimentacao user={user} />;
  } else if (activeRoute === "atendentes") {
    content = <Atendentes user={user} />;
  } else {
    content = <Agenda user={user} />;
  }

  return (
    <AppShell
      activeRoute={activeRoute}
      isSigningOut={isSigningOut}
      onNavigate={handleNavigate}
      onSignOut={onSignOut}
      user={user}
    >
      {content}
    </AppShell>
  );
}
