import { Job } from 'bullmq';
import { QueueService, queueService, QueueJobData } from '../../queue/queue.service';
import { JobRepository, jobRepository } from '../../database/repositories/job.repository';
import { JOB_TIMEOUT } from '../../shared/constants';
import { logger } from '../../logger';

export class JobProcessor {
	constructor(
		private readonly jobRepo: JobRepository = jobRepository,
		private readonly queue: QueueService = queueService
	) {}

	async process(job: Job<QueueJobData>): Promise<void> {
		const { jobId, type, payload, attempts, maxAttempts } = job.data;

		logger.info(`Processing job ${jobId} (type: ${type}, attempt: ${attempts + 1}/${maxAttempts})`);

		try {
			// Mark job as processing in database
			await this.jobRepo.markAsProcessing(jobId);

			// Execute actual job logic with timeout
			await this.executeJobWithTimeout(type, payload, jobId);

			// Mark as completed
			await this.jobRepo.markAsCompleted(jobId);
			logger.info(`Job ${jobId} completed successfully`);
		} catch (error) {
			await this.handleJobFailure(job, error);
		}
	}

	private async executeJobWithTimeout(type: string, payload: Record<string, any>, jobId: string): Promise<void> {
		return Promise.race([this.executeJob(type, payload), this.createTimeout(jobId)]);
	}

	private async executeJob(type: string, payload: Record<string, any>): Promise<void> {
		// Allow simulating failures for testing retries & DLQ
		if (payload && payload.shouldFail) {
			throw new Error(payload.errorMessage || 'Simulated failure from payload.shouldFail');
		}

		switch (type) {
			case 'email':
				await this.processEmailJob(payload);
				break;
			case 'data-processing':
				await this.processDataJob(payload);
				break;
			case 'webhook':
				await this.processWebhookJob(payload);
				break;
			case 'fail':
			case 'failing':
				throw new Error('Simulated failure for testing retries and DLQ');
			default:
				logger.warn(`Unknown job type: ${type}, executing default handler`);
				await this.processDefaultJob(payload);
		}
	}

	private async processEmailJob(payload: Record<string, any>): Promise<void> {
		logger.info(`Sending email to ${payload.to}`);
		await this.simulateWork(1000);
	}

	private async processDataJob(payload: Record<string, any>): Promise<void> {
		logger.info(`Processing data: ${JSON.stringify(payload)}`);
		await this.simulateWork(2000);
	}

	private async processWebhookJob(payload: Record<string, any>): Promise<void> {
		logger.info(`Calling webhook: ${payload.url}`);
		await this.simulateWork(1500);
	}

	private async processDefaultJob(payload: Record<string, any>): Promise<void> {
		logger.info(`Processing job with payload: ${JSON.stringify(payload)}`);
		await this.simulateWork(500);
	}

	private async simulateWork(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	private async createTimeout(jobId: string): Promise<never> {
		return new Promise((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Job ${jobId} timed out after ${JOB_TIMEOUT}ms`));
			}, JOB_TIMEOUT);
		});
	}

	private async handleJobFailure(job: Job<QueueJobData>, error: any): Promise<void> {
		const { jobId, attempts, maxAttempts } = job.data;
		const errorMessage = error.message || 'Unknown error';

		logger.error(`Job ${jobId} failed on attempt ${attempts + 1}: ${errorMessage}`);

		if (attempts + 1 >= maxAttempts) {
			// Max retries exceeded - move to DLQ
			await this.queue.moveToDLQ(job, errorMessage);
			logger.warn(`Job ${jobId} exceeded max retries (${maxAttempts}), moved to DLQ`);
		} else {
			// Retry with exponential backoff
			await this.queue.retryJob(job, attempts);
			await this.jobRepo.markAsFailed(jobId, errorMessage);
		}
	}
}

export const jobProcessor = new JobProcessor();
