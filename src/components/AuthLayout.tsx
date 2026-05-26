import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="app-title">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">
            SA
          </span>
          <div>
            <h1 id="app-title">Sistema de Agendamentos</h1>
            <p>Acesse sua conta para gerenciar a agenda</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
