import { FormEvent, useState } from "react";
import { AuthLayout } from "../components/AuthLayout";

interface LoginProps {
  errorMessage: string | null;
  isSubmitting: boolean;
  onLogin: (email: string, password: string) => Promise<void>;
}

export function Login({ errorMessage, isSubmitting, onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onLogin(email.trim(), password);
  }

  return (
    <AuthLayout>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor="email">
          E-mail
          <input
            autoComplete="email"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            required
            type="email"
            value={email}
          />
        </label>

        <label htmlFor="password">
          Senha
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Digite sua senha"
            required
            type="password"
            value={password}
          />
        </label>

        {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </AuthLayout>
  );
}
