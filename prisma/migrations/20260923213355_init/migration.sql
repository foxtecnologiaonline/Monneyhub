-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "memory";

-- CreateEnum
CREATE TYPE "memory"."MemoryKind" AS ENUM ('PREFERENCE', 'FACT', 'INTERACTION');

-- CreateTable
CREATE TABLE "core"."Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsappPhoneNumberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory"."MemoryEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "memory"."MemoryKind" NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."Transaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."ForecastRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "horizons" JSONB NOT NULL,
    "historyMonths" DECIMAL(6,2) NOT NULL,
    "mape" DECIMAL(8,2),
    "alertLeadDays" INTEGER,
    "alertAtDay" INTEGER,
    "exportKey" TEXT,

    CONSTRAINT "ForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_whatsappPhoneNumberId_key" ON "core"."Tenant"("whatsappPhoneNumberId");

-- CreateIndex
CREATE INDEX "MemoryEntry_tenantId_userId_idx" ON "memory"."MemoryEntry"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryEntry_tenantId_userId_kind_key_key" ON "memory"."MemoryEntry"("tenantId", "userId", "kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_userId_key" ON "finance"."Account"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_occurredAt_idx" ON "finance"."Transaction"("accountId", "occurredAt");

-- CreateIndex
CREATE INDEX "ForecastRun_tenantId_userId_runAt_idx" ON "finance"."ForecastRun"("tenantId", "userId", "runAt");

-- AddForeignKey
ALTER TABLE "finance"."Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

