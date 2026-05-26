import { useState, type ReactNode } from "react";
import type { AppUser } from "../types/user";

export type AppRoute =
  | "agenda"
  | "clientes"
  | "profissionais"
  | "servicos"
  | "combos"
  | "movimentacao"
  | "atendentes";

interface NavigationItem {
  label: string;
  route: AppRoute;
  adminOnly?: boolean;
}

type NavigationIcon = "calendar" | "users" | "briefcase" | "tag" | "chart" | "shield";

interface AppShellProps {
  activeRoute: AppRoute;
  children: ReactNode;
  isSigningOut: boolean;
  user: AppUser;
  onNavigate: (route: AppRoute) => void;
  onSignOut: () => Promise<void>;
}

const navigationItems: NavigationItem[] = [
  { label: "Agenda", route: "agenda" },
  { label: "Clientes", route: "clientes" },
  { label: "Profissionais", route: "profissionais" },
  { label: "Serviços", route: "servicos" },
  { label: "Movimentação", route: "movimentacao", adminOnly: true },
  { label: "Combos", route: "combos", adminOnly: true },
  { label: "Atendentes", route: "atendentes", adminOnly: true },
];

const navigationIcons: Record<AppRoute, NavigationIcon> = {
  agenda: "calendar",
  clientes: "users",
  combos: "tag",
  profissionais: "briefcase",
  servicos: "tag",
  movimentacao: "chart",
  atendentes: "shield",
};

function NavigationIcon({ name }: { name: NavigationIcon }) {
  const paths: Record<NavigationIcon, ReactNode> = {
    calendar: (
      <>
        <path d="M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        <path d="M8 12h3M8 16h7" />
      </>
    ),
    users: (
      <>
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20" />
        <path d="M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M21 20v-1a3.5 3.5 0 0 0-2.7-3.4M16.5 4.1a3.5 3.5 0 0 1 0 6.8" />
      </>
    ),
    briefcase: (
      <>
        <path d="M9 6V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
        <path d="M4 7h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z" />
        <path d="M3 12h18M10 12v2h4v-2" />
      </>
    ),
    tag: (
      <>
        <path d="M20 11.5 12.5 19a2 2 0 0 1-2.8 0L4 13.3V4h9.3l5.7 5.7a2 2 0 0 1 0 2.8Z" />
        <path d="M8.5 8.5h.01" />
        <path d="M11 12h5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19h16" />
        <path d="M7 16V9M12 16V5M17 16v-3" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="sidebar__icon" fill="none" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export function isAdmin(user: AppUser) {
  return user.role === "Administrador";
}

export function AppShell({ activeRoute, children, isSigningOut, user, onNavigate, onSignOut }: AppShellProps) {
  const canSeeAdminItems = isAdmin(user);
  const [mobileMoreIsOpen, setMobileMoreIsOpen] = useState(false);
  const visibleNavigationItems = navigationItems.filter((item) => !item.adminOnly || canSeeAdminItems);
  const activeNavigationItem = navigationItems.find((item) => item.route === activeRoute);
  const bottomNavigationItems = visibleNavigationItems.filter((item) =>
    ["agenda", "clientes", "servicos"].includes(item.route),
  );
  const moreNavigationItems = visibleNavigationItems.filter(
    (item) => !bottomNavigationItems.some((bottomItem) => bottomItem.route === item.route),
  );

  function handleNavigation(route: AppRoute) {
    setMobileMoreIsOpen(false);
    onNavigate(route);
  }

  return (
    <div className="app-shell">
      <header className="mobile-app-header">
        <div>
          <strong>{activeNavigationItem?.label ?? "AgendeAqui"}</strong>
          <span>AgendeAqui - {user.role}</span>
        </div>
        <button
          aria-expanded={mobileMoreIsOpen}
          aria-controls="mobile-more-menu"
          className="mobile-menu-button"
          onClick={() => setMobileMoreIsOpen((isOpen) => !isOpen)}
          type="button"
        >
          Menu
        </button>
      </header>

      <aside className="sidebar">
        <div className="sidebar__brand">
          <span className="brand-mark" aria-hidden="true">
            SA
          </span>
          <div>
            <strong>Sistema de Agendamentos</strong>
            <span>{user.role}</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Menu principal">
          {visibleNavigationItems.map((item) => (
              <button
                className={activeRoute === item.route ? "sidebar__link sidebar__link--active" : "sidebar__link"}
                key={item.route}
                onClick={() => handleNavigation(item.route)}
                type="button"
              >
                <NavigationIcon name={navigationIcons[item.route]} />
                {item.label}
              </button>
            ))}
        </nav>

        <div className="sidebar__footer">
          <span>{user.name}</span>
          <button className="sidebar__signout" disabled={isSigningOut} onClick={onSignOut} type="button">
            {isSigningOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>

      <nav className="mobile-bottom-nav" aria-label="Menu principal mobile">
        {bottomNavigationItems.map((item) => (
          <button
            className={activeRoute === item.route ? "mobile-bottom-nav__item is-active" : "mobile-bottom-nav__item"}
            key={item.route}
            onClick={() => handleNavigation(item.route)}
            type="button"
          >
            <NavigationIcon name={navigationIcons[item.route]} />
            <span>{item.label}</span>
          </button>
        ))}

        <button
          className={
            moreNavigationItems.some((item) => item.route === activeRoute) || mobileMoreIsOpen
              ? "mobile-bottom-nav__item is-active"
              : "mobile-bottom-nav__item"
          }
          onClick={() => setMobileMoreIsOpen((isOpen) => !isOpen)}
          type="button"
        >
          <span aria-hidden="true" className="mobile-more-icon">
            ...
          </span>
          <span>Mais</span>
        </button>
      </nav>

      {mobileMoreIsOpen ? (
        <div className="mobile-more-menu" id="mobile-more-menu">
          {moreNavigationItems.map((item) => (
            <button
              className={activeRoute === item.route ? "mobile-more-menu__item is-active" : "mobile-more-menu__item"}
              key={item.route}
              onClick={() => handleNavigation(item.route)}
              type="button"
            >
              <NavigationIcon name={navigationIcons[item.route]} />
              <span>{item.label}</span>
            </button>
          ))}
          <button className="mobile-more-menu__item mobile-more-menu__item--danger" disabled={isSigningOut} onClick={onSignOut} type="button">
            <span aria-hidden="true" className="mobile-more-icon">
              x
            </span>
            <span>{isSigningOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
