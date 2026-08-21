-- Browse-by-genre and browse-by-tag look up the join tables by the RIGHT-hand
-- column (category_id / tag_id). Those tables' composite primary keys lead on
-- game_id, and a btree cannot serve a predicate on a non-leading column, so
-- both queries seq-scanned the whole join table.
--
-- IF NOT EXISTS because this database has hand-written migrations whose
-- snapshots were never recorded; re-running must stay safe.
CREATE INDEX IF NOT EXISTS "game_categories_category_idx" ON "game_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_tags_tag_idx" ON "game_tags" USING btree ("tag_id");
