-- Agrega granularidad de Piso a ConfiguracionFrente (antes solo Frente+Torre).
-- Se borran las filas existentes porque todas tenían fechaEntrega = null
-- (quedaron de pruebas anteriores) -- no hay datos reales que preservar.
DELETE FROM "ConfiguracionFrente";

-- DropIndex
DROP INDEX "ConfiguracionFrente_frente_torre_key";

-- AlterTable
ALTER TABLE "ConfiguracionFrente" ADD COLUMN     "piso" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionFrente_frente_torre_piso_key" ON "ConfiguracionFrente"("frente", "torre", "piso");
