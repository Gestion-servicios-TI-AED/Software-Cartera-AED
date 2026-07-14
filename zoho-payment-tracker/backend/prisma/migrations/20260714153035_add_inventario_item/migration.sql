-- CreateTable
CREATE TABLE "InventarioItem" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "nombre" TEXT,
    "proyecto" TEXT,
    "torre" TEXT,
    "piso" TEXT,
    "categoria" TEXT,
    "estado" TEXT,
    "referenciaRecaudo" TEXT,
    "datos" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventarioItem_zohoId_key" ON "InventarioItem"("zohoId");

-- CreateIndex
CREATE INDEX "InventarioItem_proyecto_idx" ON "InventarioItem"("proyecto");

-- CreateIndex
CREATE INDEX "InventarioItem_categoria_idx" ON "InventarioItem"("categoria");

-- CreateIndex
CREATE INDEX "InventarioItem_estado_idx" ON "InventarioItem"("estado");

-- CreateIndex
CREATE INDEX "InventarioItem_referenciaRecaudo_idx" ON "InventarioItem"("referenciaRecaudo");
