import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyStateRouter from "./study-state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyStateRouter);

export default router;
