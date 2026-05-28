-- Add nroId (cédula) to NegocioComprador
ALTER TABLE "NegocioComprador" ADD COLUMN IF NOT EXISTS "nroId" TEXT;

-- Add idMovimiento (dedup key) to NegocioMovimiento
ALTER TABLE "NegocioMovimiento" ADD COLUMN IF NOT EXISTS "idMovimiento" TEXT;

-- Unique index on idMovimiento (partial — only when not null)
CREATE UNIQUE INDEX IF NOT EXISTS "NegocioMovimiento_idMovimiento_key"
  ON "NegocioMovimiento"("idMovimiento")
  WHERE "idMovimiento" IS NOT NULL;
