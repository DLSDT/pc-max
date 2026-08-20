-- Tauri's updater verifies each release with a detached minisign signature
-- (the `.sig` file emitted next to the installer when TAURI_SIGNING_PRIVATE_KEY
-- is set). Without it the client refuses the update, so the updater feed needs
-- somewhere to store it.
ALTER TABLE "app_versions" ADD COLUMN IF NOT EXISTS "signature" text;
