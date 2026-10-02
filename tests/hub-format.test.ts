import { describe, expect, it } from 'vitest';
import {
  fmtBRL, signedBalance, fmtDay, toDateInput, fmtMonth,
  currentMonth, shiftMonth, parseMoneyInput,
} from '@/app/(hub)/_lib/format';
import { normalizePhone } from '@/lib/zapscript-api';

/**
 * O que estes testes protegem, em ordem de dano: valor errado na tela, data
 * caindo no mês vizinho, e estado financeiro comunicado só por cor.
 */

describe('fmtBRL', () => {
  it('formata string da API sem passar por float', () => {
    expect(fmtBRL('1250.50')).toMatch(/1\.250,50/);
    expect(fmtBRL('0.05')).toMatch(/0,05/);
  });

  it('não explode com valor ausente ou corrompido', () => {
    expect(fmtBRL('')).toMatch(/0,00/);
    expect(fmtBRL('abc')).toMatch(/0,00/);
  });
});

describe('signedBalance — cor nunca sozinha', () => {
  it('positivo vem com sinal e rótulo, não só com a cor', () => {
    const r = signedBalance('1749.50');
    expect(r.sign).toBe('+');
    expect(r.label).toBe('sobrou');
    expect(r.tone).toBe('good');
    expect(r.text).toMatch(/1\.749,50/);
  });

  it('negativo vem com sinal e rótulo, e o valor em módulo', () => {
    const r = signedBalance('-320.00');
    expect(r.sign).toBe('−');
    expect(r.label).toBe('faltou');
    expect(r.tone).toBe('critical');
    // Sem "-" duplicado: o sinal é o campo, o texto é o valor absoluto.
    expect(r.text).not.toContain('-');
    expect(r.text).toMatch(/320,00/);
  });

  it('zero não é nem bom nem ruim', () => {
    const r = signedBalance('0');
    expect(r.sign).toBe('');
    expect(r.label).toBe('zerado');
    expect(r.tone).toBe('neutral');
  });

  it('todo estado carrega sinal OU rótulo além do tom', () => {
    for (const v of ['100', '-100', '0']) {
      const r = signedBalance(v);
      expect(r.label.length).toBeGreaterThan(0);
    }
  });
});

describe('datas no fuso de São Paulo', () => {
  it('lê o dia correto de um lançamento gravado às 12:00 BRT', () => {
    expect(fmtDay('2026-10-01T15:00:00.000Z')).toBe('01/10');
  });

  it('não escorrega para o dia anterior na virada do mês', () => {
    // 01/10 às 12:00 BRT = 15:00 UTC. Ler em UTC puro daria 01/10 também, mas
    // um lançamento às 22:00 BRT (01:00 UTC do dia 2) é o caso que pega.
    expect(fmtDay('2026-10-02T01:00:00.000Z')).toBe('01/10');
  });

  it('toDateInput devolve YYYY-MM-DD do dia em São Paulo', () => {
    expect(toDateInput('2026-10-01T15:00:00.000Z')).toBe('2026-10-01');
    expect(toDateInput('2026-10-02T01:00:00.000Z')).toBe('2026-10-01');
  });

  it('data inválida não quebra a tela', () => {
    expect(fmtDay('nada')).toBe('--/--');
    expect(toDateInput('nada')).toBe('');
  });
});

describe('navegação de mês', () => {
  it('currentMonth usa o mês de São Paulo, não de UTC', () => {
    expect(currentMonth(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-11-01T04:00:00Z'))).toBe('2026-11');
  });

  it('shiftMonth vira o ano nos dois sentidos', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-10', -3)).toBe('2026-07');
  });

  it('fmtMonth escreve o mês em português', () => {
    expect(fmtMonth('2026-10')).toBe('outubro de 2026');
    expect(fmtMonth('2025-12')).toBe('dezembro de 2025');
  });
});

describe('parseMoneyInput — o que a pessoa digita', () => {
  it('aceita vírgula como decimal', () => {
    expect(parseMoneyInput('32,90')).toBe(32.9);
    expect(parseMoneyInput('1.200,50')).toBe(1200.5);
  });

  it('trata ponto como milhar quando sobram 3 casas', () => {
    expect(parseMoneyInput('1.200')).toBe(1200);
  });

  it('trata ponto como decimal quando sobram até 2 casas', () => {
    expect(parseMoneyInput('18.50')).toBe(18.5);
  });

  it('rejeita vazio, zero e texto', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('0')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
  });
});

describe('normalizePhone — o número que a API procura', () => {
  // `ZmUser.phone` guarda os dígitos do JID do WhatsApp, COM DDI. Sem o 55 o
  // findUnique não acha ninguém, e /auth/request-code responde igual exista
  // conta ou não: o login falharia calado, sem código chegando no WhatsApp.
  it('põe o DDI 55 no que veio só com DDD', () => {
    expect(normalizePhone('11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('(11) 3333-4444')).toBe('551133334444');
  });

  it('não duplica o DDI de quem já digitou completo', () => {
    expect(normalizePhone('+55 11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('5511988887777')).toBe('5511988887777');
  });

  it('decide por comprimento, não por "começa com 55"', () => {
    // DDD 55 é Santa Maria/RS: por prefixo, este número nunca ganharia o DDI.
    expect(normalizePhone('55 99999-8888')).toBe('5555999998888');
    expect(normalizePhone('55 3333-4444')).toBe('555533334444');
  });
});
