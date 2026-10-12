-- Proof of consent is kept after the account it belonged to is deleted.
ALTER TABLE "consents" DROP CONSTRAINT "consents_account_id_accounts_id_fk";
