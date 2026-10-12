-- Organizers are no longer reviewed before they can publish, so nobody is left waiting.
UPDATE "organizers" SET "status" = 'active' WHERE "status" = 'pending';
