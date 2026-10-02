/**
 * Cliente da API do ZapScript — a única fonte de dado financeiro do MonneyHub.
 *
 * Não existe Prisma no caminho da interface de propósito: o dado vive no
 * Postgres do ZapScript (`ZmUser`/`ZmTransaction`), que é o mesmo que a conversa
 * no WhatsApp lê e escreve. Ver `docs/06-monneyhub-hub-visual.md`.
 */

const BASE = (process.env.NEXT_PUBLIC_ZAPSCRIPT_API_URL || '').replace(/\/$/, '');

/**
 * Chave própria, nunca o `zs_token` do painel B2B do ZapScript. São dois espaços
 * de identidade: `ZmUser` é qualquer pessoa com um telefone, `User` é cliente
 * pagante. O token daqui carrega `aud: "zm"` e a API recusa o outro.
 */
const TOKEN_KEY = 'mh_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** localStorage não existe no servidor, e pode lançar em janela privada. */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* sessão não persiste, mas a navegação atual funciona */
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nada a fazer */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!BASE) {
    throw new ApiError(0, 'NEXT_PUBLIC_ZAPSCRIPT_API_URL não configurada');
  }

  const token = getToken();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}/zapmonney${path}`, { ...init, headers });
  } catch {
    // Rede caída precisa de mensagem própria: "erro ao carregar" sem dizer que
    // é conexão faz a pessoa achar que perdeu os lançamentos dela.
    throw new ApiError(0, 'Sem conexão com o servidor. Tenta de novo em instantes.');
  }

  // 401 = sessão expirada ou revogada. Limpa o token aqui para a próxima
  // navegação já cair no login, em vez de ficar tentando com credencial morta.
  if (res.status === 401) {
    clearToken();
    throw new ApiError(401, 'Sessão expirada. Entra de novo.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error || 'Não consegui completar a operação.');
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Tipos de resposta ────────────────────────────────────────────────────────

export interface ZmTransaction {
  id: string;
  type: 'expense' | 'income';
  /** string, não number: centavo de real não sobrevive a float */
  amount: string;
  category: string;
  description: string | null;
  occurredAt: string;
  status: string;
  createdAt: string;
}

export interface ZmSummary {
  month: string;
  label: string;
  income: string;
  expense: string;
  balance: string;
  pendingCount: number;
  byCategory: { category: string; total: string; count: number }[];
}

export interface ZmProfile {
  id: string;
  name: string | null;
  phone: string;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export const api = {
  requestCode: (phone: string) =>
    request<{ ok: boolean; message: string }>('/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verify: (phone: string, code: string) =>
    request<{ token: string; user: ZmProfile }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  me: () => request<ZmProfile>('/me'),

  summary: (month?: string) =>
    request<ZmSummary>(`/summary${month ? `?month=${month}` : ''}`),

  transactions: (params: {
    month?: string;
    type?: string;
    category?: string;
    status?: 'confirmed' | 'pending';
    cursor?: string;
  } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
    const qs = q.toString();
    return request<{
      month: string;
      label: string;
      transactions: ZmTransaction[];
      nextCursor: string | null;
    }>(`/transactions${qs ? `?${qs}` : ''}`);
  },

  createTransaction: (body: {
    type: 'expense' | 'income';
    amount: number;
    category: string;
    description?: string;
    occurredAt?: string;
  }) => request<ZmTransaction>('/transactions', { method: 'POST', body: JSON.stringify(body) }),

  updateTransaction: (id: string, body: Record<string, unknown>) =>
    request<ZmTransaction>(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${id}`, { method: 'DELETE' }),

  confirmTransaction: (id: string) =>
    request<{ ok: boolean }>(`/transactions/${id}/confirm`, { method: 'POST' }),

  deleteAccount: () => request<{ ok: boolean }>('/account', { method: 'DELETE' }),
};

export const ZM_CATEGORIES = [
  'Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Educação',
  'Lazer', 'Compras', 'Serviços', 'Receita', 'Outros',
] as const;
