-- Add saldoActual to Negocio (derived field for fast filtering)
ALTER TABLE "Negocio" ADD COLUMN IF NOT EXISTS "saldoActual" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Negocio_saldoActual_idx" ON "Negocio"("saldoActual");

-- Add fechaContable to NegocioMovimiento (for chronological ordering)
ALTER TABLE "NegocioMovimiento" ADD COLUMN IF NOT EXISTS "fechaContable" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "NegocioMovimiento_fechaContable_idx" ON "NegocioMovimiento"("fechaContable");
