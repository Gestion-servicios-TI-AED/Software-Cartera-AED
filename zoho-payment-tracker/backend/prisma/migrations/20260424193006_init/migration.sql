-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "zohoId" TEXT NOT NULL,
    "dealName" TEXT NOT NULL,
    "stage" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "contactId" TEXT,
    "accountName" TEXT,
    "referenciaRecaudo" TEXT,
    "pagoSeparacion" TIMESTAMP(3),
    "camposFinancieros" JSONB,
    "seccionInmueble" JSONB,
    "seccionCotizacion" JSONB,
    "formaPago" TEXT,
    "propuestaPago" TEXT,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZohoFieldMetadata" (
    "id" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "sectionName" TEXT,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZohoFieldMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "recordsSync" INTEGER NOT NULL DEFAULT 0,
    "errorMsg" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_zohoId_key" ON "Opportunity"("zohoId");

-- CreateIndex
CREATE UNIQUE INDEX "ZohoFieldMetadata_apiName_key" ON "ZohoFieldMetadata"("apiName");
