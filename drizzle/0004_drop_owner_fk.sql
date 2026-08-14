-- Repositories can be owned by organizations (ownerType='organization',
-- ownerId = organization id). The original owner_id FK to users prevented
-- org-owned repos entirely; the app enforces ownership via ownerType.
ALTER TABLE "repositories" DROP CONSTRAINT IF EXISTS "repositories_owner_id_users_id_fk";
