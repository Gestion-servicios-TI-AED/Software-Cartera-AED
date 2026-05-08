/*
  Warnings:

  - The `formaPago` column on the `Opportunity` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `propuestaPago` column on the `Opportunity` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Opportunity" DROP COLUMN "formaPago",
ADD COLUMN     "formaPago" JSONB,
DROP COLUMN "propuestaPago",
ADD COLUMN     "propuestaPago" JSONB;
