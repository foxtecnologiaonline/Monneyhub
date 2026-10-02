'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, clearToken, type ZmProfile } from '@/lib/zapscript-api';
import { useRequireAuth, useLogout } from '../_lib/useAuth';

const DELETE_PHRASE = 'APAGAR TUDO';

export default function AccountPage() {
  const { ready } = useRequireAuth();
  const logout = useLogout();
  const router = useRouter();
  const [me, setMe] = useState<ZmProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api.me().then(setMe).catch((err) => {
      setError(err instanceof ApiError ? err.message : 'Não consegui carregar seus dados.');
    });
  }, [ready]);

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      clearToken();
      // Depois de apagar não há sessão nem dado: volta pro começo.
      router.replace('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não consegui apagar a conta.');
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <>
      <div className="hub-header">
        <div>
          <h1>Conta</h1>
          <p className="hub-sub">A mesma conta que conversa com o ZapMonney.</p>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="card">
        <h2>Seus dados</h2>
        {me ? (
          <>
            <p style={{ margin: '0 0 6px' }}>{me.name || 'Sem nome cadastrado'}</p>
            <p className="hub-sub" style={{ margin: 0 }}>{me.phone}</p>
          </>
        ) : <div className="skeleton" style={{ width: '45%' }} />}
      </div>

      <div className="card">
        <h2>Sair</h2>
        <button className="btn" type="button" onClick={logout}>Sair deste aparelho</button>
        <p className="hub-sub" style={{ marginTop: 10 }}>
          Seus lançamentos continuam no lugar. Para entrar de novo é só pedir um código novo.
        </p>
      </div>

      <div className="card">
        <h2>Apagar minha conta</h2>
        <p className="hub-sub" style={{ marginTop: 0 }}>
          Isso apaga sua conta e <strong>todos</strong> os seus lançamentos, sem como desfazer —
          aqui e no WhatsApp, porque é o mesmo dado. Para confirmar, escreva
          exatamente <strong>{DELETE_PHRASE}</strong>.
        </p>
        <label className="field">
          <span className="sr-only">Frase de confirmação</span>
          <input
            className="input"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={DELETE_PHRASE}
            aria-label="Frase de confirmação"
          />
        </label>
        {/* Frase exata, não um "tem certeza?": a mesma barreira que a conversa
            usa, e a única irreversível do produto. */}
        <button
          className="btn btn-danger"
          type="button"
          disabled={phrase !== DELETE_PHRASE || busy}
          onClick={deleteAccount}
        >
          {busy ? 'Apagando…' : 'Apagar conta e lançamentos'}
        </button>
      </div>
    </>
  );
}
