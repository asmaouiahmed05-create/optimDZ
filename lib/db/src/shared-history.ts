import { desc } from "drizzle-orm";
import { db } from "./index";
import { sharedHistoryTable, type InsertSharedHistory } from "./schema";

const MAX_SHARED_HISTORY_LIMIT = 100;

export async function writeSharedHistoryRecord(input: InsertSharedHistory) {
  const [record] = await db.insert(sharedHistoryTable).values(input).returning();
  return record;
}

export async function readSharedHistoryRecords(limit = MAX_SHARED_HISTORY_LIMIT) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_SHARED_HISTORY_LIMIT);
  return db
    .select()
    .from(sharedHistoryTable)
    .orderBy(desc(sharedHistoryTable.savedAt))
    .limit(safeLimit);
}