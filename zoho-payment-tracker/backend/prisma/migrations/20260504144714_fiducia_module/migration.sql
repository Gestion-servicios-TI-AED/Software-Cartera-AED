-- CreateTable
CREATE TABLE "EncargFiduciario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "archivoNombre" TEXT NOT NULL,
    "emailId" TEXT,
    "emailAsunto" TEXT,
    "emailFecha" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncargFiduciario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HojaFiduciaria" (
    "id" TEXT NOT NULL,
    "encargId" TEXT NOT NULL,
    "nombreHoja" TEXT NOT NULL,
    "columnas" JSONB NOT NULL,
    "filas" JSONB NOT NULL,
    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HojaFiduciaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncargFiduciario_codigo_idx" ON "EncargFiduciario"("codigo");

-- CreateIndex
CREATE INDEX "HojaFiduciaria_encargId_idx" ON "HojaFiduciaria"("encargId");

-- AddForeignKey
ALTER TABLE "HojaFiduciaria" ADD CONSTRAINT "HojaFiduciaria_encargId_fkey" FOREIGN KEY ("encargId") REFERENCES "EncargFiduciario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
