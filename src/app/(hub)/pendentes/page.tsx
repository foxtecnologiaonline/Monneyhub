'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ZmTransaction } from '@/lib/zapscript-api';
import { useRequireAuth } from '../_lib/useAuth';
import { fmtBRL, fmtDay, currentMonth } from '../_lib/format';

/**
 * A ponte mais visível entre os dois produtos: o que o ZapMonney extraiu de um
 * áudio ou texto e está esperando confirmação. Confirmar três lançamentos
 * ditados no caminho de casa é desconfortável por conversa e trivial por tela —
 * é exatamente o que a interface faz melhor que o chat.
 */
export default function PendingPage() {
  const { ready } = useRequireAuth();
  const [rows, setRows] = useState<ZmTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        // Pendente só é elegível dentro da janela de conversa do ZapMonney
        // (60min), então o mês corrente cobre tudo que a conversa ainda
        // considera aberto — e o mês passado só na virada da meia-noite.
        const [atual, anterior] = await Promise.all([
          api.transactions({ status: 'pending', month: currentMonth() }),
          api.transactions({ status: 'pending', month: previousMonth() }),
        ]);
        if (cancelled) return;
        setRows([...atual.transactions, ...anterior.transactions]);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Não consegui carregar os pendentes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready]);

  async function act(tx: ZmTransaction, action: 'confirm' | 'discard') {
    setBusyId(tx.id);
    setError(null);
    try {
      if (action === 'confirm') await api.confirmTransaction(tx.id);
      else                      await api.deleteTransaction(tx.id);
      setRows((rs) => rs.filter((r) => r.id !== tx.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não consegui atualizar.');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmAll() {
    if (!window.confirm(`Confirmar ${rows.length} lançamento(s)?`)) return;
    for (const tx of rows) await act(tx, 'confirm');
  }

  if (!ready) return null;

  return (
    <>
      <div className="hub-header">
        <div>
          <h1>Pendentes</h1>
          <p className="hub-sub">Ditado no WhatsApp, esperando você conferir.</p>
        </div>
        {rows.length > 1 && (
          <button className="btn btn-primary btn-sm" type="button" onClick={confirmAll} disabled={!!busyId}>
            Confirmar todos
          </button>
        )}
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="card">
        {loading ? (
          <><div className="skeleton" /><div className="skeleton" /></>
        ) : rows.length === 0 ? (
          <div className="empty">
            <strong>Nada esperando confirmação</strong>
            Tudo que você ditou já está no saldo.
          </div>
        ) : rows.map((tx) => (
          <div className="tx" key={tx.id}>
            <div className="tx-body">
              <div className="tx-top">
                <span className="tx-desc">{tx.description || tx.category}</span>
                <span className="tx-amount">
                  {tx.type === 'income' ? '+' : '−'}{fmtBRL(tx.amount)}
                </span>
              </div>
              <div className="tx-meta">{fmtDay(tx.occurredAt)} · {tx.category} <span className="badge">pendente</span></div>
            </div>
            <div className="tx-actions">
              <button className="btn btn-sm btn-primary" type="button" disabled={busyId === tx.id} onClick={() => act(tx, 'confirm')}>
                Confirmar
              </button>
              <button className="btn btn-sm btn-danger" type="button" disabled={busyId === tx.id} onClick={() => act(tx, 'discard')}>
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function previousMonth(): string {
  const brt = new Date(Date.now() - 3 * 3_600_000);
  const d = new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
