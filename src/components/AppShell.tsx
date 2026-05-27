import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  LogOut,
  MoreHorizontal,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
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

const navigationIcons: Record<AppRoute, LucideIcon> = {
  agenda: CalendarDays,
  clientes: Users,
  combos: Package,
  profissionais: BriefcaseBusiness,
  servicos: ClipboardList,
  movimentacao: BarChart3,
  atendentes: ShieldCheck,
};

export function isAdmin(user: AppUser) {
  return user.role === "Administrador";
}

export function AppShell({ activeRoute, children, isSigningOut, user, onNavigate, onSignOut }: AppShellProps) {
  const canSeeAdminItems = isAdmin(user);
  const [sidebarIsCollapsed, setSidebarIsCollapsed] = useState(() => {
    return window.localStorage.getItem("sidebarCollapsed") === "true";
  });
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

  useEffect(() => {
    window.localStorage.setItem("sidebarCollapsed", String(sidebarIsCollapsed));
  }, [sidebarIsCollapsed]);

  return (
    <div className={sidebarIsCollapsed ? "app-shell app-shell--sidebar-collapsed" : "app-shell"}>
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

      <aside className="sidebar" aria-label="Menu principal">
        <div className="sidebar__brand">
          <span className="brand-mark" aria-hidden="true">
            AA
          </span>
          <div>
            <strong>AgendeAqui</strong>
            <span>{user.role}</span>
          </div>
          <button
            aria-label={sidebarIsCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            className="sidebar__collapse-button"
            onClick={() => setSidebarIsCollapsed((isCollapsed) => !isCollapsed)}
            title={sidebarIsCollapsed ? "Expandir menu" : "Recolher menu"}
            type="button"
          >
            {sidebarIsCollapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Menu principal">
          {visibleNavigationItems.map((item) => {
            const Icon = navigationIcons[item.route];

            return (
              <button
                aria-current={activeRoute === item.route ? "page" : undefined}
                aria-label={item.label}
                className={activeRoute === item.route ? "sidebar__link sidebar__link--active" : "sidebar__link"}
                data-label={item.label}
                key={item.route}
                onClick={() => handleNavigation(item.route)}
                title={item.label}
                type="button"
              >
                <Icon aria-hidden="true" className="sidebar__icon" />
                <span className="sidebar__link-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar-user-card">
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <button
            className="sidebar__signout"
            data-label="Sair"
            disabled={isSigningOut}
            onClick={onSignOut}
            title="Sair"
            type="button"
          >
            <LogOut aria-hidden="true" className="sidebar__signout-icon" />
            <span className="sidebar__signout-label">{isSigningOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>

      <nav className="mobile-bottom-nav" aria-label="Menu principal mobile">
        {bottomNavigationItems.map((item) => {
          const Icon = navigationIcons[item.route];

          return (
            <button
              className={activeRoute === item.route ? "mobile-bottom-nav__item is-active" : "mobile-bottom-nav__item"}
              key={item.route}
              onClick={() => handleNavigation(item.route)}
              type="button"
            >
              <Icon aria-hidden="true" className="sidebar__icon" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          className={
            moreNavigationItems.some((item) => item.route === activeRoute) || mobileMoreIsOpen
              ? "mobile-bottom-nav__item is-active"
              : "mobile-bottom-nav__item"
          }
          onClick={() => setMobileMoreIsOpen((isOpen) => !isOpen)}
          type="button"
        >
          <MoreHorizontal aria-hidden="true" className="mobile-more-icon" />
          <span>Mais</span>
        </button>
      </nav>

      {mobileMoreIsOpen ? (
        <div className="mobile-more-menu" id="mobile-more-menu">
          {moreNavigationItems.map((item) => {
            const Icon = navigationIcons[item.route];

            return (
              <button
                className={activeRoute === item.route ? "mobile-more-menu__item is-active" : "mobile-more-menu__item"}
                key={item.route}
                onClick={() => handleNavigation(item.route)}
                type="button"
              >
                <Icon aria-hidden="true" className="sidebar__icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button className="mobile-more-menu__item mobile-more-menu__item--danger" disabled={isSigningOut} onClick={onSignOut} type="button">
            <LogOut aria-hidden="true" className="mobile-more-icon" />
            <span>{isSigningOut ? "Saindo..." : "Sair"}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
