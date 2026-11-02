// Guarda o token em memória (leitura rápida) e no localStorage (sobrevive ao recarregar).
//
// Trade-off: qualquer script rodando na página lê o localStorage, então um XSS pode roubar o
// token; um cookie HttpOnly evitaria isso, mas exigiria proteção contra CSRF.
// A expiração curta do token limita o estrago, e o React escapa o conteúdo por padrão.

const STORAGE_KEY = 'opsboard.accessToken';

// O acesso ao localStorage pode lançar erro (ex.: navegação privada com armazenamento bloqueado).
// Nesse caso a sessão continua funcionando em memória até recarregar a página.
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let token: string | null = readStoredToken();

export function getToken(): string | null {
  return token;
}

export function setToken(value: string): void {
  token = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Sem persistência, mas a sessão atual segue válida.
  }
}

export function clearToken(): void {
  token = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada a limpar.
  }
}
