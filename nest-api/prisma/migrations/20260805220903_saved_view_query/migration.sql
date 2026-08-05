/*
  Warnings:

  - You are about to drop the column `filters` on the `SavedView` table. All the data in the column will be lost.
  - You are about to drop the column `groupBy` on the `SavedView` table. All the data in the column will be lost.
  - You are about to drop the column `orderBy` on the `SavedView` table. All the data in the column will be lost.
  - Added the required column `query` to the `SavedView` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SavedView` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `SavedView` DROP COLUMN `filters`,
    DROP COLUMN `groupBy`,
    DROP COLUMN `orderBy`,
    ADD COLUMN `query` VARCHAR(2000) NOT NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- RenameIndex
ALTER TABLE `Issue` RENAME INDEX `Issue_title_description_ft` TO `Issue_title_description_idx`;
