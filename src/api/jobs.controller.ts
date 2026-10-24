import { Request, Response, NextFunction } from 'express';
import { JobsService, jobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';

export class JobsController {
	constructor(private readonly service: JobsService = jobsService) {}

	createJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const dto: CreateJobDto = req.body;
			if (!dto || !dto.type || !dto.payload) {
				res.status(400).json({ statusCode: 400, message: 'type and payload are required' });
				return;
			}
			const result = await this.service.createJob(dto);
			res.status(201).json(result);
		} catch (error) {
			next(error);
		}
	};

	getJobStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const { id } = req.params;
			const result = await this.service.getJobStatus(id);
			res.status(200).json(result);
		} catch (error) {
			next(error);
		}
	};

	getJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
			const status = req.query.status as string | undefined;
			const result = await this.service.getRecentJobs(limit, status);
			res.status(200).json(result);
		} catch (error) {
			next(error);
		}
	};

	getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		try {
			const result = await this.service.getStats();
			res.status(200).json(result);
		} catch (error) {
			next(error);
		}
	};
}

export const jobsController = new JobsController();
