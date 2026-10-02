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

/**
 * O evento 'storage' do navegador só chega nas OUTRAS abas, nunca na que mexeu
 * no localStorage. Quem muda o token na própria aba — login, logout e o 401 do
 * `request` — precisa avisar à mão, senão `useToken` não reage e a sessão morta
 * fica na tela até alguém recarregar a página.
 */
const tokenListeners = new Set<() => void>();

export function onTokenChange(fn: () => void): () => void {
  tokenListeners.add(fn);
  return () => { tokenListeners.delete(fn); };
}

function notifyTokenChange(): void {
  tokenListeners.forEach((fn) => fn());
}

/**
 * `ZmUser.phone` guarda os dígitos do JID do WhatsApp, com DDI: `5511988887777`.
 * O formulário pede "telefone com DDD", então sem o 55 o `findUnique` da API não
 * acha ninguém — e como `/auth/request-code` responde igual exista conta ou não,
 * o login falharia calado, sem código nenhum chegando no WhatsApp.
 *
 * A decisão é por COMPRIMENTO e não por "começa com 55": o DDD 55 existe (Santa
 * Maria/RS) e um número de lá nunca receberia o prefixo.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

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
  notifyTokenChange();
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nada a fazer */
  }
  notifyTokenChange();
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

  // 401 COM token = sessão expirada ou revogada. Limpa o token aqui (e avisa os
  // ouvintes) para a navegação cair no login em vez de insistir com credencial
  // morta. Sem token é /auth/verify recusando o código: ali a mensagem da API
  // ("Código inválido ou expirado") é a certa, e dizer "sessão expirada" para
  // quem está justo criando uma sessão só confunde.
  if (res.status === 401 && token) {
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
  // Normaliza aqui, e não na tela, para as duas chamadas mandarem exatamente o
  // mesmo número: a chave do OTP no Redis é o telefone, e divergir entre pedir e
  // verificar faria o código certo ser recusado.
  requestCode: (phone: string) =>
    request<{ ok: boolean; message: string }>('/auth/request-code', {
      method: 'POST',
      body: JSON.stringify({ phone: normalizePhone(phone) }),
    }),

  verify: (phone: string, code: string) =>
    request<{ token: string; user: ZmProfile }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone: normalizePhone(phone), code }),
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
