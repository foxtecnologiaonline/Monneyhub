'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearToken, onTokenChange } from '@/lib/zapscript-api';

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
  // 'storage' cobre logout feito em OUTRA aba: a sessão cai nas duas. Ele não
  // chega na aba que mexeu no localStorage, então a mudança na própria aba vem
  // de `onTokenChange` — é por ali que o 401 de dentro do `request` (sessão
  // expirada no meio do uso) consegue derrubar a tela para o login.
  window.addEventListener('storage', onChange);
  const off = onTokenChange(onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    off();
  };
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

  // Lê o localStorage direto, não o snapshot: na hidratação o snapshot é o do
  // servidor (`null` de propósito), e este efeito roda na mesma leva de efeitos
  // em que o `useSyncExternalStore` apenas AGENDA o re-render com o valor real.
  // Pelo snapshot, abrir /pendentes direto jogaria quem está logado no /login.
  useEffect(() => {
    if (!getToken()) router.replace('/login');
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
