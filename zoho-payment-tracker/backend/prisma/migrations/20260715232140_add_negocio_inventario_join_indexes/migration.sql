-- Indices de soporte para el LEFT JOIN LATERAL InventarioItem <-> Negocio
-- (listarNegociosInventario, Task 2 del plan "todos los inmuebles en
-- Negocios"). Sin estos indices, cada consulta a GET /api/negocios hace un
-- escaneo completo de Negocio por cada InventarioItem (~1936 x ~979 filas)
-- porque el join usa un OR entre dos rutas de match (referencia directa y
-- Nomenclatura/Codigo de inmueble) que Postgres no puede resolver con un
-- solo indice compuesto.
CREATE INDEX IF NOT EXISTS "Negocio_nomenclatura_idx"
  ON "Negocio" ((datos->>'Nomenclatura'));

CREATE INDEX IF NOT EXISTS "InventarioItem_referenciaRecaudo_idx"
  ON "InventarioItem" ("referenciaRecaudo");

CREATE INDEX IF NOT EXISTS "InventarioItem_codigoInmueble_idx"
  ON "InventarioItem" ((datos->>'C_digo_inmueble'));
