-- Cambia la granularidad de ConfiguracionFrente de "por Frente" a "por Frente
-- + Torre" (ej. Kala Torre 1 y Kala Torre 2 pueden tener fechas distintas).
-- Se borran las filas existentes porque todas tenían fechaEntrega = null
-- (nunca se configuró una fecha real todavía) -- no hay datos que preservar.
DELETE FROM "ConfiguracionFrente";

-- DropIndex
DROP INDEX "ConfiguracionFrente_frente_key";

-- AlterTable
ALTER TABLE "ConfiguracionFrente" ADD COLUMN     "torre" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionFrente_frente_torre_key" ON "ConfiguracionFrente"("frente", "torre");
