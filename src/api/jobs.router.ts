import { Router } from 'express';
import { jobsController } from './jobs.controller';

const router = Router();

router.get('/', jobsController.getJobs);
router.get('/stats', jobsController.getStats);
router.get('/:id', jobsController.getJobStatus);
router.post('/', jobsController.createJob);

export { router as jobsRouter };
