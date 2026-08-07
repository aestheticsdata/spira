/*
  Warnings:

  - Added the required column `tokenSuffix` to the `ApiToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ApiToken` ADD COLUMN `tokenSuffix` VARCHAR(8) NOT NULL;
