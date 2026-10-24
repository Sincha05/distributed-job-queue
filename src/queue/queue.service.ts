import { Queue, Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { QUEUE_NAMES, DEFAULT_BACKOFF_BASE_DELAY, JOB_TIMEOUT } from '../shared/constants';
import { JobRepository, jobRepository } from '../database/repositories/job.repository';
import { config } from '../config';
import { logger } from '../logger';

export interface QueueJobData {
	jobId: string;
	type: string;
	payload: Record<string, any>;
	attempts: number;
	maxAttempts: number;
}

export class QueueService {
	private mainQueue!: Queue<QueueJobData>;
	private dlQueue!: Queue<QueueJobData>;
	private connection!: Redis;

	constructor(private readonly jobRepo: JobRepository = jobRepository) {}

	async init(): Promise<void> {
		const redisUrl = config.redis.url;

		this.connection = redisUrl
			? new Redis(redisUrl, { maxRetriesPerRequest: null })
			: new Redis({
					host: config.redis.host,
					port: config.redis.port,
					maxRetriesPerRequest: null,
				});

		this.mainQueue = new Queue<QueueJobData>(QUEUE_NAMES.MAIN, {
			connection: this.connection,
		});

		this.dlQueue = new Queue<QueueJobData>(QUEUE_NAMES.DLQ, {
			connection: this.connection,
		});

		logger.info('Queue service initialized');
	}

	async close(): Promise<void> {
		if (this.mainQueue) {
			await this.mainQueue.close();
		}
		if (this.dlQueue) {
			await this.dlQueue.close();
		}
		if (this.connection) {
			await this.connection.quit();
		}
		logger.info('Queue service destroyed');
	}

	async addJob(
		jobId: string,
		type: string,
		payload: Record<string, any>,
		options: {
			priority?: number;
			delay?: number;
			maxAttempts?: number;
		} = {}
	): Promise<void> {
		const jobData: QueueJobData = {
			jobId,
			type,
			payload,
			attempts: 0,
			maxAttempts: options.maxAttempts ?? 10,
		};

		await this.mainQueue.add(type, jobData, {
			jobId,
			priority: options.priority,
			delay: options.delay,
			removeOnComplete: {
				age: 3600,
				count: 1000,
			},
			removeOnFail: {
				age: 86400,
			},
		});

		logger.info(`Job ${jobId} added to queue`);
	}

	async moveToDLQ(job: Job<QueueJobData>, error: string): Promise<void> {
		await this.dlQueue.add(`dlq-${job.data.type}`, job.data, {
			priority: 1,
		});

		await this.jobRepo.markAsDeadLetter(job.data.jobId, error);
		logger.warn(`Job ${job.data.jobId} moved to DLQ: ${error}`);
	}

	async retryJob(job: Job<QueueJobData>, attemptNumber: number): Promise<void> {
		const backoffDelay = this.calculateBackoff(attemptNumber);

		await this.jobRepo.incrementAttempts(job.data.jobId);

		const updatedJobData: QueueJobData = {
			...job.data,
			attempts: attemptNumber + 1,
		};

		await this.mainQueue.add(job.data.type, updatedJobData, {
			jobId: `${job.data.jobId}-retry-${attemptNumber}`,
			delay: backoffDelay,
			priority: job.opts.priority,
		});

		logger.info(`Job ${job.data.jobId} scheduled for retry ${attemptNumber + 1} with ${backoffDelay}ms delay`);
	}

	private calculateBackoff(attemptNumber: number): number {
		return DEFAULT_BACKOFF_BASE_DELAY * Math.pow(2, attemptNumber);
	}

	createWorker(processor: (job: Job<QueueJobData>) => Promise<void>): Worker<QueueJobData> {
		const worker = new Worker<QueueJobData>(QUEUE_NAMES.MAIN, processor, {
			connection: this.connection,
			concurrency: config.worker.concurrency,
			lockDuration: JOB_TIMEOUT,
			lockRenewTime: JOB_TIMEOUT / 2,
		});

		worker.on('completed', (job) => {
			logger.info(`Job ${job.data.jobId} completed`);
		});

		worker.on('failed', (job, err) => {
			logger.error(`Job ${job?.data?.jobId} failed: ${err.message}`);
		});

		return worker;
	}

	async getJobStatus(jobId: string): Promise<Job<QueueJobData> | null> {
		const job = await this.mainQueue.getJob(jobId);
		return job ?? null;
	}

	getMainQueue(): Queue<QueueJobData> {
		return this.mainQueue;
	}

	getDLQueue(): Queue<QueueJobData> {
		return this.dlQueue;
	}
}

export const queueService = new QueueService();
