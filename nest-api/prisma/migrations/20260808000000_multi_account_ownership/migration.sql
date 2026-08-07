-- COS-457 — every workspace gets an owner.
--
-- Hand-written rather than generated: `ownerId` is NOT NULL on five tables that
-- already hold rows, so the generated version ("cannot add a required column to
-- a non-empty table") would refuse. The three-step add-nullable / backfill /
-- enforce below is what makes it survivable on a database with data in it.
--
-- The backfill assigns everything to the oldest account, which is the account
-- that was there when these rows were global. On a database seeded the ordinary
-- way that is the only account, and this is a no-op rename of "everyone's" to
-- "theirs".

-- ---------------------------------------------------------------------------
-- 1. Add the column, nullable for now.
-- ---------------------------------------------------------------------------
ALTER TABLE `Project` ADD COLUMN `ownerId` CHAR(36) NULL;
ALTER TABLE `Issue` ADD COLUMN `ownerId` CHAR(36) NULL;
ALTER TABLE `Label` ADD COLUMN `ownerId` CHAR(36) NULL;
ALTER TABLE `SavedView` ADD COLUMN `ownerId` CHAR(36) NULL;
ALTER TABLE `ApiToken` ADD COLUMN `ownerId` CHAR(36) NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill from the founding account.
--
-- Read into a variable first: a correlated subquery against `User` inside each
-- UPDATE would be re-evaluated per row, and MySQL forbids some of those shapes
-- outright when the target table is also read.
-- ---------------------------------------------------------------------------
SET @founder := (SELECT `id` FROM `User` ORDER BY `createdAt` ASC, `id` ASC LIMIT 1);

UPDATE `Project` SET `ownerId` = @founder WHERE `ownerId` IS NULL;
UPDATE `Issue` SET `ownerId` = @founder WHERE `ownerId` IS NULL;
UPDATE `Label` SET `ownerId` = @founder WHERE `ownerId` IS NULL;
UPDATE `SavedView` SET `ownerId` = @founder WHERE `ownerId` IS NULL;
UPDATE `ApiToken` SET `ownerId` = @founder WHERE `ownerId` IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Enforce NOT NULL.
--
-- On an unseeded database `@founder` is NULL, but so is the row count, so these
-- succeed on empty tables. On a seeded one holding data with no User row at all
-- they fail loudly — which is the correct outcome: that database has orphaned
-- content and no owner to give it to.
-- ---------------------------------------------------------------------------
ALTER TABLE `Project` MODIFY `ownerId` CHAR(36) NOT NULL;
ALTER TABLE `Issue` MODIFY `ownerId` CHAR(36) NOT NULL;
ALTER TABLE `Label` MODIFY `ownerId` CHAR(36) NOT NULL;
ALTER TABLE `SavedView` MODIFY `ownerId` CHAR(36) NOT NULL;
ALTER TABLE `ApiToken` MODIFY `ownerId` CHAR(36) NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Global uniques become per-owner.
--
-- This is the point of the migration: two accounts may each hold a `PFA`
-- project, a `bug` label and a `PFA-1` issue without colliding.
-- `ApiToken.tokenHash` deliberately stays globally unique — the guard resolves a
-- token by hash before it knows whose it is.
-- ---------------------------------------------------------------------------
DROP INDEX `Project_key_key` ON `Project`;
DROP INDEX `Label_name_key` ON `Label`;
DROP INDEX `Issue_identifier_key` ON `Issue`;
DROP INDEX `Issue_legacyIdentifier_key` ON `Issue`;

CREATE UNIQUE INDEX `Project_ownerId_key_key` ON `Project`(`ownerId`, `key`);
CREATE UNIQUE INDEX `Label_ownerId_name_key` ON `Label`(`ownerId`, `name`);
CREATE UNIQUE INDEX `Issue_ownerId_identifier_key` ON `Issue`(`ownerId`, `identifier`);
CREATE UNIQUE INDEX `Issue_ownerId_legacyIdentifier_key` ON `Issue`(`ownerId`, `legacyIdentifier`);

CREATE INDEX `SavedView_ownerId_idx` ON `SavedView`(`ownerId`);
CREATE INDEX `ApiToken_ownerId_idx` ON `ApiToken`(`ownerId`);

-- ---------------------------------------------------------------------------
-- 5. Foreign keys.
--
-- ON DELETE CASCADE throughout: deleting an account takes its workspace with
-- it, rather than leaving rows nothing can reach.
-- ---------------------------------------------------------------------------
ALTER TABLE `Project` ADD CONSTRAINT `Project_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Label` ADD CONSTRAINT `Label_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ApiToken` ADD CONSTRAINT `ApiToken_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
