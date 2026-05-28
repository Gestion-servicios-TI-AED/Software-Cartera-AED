-- CreateTable
CREATE TABLE "Negocio" (
    "id" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "estado" TEXT,
    "datos" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegocioComprador" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NegocioComprador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegocioMovimiento" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegocioMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Negocio_referencia_key" ON "Negocio"("referencia");

-- CreateIndex
CREATE INDEX "Negocio_estado_idx" ON "Negocio"("estado");

-- CreateIndex
CREATE INDEX "NegocioComprador_negocioId_idx" ON "NegocioComprador"("negocioId");

-- CreateIndex
CREATE INDEX "NegocioComprador_nombre_idx" ON "NegocioComprador"("nombre");

-- CreateIndex
CREATE INDEX "NegocioMovimiento_negocioId_idx" ON "NegocioMovimiento"("negocioId");

-- CreateIndex
CREATE INDEX "NegocioMovimiento_referencia_idx" ON "NegocioMovimiento"("referencia");

-- AddForeignKey
ALTER TABLE "NegocioComprador" ADD CONSTRAINT "NegocioComprador_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegocioMovimiento" ADD CONSTRAINT "NegocioMovimiento_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
