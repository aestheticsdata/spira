-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `username` VARCHAR(60) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Project` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(5) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `icon` VARCHAR(40) NULL,
    `color` VARCHAR(9) NULL,
    `summary` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `statusId` CHAR(36) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `startDate` DATETIME(3) NULL,
    `targetDate` DATETIME(3) NULL,
    `issueCounter` INTEGER NOT NULL DEFAULT 0,
    `position` INTEGER NOT NULL DEFAULT 0,
    `archivedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Project_key_key`(`key`),
    INDEX `Project_statusId_idx`(`statusId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkflowState` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(40) NOT NULL,
    `type` VARCHAR(12) NOT NULL,
    `color` VARCHAR(9) NOT NULL,
    `position` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Label` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `color` VARCHAR(9) NOT NULL,

    UNIQUE INDEX `Label_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Issue` (
    `id` CHAR(36) NOT NULL,
    `projectId` CHAR(36) NOT NULL,
    `number` INTEGER NOT NULL,
    `identifier` VARCHAR(20) NOT NULL,
    `legacyIdentifier` VARCHAR(20) NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `stateId` CHAR(36) NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isEpic` BOOLEAN NOT NULL DEFAULT false,
    `epicId` CHAR(36) NULL,
    `sortOrder` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `archivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Issue_identifier_key`(`identifier`),
    UNIQUE INDEX `Issue_legacyIdentifier_key`(`legacyIdentifier`),
    INDEX `Issue_stateId_idx`(`stateId`),
    INDEX `Issue_epicId_idx`(`epicId`),
    INDEX `Issue_projectId_sortOrder_idx`(`projectId`, `sortOrder`),
    UNIQUE INDEX `Issue_projectId_number_key`(`projectId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueLabel` (
    `issueId` CHAR(36) NOT NULL,
    `labelId` CHAR(36) NOT NULL,

    INDEX `IssueLabel_labelId_idx`(`labelId`),
    PRIMARY KEY (`issueId`, `labelId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IssueRelation` (
    `id` CHAR(36) NOT NULL,
    `fromIssueId` CHAR(36) NOT NULL,
    `toIssueId` CHAR(36) NOT NULL,
    `type` VARCHAR(12) NOT NULL,

    INDEX `IssueRelation_toIssueId_idx`(`toIssueId`),
    UNIQUE INDEX `IssueRelation_fromIssueId_toIssueId_type_key`(`fromIssueId`, `toIssueId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedView` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `icon` VARCHAR(40) NULL,
    `projectId` CHAR(36) NULL,
    `filters` JSON NOT NULL,
    `groupBy` VARCHAR(20) NOT NULL,
    `orderBy` VARCHAR(20) NOT NULL,
    `position` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedView_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiToken` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ApiToken_tokenHash_key`(`tokenHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` CHAR(36) NOT NULL,
    `issueId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `body` TEXT NOT NULL,
    `authorName` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Comment_issueId_idx`(`issueId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Project` ADD CONSTRAINT `Project_statusId_fkey` FOREIGN KEY (`statusId`) REFERENCES `WorkflowState`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_stateId_fkey` FOREIGN KEY (`stateId`) REFERENCES `WorkflowState`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Issue` ADD CONSTRAINT `Issue_epicId_fkey` FOREIGN KEY (`epicId`) REFERENCES `Issue`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueLabel` ADD CONSTRAINT `IssueLabel_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueLabel` ADD CONSTRAINT `IssueLabel_labelId_fkey` FOREIGN KEY (`labelId`) REFERENCES `Label`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueRelation` ADD CONSTRAINT `IssueRelation_fromIssueId_fkey` FOREIGN KEY (`fromIssueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IssueRelation` ADD CONSTRAINT `IssueRelation_toIssueId_fkey` FOREIGN KEY (`toIssueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedView` ADD CONSTRAINT `SavedView_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_issueId_fkey` FOREIGN KEY (`issueId`) REFERENCES `Issue`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
