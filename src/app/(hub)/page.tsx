'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, type ZmSummary } from '@/lib/zapscript-api';
import { useRequireAuth } from './_lib/useAuth';
import { CategoryBars } from './_components/CategoryBars';
import { fmtBRL, signedBalance, currentMonth, shiftMonth, fmtMonth } from './_lib/format';

export default function MonthPage() {
  const { ready } = useRequireAuth();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData]   = useState<ZmSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((next: ZmSummary | null, err?: unknown) => {
    if (next) { setData(next); setError(null); }
    else      { setError(err instanceof ApiError ? err.message : 'Não consegui carregar o mês.'); }
    setLoading(false);
  }, []);

  // A flag `cancelled` não é cerimônia: ao trocar de mês rápido, a resposta do
  // mês ANTIGO pode chegar depois da do novo e sobrescrever a tela com dado de
  // outro período, calado. O cleanup do efeito descarta a resposta obsoleta.
  // `loading` já nasce true, então a troca de mês mantém o mês anterior na tela
  // até o novo chegar, em vez de piscar um esqueleto.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await api.summary(month);
        if (!cancelled) apply(next);
      } catch (err) {
        if (!cancelled) apply(null, err);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, month, apply]);

  // Em vez de WebSocket: recarrega ao voltar o foco da janela. Quem acabou de
  // ditar um gasto no WhatsApp e trocou para o app encontra o dado já lá, e o
  // canal de aviso de verdade continua sendo o próprio WhatsApp.
  useEffect(() => {
    if (!ready) return;
    const onFocus = () => {
      void api.summary(month).then((next) => apply(next)).catch((err) => apply(null, err));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ready, month, apply]);

  if (!ready) return null;

  const saldo = data ? signedBalance(data.balance) : null;

  return (
    <>
      <div className="hub-header">
        <div>
          <h1>{data?.label ?? fmtMonth(month)}</h1>
          <p className="hub-sub">Só lançamentos confirmados entram no saldo.</p>
        </div>
        <div className="month-nav">
          <button className="btn" type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mês anterior">←</button>
          <button
            className="btn"
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            disabled={month >= currentMonth()}
            aria-label="Mês seguinte"
          >→</button>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {loading && !data ? (
        <div className="card">
          <div className="skeleton" style={{ height: 34, width: '55%' }} />
          <div className="skeleton" style={{ width: '35%' }} />
        </div>
      ) : data && (
        <>
          <div className="card">
            <h2>Saldo do mês</h2>
            {/* Sinal e rótulo acompanham a cor sempre: verde e vermelho são
                indistinguíveis na forma mais comum de daltonismo. */}
            <div className={`hero-value tone-${saldo!.tone}`}>
              {saldo!.sign}{saldo!.text}
            </div>
            <div className="hero-label">
              {saldo!.label === 'sobrou' && 'sobrou neste mês'}
              {saldo!.label === 'faltou' && 'faltou neste mês'}
              {saldo!.label === 'zerado' && 'nada lançado ainda'}
            </div>

            <div className="kpi-row">
              <div className="kpi">
                <div className="kpi-k">Entradas</div>
                <div className="kpi-v">{fmtBRL(data.income)}</div>
              </div>
              <div className="kpi">
                <div className="kpi-k">Saídas</div>
                <div className="kpi-v">{fmtBRL(data.expense)}</div>
              </div>
            </div>
          </div>

          {data.pendingCount > 0 && (
            <div className="notice">
              <strong>{data.pendingCount}</strong> lançamento(s) ditado(s) no WhatsApp
              esperando sua confirmação.{' '}
              <Link href="/pendentes">Conferir agora</Link>
            </div>
          )}

          <div className="card">
            <h2>Gastos por categoria</h2>
            <CategoryBars rows={data.byCategory} />
          </div>

          {Number(data.income) === 0 && Number(data.expense) === 0 && (
            <div className="card">
              <div className="empty">
                <strong>Nenhum lançamento neste mês</strong>
                O caminho mais curto é mandar uma mensagem para o ZapMonney:
                <em> &ldquo;gastei 50 no mercado&rdquo;</em>. Ele pergunta se está certo e salva.
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
