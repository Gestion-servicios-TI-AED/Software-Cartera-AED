-- CreateTable
CREATE TABLE "MovimientoFiduciario" (
    "id" TEXT NOT NULL,
    "encargId" TEXT NOT NULL,
    "hojaId" TEXT NOT NULL,
    "nombreHoja" TEXT NOT NULL,
    "propietario" TEXT,
    "datos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoFiduciario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoFiduciario_encargId_idx" ON "MovimientoFiduciario"("encargId");

-- CreateIndex
CREATE INDEX "MovimientoFiduciario_propietario_idx" ON "MovimientoFiduciario"("propietario");

-- CreateIndex
CREATE INDEX "MovimientoFiduciario_encargId_propietario_idx" ON "MovimientoFiduciario"("encargId", "propietario");

-- AddForeignKey
ALTER TABLE "MovimientoFiduciario" ADD CONSTRAINT "MovimientoFiduciario_encargId_fkey" FOREIGN KEY ("encargId") REFERENCES "EncargFiduciario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoFiduciario" ADD CONSTRAINT "MovimientoFiduciario_hojaId_fkey" FOREIGN KEY ("hojaId") REFERENCES "HojaFiduciaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
