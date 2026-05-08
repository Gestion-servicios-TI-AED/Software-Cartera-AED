-- CreateTable
CREATE TABLE "PagoMovimiento" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT,
    "emailId" TEXT NOT NULL,
    "emailSubject" TEXT,
    "emailFecha" TIMESTAMP(3),
    "archivoNombre" TEXT,
    "referencia" TEXT,
    "datos" JSONB NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSyncLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "emailsProcessed" INTEGER NOT NULL DEFAULT 0,
    "movimientosCreados" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,

    CONSTRAINT "EmailSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoMovimiento_opportunityId_idx" ON "PagoMovimiento"("opportunityId");

-- CreateIndex
CREATE INDEX "PagoMovimiento_referencia_idx" ON "PagoMovimiento"("referencia");

-- CreateIndex
CREATE INDEX "PagoMovimiento_emailId_idx" ON "PagoMovimiento"("emailId");

-- AddForeignKey
ALTER TABLE "PagoMovimiento" ADD CONSTRAINT "PagoMovimiento_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
