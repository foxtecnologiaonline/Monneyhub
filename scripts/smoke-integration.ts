/**
 * Smoke de integração contra Postgres e Redis reais — o que os testes
 * unitários não cobrem (mocks não provam que o schema aplica nem que a
 * dedup da fila funciona de verdade).
 *
 * Pré-requisitos: DATABASE_URL e REDIS_URL apontando pra infra de teste.
 * Rodar com `npm run smoke`. Ele escreve e apaga os próprios dados.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getWhatsappInboundQueue, WHATSAPP_INBOUND_QUEUE } from "@/lib/queue";
import { getRedisConnection } from "@/lib/redis";
import { claimWhatsAppMessage } from "@/lib/whatsapp/dedupe";
import { buildForecastReport, persistForecastRun } from "@/lib/mei-oraculo/service";
import { readMemory, writeMemory, deleteAllMemory } from "@/lib/memory/service";
import { findTenantsByPhoneNumberIds } from "@/lib/tenant";
import { monneyhubZapHandler } from "@/lib/handlers/monneyhub-zap";
import type { NormalizedMessage } from "@/lib/handlers/types";

const suffix = randomUUID().slice(0, 8);
const phoneNumberId = `smoke-${suffix}`;
const veteran = `veterano-${suffix}`;
const novato = `novato-${suffix}`;

let failures = 0;

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FALHA ${label} ${detail}`);
  }
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function message(text: string, tenantId: string, userId: string): NormalizedMessage {
  return {
    tenantId,
    phoneNumberId,
    userId,
    messageId: `wamid.${randomUUID()}`,
    text,
    timestamp: new Date().toISOString(),
    raw: {},
  };
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.create({
    data: { name: `Smoke ${suffix}`, whatsappPhoneNumberId: phoneNumberId },
  });

  console.log("\n[1] Gateway — identificação de tenant");
  const tenants = await findTenantsByPhoneNumberIds([phoneNumberId, phoneNumberId, "inexistente"]);
  check("resolve o tenant pelo phone_number_id", tenants.get(phoneNumberId)?.id === tenant.id);
  check("não inventa tenant pra número desconhecido", !tenants.has("inexistente"));

  console.log("\n[2] Dedup — claim atômico de wamid (reentrega da Meta)");
  const wamid = `wamid.${randomUUID()}`;
  const firstClaim = await claimWhatsAppMessage(wamid);
  const secondClaim = await claimWhatsAppMessage(wamid);
  check("primeiro claim de um wamid é aceito", firstClaim === true);
  check("reentrega do mesmo wamid é rejeitada", secondClaim === false);

  console.log("\n[3] MonneyHub — saldo derivado (schema finance)");
  const account = await prisma.account.create({
    data: { tenantId: tenant.id, userId: veteran, name: "Conta veterana" },
  });
  await prisma.transaction.createMany({
    data: [
      { accountId: account.id, description: "Venda", occurredAt: daysAgo(240), amount: 5000 },
      { accountId: account.id, description: "Fornecedor", occurredAt: daysAgo(120), amount: -1500 },
      { accountId: account.id, description: "Venda", occurredAt: daysAgo(5), amount: 700.5 },
    ],
  });
  // Novato tem conta mas histórico abaixo do gate de 6 meses.
  const novatoAccount = await prisma.account.create({
    data: { tenantId: tenant.id, userId: novato, name: "Conta novata" },
  });
  await prisma.transaction.create({
    data: { accountId: novatoAccount.id, description: "Venda", occurredAt: daysAgo(40), amount: 300 },
  });
  // Conta que vai receber queima consistente o suficiente pra disparar o
  // alerta de saldo negativo previsto dentro da janela de 30 dias.
  const emRiscoUserId = `em-risco-${suffix}`;
  const emRiscoAccount = await prisma.account.create({
    data: { tenantId: tenant.id, userId: emRiscoUserId, name: "Conta em risco" },
  });
  const emRiscoRows = [];
  for (let day = 210; day >= 1; day -= 1) {
    emRiscoRows.push({
      accountId: emRiscoAccount.id,
      description: "Custo fixo diário",
      occurredAt: daysAgo(day),
      amount: -20,
    });
  }
  await prisma.transaction.createMany({ data: emRiscoRows });

  const veteranReport = await buildForecastReport(tenant.id, veteran);
  check(
    "saldo do veterano = soma das transações assinadas",
    Math.abs((veteranReport.currentBalance ?? NaN) - 4200.5) < 0.001,
    `(${veteranReport.currentBalance})`,
  );
  check("histórico do veterano passa do gate de 6 meses", veteranReport.status === "OK");

  const novatoReport = await buildForecastReport(tenant.id, novato);
  check(
    "novato fica abaixo do gate",
    novatoReport.status === "INSUFFICIENT_HISTORY",
    novatoReport.status,
  );

  console.log("\n[4] MEI-Oráculo — previsão em faixa, backtest e alerta");
  check("previsão expõe os três horizontes", veteranReport.horizons.length === 3);
  check(
    "faixa abre com o horizonte (90d mais incerto que 30d)",
    veteranReport.horizons[2]!.p90 - veteranReport.horizons[2]!.p10 >
      veteranReport.horizons[0]!.p90 - veteranReport.horizons[0]!.p10,
  );
  check("MAPE medido por backtest real, não estimado", veteranReport.mape !== null);

  const emRiscoReport = await buildForecastReport(tenant.id, emRiscoUserId);
  check("conta em risco tem histórico suficiente", emRiscoReport.status === "OK");
  check(
    "alerta de saldo negativo detectado dentro de 30 dias",
    emRiscoReport.alert !== null,
    JSON.stringify(emRiscoReport.alert),
  );
  check(
    "antecedência do alerta é o próprio dia do cruzamento (contado de hoje)",
    (emRiscoReport.alert?.leadDays ?? 0) > 0,
  );

  await persistForecastRun({
    tenantId: tenant.id,
    userId: veteran,
    report: veteranReport,
    exportKey: null,
  });
  const persisted = await prisma.forecastRun.findFirst({
    where: { tenantId: tenant.id, userId: veteran },
  });
  check("rodada persistida com MAPE gravado", persisted?.mape !== null && persisted?.mape !== undefined);

  console.log("\n[5] MonneyHub Zap — handler real contra o banco");
  const saldo = await monneyhubZapHandler(message("qual meu saldo?", tenant.id, veteran));
  check("responde saldo formatado em reais", saldo.replyText.includes("4.200,50"), saldo.replyText);

  const extrato = await monneyhubZapHandler(message("me manda o extrato", tenant.id, veteran));
  check("responde extrato com lançamentos", extrato.replyText.includes("R$"), extrato.replyText);

  const previsao = await monneyhubZapHandler(
    message("qual a previsão do meu fluxo de caixa?", tenant.id, veteran),
  );
  check("responde previsão em faixa", previsao.replyText.includes("dias"), previsao.replyText);

  const semDado = await monneyhubZapHandler(
    message("qual a previsão do meu fluxo de caixa?", tenant.id, novato),
  );
  check(
    "usuário sem histórico recebe aviso de dado insuficiente",
    semDado.replyText.includes("Ainda não dá"),
    semDado.replyText,
  );

  const semConta = await monneyhubZapHandler(
    message("qual meu saldo?", tenant.id, `sem-conta-${suffix}`),
  );
  check(
    "usuário sem conta vinculada recebe aviso, não erro",
    semConta.replyText.includes("Não encontrei uma conta"),
    semConta.replyText,
  );

  console.log("\n[6] Memória — escrita, leitura e exclusão total (LGPD)");
  await writeMemory({
    tenantId: tenant.id,
    userId: veteran,
    kind: "PREFERENCE",
    key: "tom",
    value: "formal",
  });
  await writeMemory({
    tenantId: tenant.id,
    userId: veteran,
    kind: "PREFERENCE",
    key: "tom",
    value: "informal",
  });
  await writeMemory({
    tenantId: tenant.id,
    userId: veteran,
    kind: "INTERACTION",
    value: { text: "oi" },
  });
  await writeMemory({
    tenantId: tenant.id,
    userId: veteran,
    kind: "INTERACTION",
    value: { text: "tudo bem?" },
  });

  const memories = await readMemory(tenant.id, veteran);
  const preferences = memories.filter((entry) => entry.kind === "PREFERENCE");
  check("PREFERENCE faz upsert (1 registro por chave)", preferences.length === 1);
  check("último valor vence", preferences[0]?.value === "informal");
  check(
    "INTERACTION acumula histórico",
    memories.filter((entry) => entry.kind === "INTERACTION").length === 2,
  );

  const deleted = await deleteAllMemory(tenant.id, veteran);
  check("exclusão total apaga tudo", deleted.deleted === 3, `(${deleted.deleted})`);
  check("nada sobra depois da exclusão", (await readMemory(tenant.id, veteran)).length === 0);

  console.log("\n[7] Limpeza");
  await prisma.forecastRun.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.account.deleteMany({ where: { tenantId: tenant.id } }); // cascade em Transaction
  await prisma.tenant.delete({ where: { id: tenant.id } });
  await getRedisConnection().del(`whatsapp:seen:${wamid}`);
  await getWhatsappInboundQueue().obliterate({ force: true });
  check("dados do smoke removidos", true);

  console.log(
    failures === 0
      ? "\nSmoke de integração: tudo verde.\n"
      : `\nSmoke de integração: ${failures} falha(s).\n`,
  );
}

main()
  .catch((err) => {
    console.error("smoke falhou:", err);
    failures += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    getRedisConnection().disconnect();
    console.log(`(fila: ${WHATSAPP_INBOUND_QUEUE})`);
    process.exit(failures === 0 ? 0 : 1);
  });
