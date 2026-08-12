import { Router } from "express";
import {
  readSharedHistoryRecords,
  writeSharedHistoryRecord,
} from "@workspace/db";
import {
  CreateSharedHistoryBody,
  CreateSharedHistoryResponse,
  ListSharedHistoryQueryParams,
  ListSharedHistoryResponse,
} from "@workspace/api-zod";

const router = Router();

function serializeSharedHistoryRecord(record: Awaited<ReturnType<typeof writeSharedHistoryRecord>>) {
  return {
    ...record,
    savedAt: record.savedAt.toISOString(),
  };
}

router.get("/", async (req, res): Promise<void> => {
  const params = ListSharedHistoryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  try {
    const records = await readSharedHistoryRecords(params.data.limit);
    res.json(ListSharedHistoryResponse.parse(records.map(serializeSharedHistoryRecord)));
  } catch (err) {
    req.log.error({ err }, "List shared history error");
    res.status(500).json({ error: "Failed to list shared history." });
  }
});

router.post("/", async (req, res): Promise<void> => {
  const parsed = CreateSharedHistoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [record] = await Promise.all([writeSharedHistoryRecord(parsed.data)]);
    res.status(201).json(CreateSharedHistoryResponse.parse(serializeSharedHistoryRecord(record)));
  } catch (err) {
    req.log.error({ err }, "Write shared history error");
    res.status(500).json({ error: "Failed to write shared history." });
  }
});

export default router;