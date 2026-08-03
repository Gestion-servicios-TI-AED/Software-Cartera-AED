-- CreateTable
CREATE TABLE "ConfiguracionApp" (
    "clave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionApp_pkey" PRIMARY KEY ("clave")
);
