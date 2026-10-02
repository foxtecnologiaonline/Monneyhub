'use client';

import { useState } from 'react';
import { layoutBars, type BarRow } from '../_lib/bars';
import { fmtBRL } from '../_lib/format';

/**
 * Gastos por categoria: barra horizontal ordenada, uma hue só.
 *
 * A tabela não é um extra escondido — com mais de ~7 categorias que todas
 * carregam significado, a tabela é a forma recomendada, e o gráfico é o resumo
 * visual dela. Ela também é a saída de acessibilidade quando a cor não ajuda.
 */
export function CategoryBars({ rows }: { rows: BarRow[] }) {
  const [showTable, setShowTable] = useState(false);
  const { bars, total } = layoutBars(rows);

  if (bars.length === 0) {
    return <p className="empty">Nenhuma despesa confirmada neste mês.</p>;
  }

  return (
    <>
      <div className="bars">
        {bars.map((b) => (
          <div className="bar-row" key={b.category}>
            <div className="bar-meta">
              <span className="bar-cat">{b.category}</span>
              {/* Rótulo de valor direto em cada barra: o eixo fica implícito e
                  ninguém precisa estimar comprimento para saber quanto é. */}
              <span className="bar-val">{fmtBRL(b.value)}</span>
            </div>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${b.widthPct}%` }}
                title={`${b.category}: ${fmtBRL(b.value)} — ${b.sharePct.toFixed(0)}% do mês`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        className="table-toggle"
        type="button"
        onClick={() => setShowTable((s) => !s)}
        aria-expanded={showTable}
      >
        {showTable ? 'Esconder tabela' : 'Ver como tabela'}
      </button>

      {showTable && (
        <table className="data-table">
          <caption className="sr-only">Despesas por categoria no mês</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">Lançamentos</th>
              <th scope="col">Total</th>
              <th scope="col">% do mês</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.category}>
                <td>{b.category}</td>
                <td className="num">{b.count}</td>
                <td className="num">{fmtBRL(b.value)}</td>
                <td className="num">{b.sharePct.toFixed(0)}%</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td className="num" />
              <td className="num"><strong>{fmtBRL(total)}</strong></td>
              <td className="num">100%</td>
            </tr>
          </tbody>
        </table>
      )}
    </>
  );
}
