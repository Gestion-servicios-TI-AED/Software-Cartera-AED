-- CreateTable
CREATE TABLE "ResumenCarteraMensual" (
    "id" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumenCarteraMensual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumenCarteraMensual_mes_key" ON "ResumenCarteraMensual"("mes");
