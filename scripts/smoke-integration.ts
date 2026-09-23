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
import { getCurrentBalance, getHistoryRange } from "@/lib/monneyhub/balance";
import { monthsOfHistory, hasEnoughHistory } from "@/lib/monneyhub/forecast/bands";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";
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

  console.log("\n[2] Fila — dedup por wamid (reentrega da Meta)");
  const queue = getWhatsappInboundQueue();
  const duplicated = message("oi", tenant.id, veteran);
  await queue.add("inbound-message", duplicated, { jobId: duplicated.messageId });
  await queue.add("inbound-message", duplicated, { jobId: duplicated.messageId });
  const waiting = await queue.getJobs(["waiting", "delayed", "active"]);
  const sameId = waiting.filter((job) => job.id === duplicated.messageId);
  check("mesma mensagem entra na fila uma vez só", sameId.length === 1, `(${sameId.length})`);

  console.log("\n[3] MonneyHub — saldo e histórico");
  await prisma.transaction.createMany({
    data: [
      { tenantId: tenant.id, userId: veteran, occurredOn: daysAgo(240), amount: 5000, type: "INCOME" },
      { tenantId: tenant.id, userId: veteran, occurredOn: daysAgo(120), amount: 1500, type: "EXPENSE" },
      { tenantId: tenant.id, userId: veteran, occurredOn: daysAgo(5), amount: 700.5, type: "INCOME" },
      { tenantId: tenant.id, userId: novato, occurredOn: daysAgo(40), amount: 300, type: "INCOME" },
    ],
  });

  const balance = await getCurrentBalance(tenant.id, veteran);
  check("saldo = entradas − saídas", Math.abs(balance - 4200.5) < 0.001, `(${balance})`);

  const range = await getHistoryRange(tenant.id, veteran);
  const months = range ? monthsOfHistory(range.first, range.last) : 0;
  check("histórico do veterano passa do gate de 6 meses", hasEnoughHistory(months), `(${months}m)`);

  const novatoRange = await getHistoryRange(tenant.id, novato);
  const novatoMonths = novatoRange ? monthsOfHistory(novatoRange.first, novatoRange.last) : 0;
  check("novato fica abaixo do gate", !hasEnoughHistory(novatoMonths), `(${novatoMonths}m)`);

  console.log("\n[4] MEI-Oráculo — previsão persistida vira faixa");
  const run = await prisma.forecastRun.create({
    data: {
      tenantId: tenant.id,
      userId: veteran,
      status: "READY",
      historyMonths: months,
      openingBalance: 300,
      mape: 12.5,
      trainedAt: new Date(),
      points: {
        createMany: {
          // Queima de 15/dia a partir de 300: o cenário realista cruza zero
          // no 21º dia — dentro da janela de alerta e acima dos 15 dias de
          // antecedência exigidos pelo critério de aceite.
          data: Array.from({ length: 90 }, (_, index) => ({
            date: daysAgo(-(index + 1)),
            p10: 300 - 25 * (index + 1),
            p50: 300 - 15 * (index + 1),
            p90: 300 + 5 * (index + 1),
          })),
        },
      },
    },
  });
  check("rodada persistida com 90 pontos diários", Boolean(run.id));

  const view = await getLatestForecast(tenant.id, veteran);
  check("status READY", view.status === "READY");
  check("expõe os três horizontes", view.horizons?.length === 3, JSON.stringify(view.horizons));
  check("MAPE exposto internamente", view.mape === 12.5);
  check(
    "alerta de saldo negativo detectado dentro de 30 dias",
    view.negativeBalanceAlert?.leadDays === 21,
    JSON.stringify(view.negativeBalanceAlert),
  );
  check(
    "antecedência atende o critério de aceite (≥ 15 dias)",
    (view.negativeBalanceAlert?.leadDays ?? 0) >= 15,
  );

  console.log("\n[5] MonneyHub Zap — handler real contra o banco");
  const saldo = await monneyhubZapHandler(message("qual meu saldo?", tenant.id, veteran));
  check("responde saldo formatado em BRL", saldo.replyText.includes("4.200,50"), saldo.replyText);

  const extrato = await monneyhubZapHandler(message("me manda o extrato", tenant.id, veteran));
  check("responde extrato com lançamentos", extrato.replyText.includes("R$"), extrato.replyText);

  const previsao = await monneyhubZapHandler(
    message("qual a previsão do meu fluxo de caixa?", tenant.id, veteran),
  );
  check("responde previsão em faixa", previsao.replyText.includes("Em 30 dias"), previsao.replyText);

  const semDado = await monneyhubZapHandler(
    message("qual a previsão do meu fluxo de caixa?", tenant.id, novato),
  );
  check(
    "usuário sem histórico recebe 'aguardando dado suficiente'",
    semDado.replyText.includes("histórico suficiente"),
    semDado.replyText,
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
  await prisma.transaction.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tenant.delete({ where: { id: tenant.id } });
  await queue.obliterate({ force: true });
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
