import { JobRepository, jobRepository } from '../database/repositories/job.repository';
import { QueueService, queueService } from '../queue/queue.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { ICreateJobPayload } from '../shared/interfaces/job.interface';
import { JobStatus } from '../shared/enums/job-status.enum';
import { logger } from '../logger';

export class NotFoundError extends Error {
	readonly statusCode = 404;
	constructor(message: string) {
		super(message);
		this.name = 'NotFoundError';
	}
}

export class JobsService {
	constructor(
		private readonly jobRepo: JobRepository = jobRepository,
		private readonly queue: QueueService = queueService
	) {}

	async createJob(dto: CreateJobDto): Promise<JobResponseDto> {
		// Check idempotency
		if (dto.idempotencyKey) {
			const existing = await this.jobRepo.findByIdempotencyKey(dto.idempotencyKey);
			if (existing) {
				logger.info(`Idempotent request detected: ${dto.idempotencyKey}, returning existing job ${existing.id}`);
				return this.mapToResponse(existing);
			}
		}

		// Create job in database first (source of truth)
		const payload: ICreateJobPayload = {
			type: dto.type,
			payload: dto.payload,
			idempotencyKey: dto.idempotencyKey,
			priority: dto.priority,
			maxAttempts: dto.maxAttempts,
			delay: dto.delay,
		};

		const job = await this.jobRepo.createJob(payload);

		// Add to queue
		try {
			await this.queue.addJob(job.id, job.type, job.payload, {
				priority: job.priority,
				delay: job.delay,
				maxAttempts: job.maxAttempts,
			});
		} catch (error: any) {
			logger.error(`Failed to add job ${job.id} to queue: ${error.message}`);
			// Job exists in DB but not in queue - could be handled by a reconciliation process
			throw error;
		}

		logger.info(`Job ${job.id} created and queued`);
		return this.mapToResponse(job);
	}

	async getJobStatus(jobId: string): Promise<JobResponseDto> {
		const job = await this.jobRepo.findById(jobId);
		if (!job) {
			throw new NotFoundError(`Job ${jobId} not found`);
		}
		return this.mapToResponse(job);
	}

	async getRecentJobs(limit = 50, status?: string): Promise<JobResponseDto[]> {
		const jobStatus = status && Object.values(JobStatus).includes(status as JobStatus)
			? (status as JobStatus)
			: undefined;
		const jobs = await this.jobRepo.findRecent(limit, jobStatus);
		return jobs.map((job) => this.mapToResponse(job));
	}

	async getStats(): Promise<{
		queued: number;
		processing: number;
		completed: number;
		failed: number;
		dead_letter: number;
		total: number;
	}> {
		return this.jobRepo.getStats();
	}

	private mapToResponse(job: any): JobResponseDto {
		return {
			id: job.id,
			type: job.type,
			status: job.status,
			priority: job.priority,
			attempts: job.attempts,
			maxAttempts: job.maxAttempts,
			createdAt: job.createdAt,
			updatedAt: job.updatedAt,
			processedAt: job.processedAt,
			completedAt: job.completedAt,
			error: job.error,
			payload: job.payload,
			idempotencyKey: job.idempotencyKey,
			delay: job.delay,
		};
	}
}

export const jobsService = new JobsService();
