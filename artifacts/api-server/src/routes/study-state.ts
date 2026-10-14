import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  studyStateTable,
} from "@workspace/db";
import {
  LoadStudyStateResponse,
  MigrateStudyStateBody,
  MigrateStudyStateResponse,
  SaveStudyStateBody,
  SaveStudyStateResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/study-state", async (req, res): Promise<void> => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [record] = await db
    .select()
    .from(studyStateTable)
    .where(eq(studyStateTable.userId, userId))
    .limit(1);

  res.json(
    LoadStudyStateResponse.parse({
      state: record?.state ?? null,
      updatedAt: record?.updatedAt.toISOString() ?? null,
    }),
  );
});

router.post("/study-state", async (req, res): Promise<void> => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = MigrateStudyStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid study state" });
    return;
  }

  const [created] = await db
    .insert(studyStateTable)
    .values({ userId, state: parsed.data.state })
    .onConflictDoNothing({ target: studyStateTable.userId })
    .returning();

  const [record] = created
    ? [created]
    : await db
        .select()
        .from(studyStateTable)
        .where(eq(studyStateTable.userId, userId))
        .limit(1);

  if (!record) {
    res.status(500).json({ error: "Unable to initialize study state" });
    return;
  }

  res.json(
    MigrateStudyStateResponse.parse({
      state: record.state,
      updatedAt: record.updatedAt.toISOString(),
      migrated: Boolean(created),
    }),
  );
});

router.put("/study-state", async (req, res): Promise<void> => {
  const userId = req.authUserId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = SaveStudyStateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid study state" });
    return;
  }

  const [record] = await db
    .update(studyStateTable)
    .set({ state: parsed.data.state, updatedAt: new Date() })
    .where(eq(studyStateTable.userId, userId))
    .returning();

  if (!record) {
    res.status(409).json({ error: "Study state has not been initialized" });
    return;
  }

  res.json(
    SaveStudyStateResponse.parse({
      state: record.state,
      updatedAt: record.updatedAt.toISOString(),
    }),
  );
});

export default router;
