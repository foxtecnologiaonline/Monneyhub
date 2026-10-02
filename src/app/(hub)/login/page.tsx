'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken, getToken, ApiError } from '@/lib/zapscript-api';

const RESEND_SECONDS = 60;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]   = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait]   = useState(0);

  // Já logado não precisa ver esta tela.
  useEffect(() => { if (getToken()) router.replace('/'); }, [router]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.requestCode(phone);
      // A API responde igual exista conta ou não, de propósito: senão o endpoint
      // vira um oráculo de "este telefone usa o ZapMonney". A mensagem que a
      // pessoa lê carrega essa ambiguidade em vez de esconder.
      setNotice(r.message);
      setStep('code');
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não consegui enviar o código.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.verify(phone, code);
      setToken(r.token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="hub-header">
        <div>
          <h1>MonneyHub</h1>
          <p className="hub-sub">Entre com o telefone que você usa no ZapMonney.</p>
        </div>
      </div>

      {error  && <div className="alert" role="alert">{error}</div>}
      {notice && step === 'code' && <div className="notice">{notice}</div>}

      <div className="card">
        {step === 'phone' ? (
          <form onSubmit={requestCode}>
            <label className="field">
              <span>Telefone com DDD</span>
              <input
                className="input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="11 98888-7777"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || phone.replace(/\D/g, '').length < 10}>
              {busy ? 'Enviando…' : 'Receber código no WhatsApp'}
            </button>
            <p className="hub-sub" style={{ marginTop: 12 }}>
              Ainda não usa? Manda uma mensagem para o número do ZapMonney primeiro —
              a conta é criada na conversa.
            </p>
          </form>
        ) : (
          <form onSubmit={verify}>
            <label className="field">
              <span>Código de 6 dígitos</span>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Verificando…' : 'Entrar'}
            </button>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => requestCode()}
                disabled={busy || wait > 0}
              >
                {wait > 0 ? `Reenviar em ${wait}s` : 'Reenviar código'}
              </button>
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => { setStep('phone'); setCode(''); setError(null); setNotice(null); }}
              >
                Trocar número
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
