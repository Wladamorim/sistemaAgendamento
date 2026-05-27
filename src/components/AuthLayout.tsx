import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="app-title">
        <div className="brand-block brand-block--login">
          <BrandLogo variant="login" />
          <div>
            <h1 id="app-title">Acesse sua conta</h1>
            <p>Gerencie agenda, clientes, serviços e atendimentos em um só lugar</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
