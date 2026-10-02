'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearToken } from '@/lib/zapscript-api';

/**
 * O token é estado EXTERNO ao React (localStorage), então quem lê é
 * useSyncExternalStore e não um useEffect que chama setState.
 *
 * Não é preciosismo: ler em efeito renderiza uma vez "deslogado" e só então
 * corrige, o que pisca a interface e, no App Router, é exatamente o que dispara
 * divergência de hidratação. O snapshot de servidor é `null` de propósito — no
 * servidor não existe localStorage, e mentir ali é que causaria o erro.
 */
function subscribe(onChange: () => void): () => void {
  // 'storage' cobre logout feito em outra aba: a sessão cai nas duas.
  window.addEventListener('storage', onChange);
  return () => window.removeEventListener('storage', onChange);
}

export function useToken(): string | null {
  return useSyncExternalStore(subscribe, getToken, () => null);
}

/**
 * Porta de entrada das telas protegidas.
 *
 * O gate fica em cada página, não no layout, porque o layout também serve
 * /login — se ele exigisse sessão, a tela de entrar nunca abriria.
 *
 * Isto é conveniência de navegação, não segurança: quem decide o que a pessoa
 * pode ver é a API, que escopa toda query ao zmUserId da sessão.
 */
export function useRequireAuth(): { ready: boolean } {
  const router = useRouter();
  const token  = useToken();

  useEffect(() => {
    if (!token) router.replace('/login');
  }, [token, router]);

  return { ready: !!token };
}

export function useLogout(): () => void {
  const router = useRouter();
  return () => {
    clearToken();
    router.replace('/login');
  };
}
