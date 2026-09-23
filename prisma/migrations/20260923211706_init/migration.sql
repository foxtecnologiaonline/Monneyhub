-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "finance";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "memory";

-- CreateEnum
CREATE TYPE "memory"."MemoryKind" AS ENUM ('PREFERENCE', 'FACT', 'INTERACTION');

-- CreateEnum
CREATE TYPE "finance"."ForecastStatus" AS ENUM ('AWAITING_DATA', 'TRAINING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "finance"."PipelineStage" AS ENUM ('IMPORTING', 'TRAINING', 'FORECASTING', 'QUERYING', 'DONE', 'FAILED');

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
    "status" "finance"."ForecastStatus" NOT NULL,
    "historyMonths" INTEGER NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "predictorArn" TEXT,
    "forecastArn" TEXT,
    "mape" DOUBLE PRECISION,
    "failureReason" TEXT,
    "trainedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."ForecastPoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "p10" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ForecastPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance"."ForecastPipeline" (
    "id" TEXT NOT NULL,
    "stage" "finance"."PipelineStage" NOT NULL,
    "s3Path" TEXT NOT NULL,
    "importJobArn" TEXT,
    "predictorArn" TEXT,
    "forecastArn" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastPipeline_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "ForecastRun_tenantId_userId_createdAt_idx" ON "finance"."ForecastRun"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ForecastPoint_runId_date_idx" ON "finance"."ForecastPoint"("runId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastPoint_runId_date_key" ON "finance"."ForecastPoint"("runId", "date");

-- CreateIndex
CREATE INDEX "ForecastPipeline_stage_idx" ON "finance"."ForecastPipeline"("stage");

-- AddForeignKey
ALTER TABLE "finance"."Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "finance"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance"."ForecastPoint" ADD CONSTRAINT "ForecastPoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "finance"."ForecastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

