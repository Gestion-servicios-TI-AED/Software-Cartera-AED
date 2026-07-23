-- CreateTable
CREATE TABLE "ConfiguracionFrente" (
    "id" TEXT NOT NULL,
    "frente" TEXT NOT NULL,
    "fechaEntrega" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionFrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionFrente_frente_key" ON "ConfiguracionFrente"("frente");

-- CreateIndex (drift pendiente de una migración anterior -- verificado sin
-- duplicados ni nulos en NegocioMovimiento.idMovimiento antes de aplicar)
CREATE UNIQUE INDEX IF NOT EXISTS "NegocioMovimiento_idMovimiento_key" ON "NegocioMovimiento"("idMovimiento");
