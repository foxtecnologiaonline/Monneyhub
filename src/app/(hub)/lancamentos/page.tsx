'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, ZM_CATEGORIES, type ZmTransaction } from '@/lib/zapscript-api';
import { useRequireAuth } from '../_lib/useAuth';
import { fmtBRL, fmtDay, toDateInput, currentMonth, shiftMonth, fmtMonth, parseMoneyInput } from '../_lib/format';

export default function TransactionsPage() {
  const { ready } = useRequireAuth();
  const [month, setMonth] = useState(currentMonth());
  const [type, setType]   = useState('');
  const [category, setCategory] = useState('');
  const [rows, setRows]   = useState<ZmTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ZmTransaction | null>(null);

  // `cancelled` descarta resposta obsoleta: trocar filtro ou mês rápido pode
  // fazer a busca antiga chegar depois da nova e repintar a lista errada.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.transactions({ month, type: type || undefined, category: category || undefined });
        if (cancelled) return;
        setRows(r.transactions);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Não consegui carregar os lançamentos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, month, type, category]);

  async function remove(tx: ZmTransaction) {
    // Apagar lançamento é destrutivo e irreversível pela interface: confirma.
    if (!window.confirm(`Apagar ${fmtBRL(tx.amount)} de ${tx.category}?`)) return;
    try {
      await api.deleteTransaction(tx.id);
      setRows((rs) => rs.filter((r) => r.id !== tx.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não consegui apagar.');
    }
  }

  if (!ready) return null;

  return (
    <>
      <div className="hub-header">
        <div>
          <h1>Lançamentos</h1>
          <p className="hub-sub">{fmtMonth(month)}</p>
        </div>
        <div className="month-nav">
          <button className="btn" type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mês anterior">←</button>
          <button className="btn" type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= currentMonth()} aria-label="Mês seguinte">→</button>
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      <div className="filters">
        <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Tudo</option>
          <option value="expense">Saídas</option>
          <option value="income">Entradas</option>
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Toda categoria</option>
          {ZM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <>
            <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
          </>
        ) : rows.length === 0 ? (
          <div className="empty">
            <strong>Nada por aqui neste filtro</strong>
            Para registrar, o caminho curto é o WhatsApp: <em>&ldquo;gastei 50 no mercado&rdquo;</em>.
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
              <div className="tx-meta">{fmtDay(tx.occurredAt)} · {tx.category}</div>
            </div>
            <div className="tx-actions">
              <button className="btn btn-sm" type="button" onClick={() => setEditing(tx)}>Editar</button>
              <button className="btn btn-sm btn-danger" type="button" onClick={() => remove(tx)}>Apagar</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditDialog
          tx={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function EditDialog({
  tx, onClose, onSaved,
}: {
  tx: ZmTransaction;
  onClose: () => void;
  onSaved: (tx: ZmTransaction) => void;
}) {
  const [amount, setAmount] = useState(tx.amount);
  const [category, setCategory] = useState(tx.category);
  const [description, setDescription] = useState(tx.description ?? '');
  const [date, setDate] = useState(toDateInput(tx.occurredAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = parseMoneyInput(amount);
    if (!value) { setError('Valor inválido.'); return; }

    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTransaction(tx.id, {
        amount: value,
        category,
        description: description.trim() || null,
        occurredAt: date,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não consegui salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Editar lançamento</h2>
      {error && <div className="alert" role="alert">{error}</div>}
      <form onSubmit={save}>
        <label className="field">
          <span>Valor</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="field">
          <span>Categoria</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {ZM_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Descrição</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>Data</span>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
