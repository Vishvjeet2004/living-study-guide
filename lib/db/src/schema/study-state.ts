import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const studyStateTable = pgTable("study_state", {
  userId: text("user_id").primaryKey(),
  state: jsonb("state").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
