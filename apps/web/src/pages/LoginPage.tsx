import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../features/auth/auth-context';
import { errorMessage, LOGIN_ERROR_MESSAGES } from '../lib/error-messages';

type FieldErrors = {
  email?: string;
  password?: string;
};

// Só uma checagem de formato para dar retorno rápido; quem valida de verdade é a API.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = 'Informe o e-mail.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Informe um e-mail válido.';
  if (!password) errors.password = 'Informe a senha.';
  return errors;
}

export function LoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // A rota protegida guarda aqui a página que o usuário tentou acessar.
  const state = location.state as { from?: string } | null;
  const from = state?.from ?? '/';

  if (status === 'authenticated') {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await login(email, password);
      // O sucesso muda o status para "authenticated" e o <Navigate> acima redireciona.
    } catch (error) {
      setFormError(errorMessage(error, LOGIN_ERROR_MESSAGES));
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login">
      <h1>OpsBoard</h1>
      {/* noValidate: as mensagens vêm do nosso validate, em pt-BR e ligadas a cada campo. */}
      <form onSubmit={(event) => void handleSubmit(event)} noValidate aria-label="Entrar">
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            ref={emailRef}
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
          />
          {fieldErrors.email && (
            <p id="email-error" className="field-error">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            ref={passwordRef}
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
          />
          {fieldErrors.password && (
            <p id="password-error" className="field-error">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && (
          <p className="status status-error" role="alert">
            {formError}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
