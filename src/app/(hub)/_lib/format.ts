/**
 * Formatação de dinheiro e data do Hub. Funções puras, sem React — é aqui que
 * mora o risco de mostrar número errado, então é aqui que o teste bate.
 */

/** Valores chegam da API como string ("1250.50") para não passar por float. */
export function fmtBRL(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface SignedMoney {
  /** o valor absoluto formatado */
  text: string;
  /** '+' | '−' | '' — o sinal explícito, que acompanha a cor SEMPRE */
  sign: '+' | '−' | '';
  /** rótulo textual do estado, para não depender de cor nem de sinal */
  label: 'sobrou' | 'faltou' | 'zerado';
  tone: 'good' | 'critical' | 'neutral';
}

/**
 * Saldo com sinal e rótulo.
 *
 * Verde e vermelho são a escolha mais natural num app financeiro e reprovam na
 * verificação de daltonismo: #0ca30c ↔ #d03b3b dão ΔE 4.1 em deuteranopia,
 * contra um mínimo de 8. Para quem tem a forma mais comum de daltonismo, "sobrou"
 * e "faltou" ficariam idênticos. Por isso a cor nunca vem sozinha — o sinal e o
 * rótulo viajam com ela.
 */
export function signedBalance(amount: string | number): SignedMoney {
  const n = typeof amount === 'number' ? amount : Number(amount);
  const value = Number.isFinite(n) ? n : 0;

  if (value === 0) return { text: fmtBRL(0), sign: '', label: 'zerado', tone: 'neutral' };
  if (value > 0)   return { text: fmtBRL(value), sign: '+', label: 'sobrou', tone: 'good' };
  return { text: fmtBRL(Math.abs(value)), sign: '−', label: 'faltou', tone: 'critical' };
}

/** 'YYYY-MM-DD...' ou ISO → 'DD/MM'. A data vem gravada às 12:00 BRT, então
 *  ler em UTC-3 nunca cai no dia anterior. */
export function fmtDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--/--';
  const brt = new Date(d.getTime() - 3 * 3_600_000);
  return `${String(brt.getUTCDate()).padStart(2, '0')}/${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** ISO → 'YYYY-MM-DD' no fuso de São Paulo, para preencher <input type="date">. */
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const brt = new Date(d.getTime() - 3 * 3_600_000);
  return brt.toISOString().slice(0, 10);
}

const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** 'YYYY-MM' → 'outubro de 2026' */
export function fmtMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const name = MONTHS[Number(m[2]) - 1];
  // Mês fora de 01–12 chega como string crua em vez de "undefined de 2026".
  return name ? `${name} de ${m[1]}` : month;
}

/** Mês corrente em São Paulo, no formato 'YYYY-MM'. */
export function currentMonth(now = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 3_600_000);
  return `${brt.getUTCFullYear()}-${String(brt.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Desloca um 'YYYY-MM' em N meses, virando o ano quando precisa. */
export function shiftMonth(month: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Aceita "50", "50,90" ou "1.200,50" e devolve número, ou null. */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = (raw || '').replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = cleaned.split('.');
    const last  = parts[parts.length - 1] ?? '';
    normalized = parts.length > 1 && last.length <= 2
      ? cleaned
      : cleaned.replace(/\./g, '');
  }

  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}
