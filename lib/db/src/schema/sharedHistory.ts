import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sharedHistoryTable = pgTable("shared_history", {
  id: serial("id").primaryKey(),
  moduleName: text("module_name").notNull(),
  problemName: text("problem_name").notNull(),
  keyResultValues: jsonb("key_result_values").notNull(),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSharedHistorySchema = createInsertSchema(sharedHistoryTable).omit({
  id: true,
  savedAt: true,
});

export type InsertSharedHistory = z.infer<typeof insertSharedHistorySchema>;
export type SharedHistory = typeof sharedHistoryTable.$inferSelect;