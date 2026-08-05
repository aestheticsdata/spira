-- Full-text search over issue prose. Prisma's schema language cannot express a
-- MySQL FULLTEXT index, so it is added here by hand and the search service
-- queries it with MATCH … AGAINST via $queryRaw.
--
-- Identifier lookups deliberately do NOT go through this index: they are exact
-- matches on two uniquely-indexed columns and must rank above any text hit.
CREATE FULLTEXT INDEX `Issue_title_description_ft` ON `Issue` (`title`, `description`);
