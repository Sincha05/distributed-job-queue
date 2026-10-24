import { Worker } from 'bullmq';
import { QueueService, queueService, QueueJobData } from '../queue/queue.service';
import { JobProcessor, jobProcessor } from './processors/job.processor';
import { logger } from '../logger';

export class WorkerService {
	private worker?: Worker<QueueJobData>;
	private isShuttingDown = false;

	constructor(
		private readonly queue: QueueService = queueService,
		private readonly processor: JobProcessor = jobProcessor
	) {}

	async start(): Promise<void> {
		logger.info('Initializing worker service');

		this.worker = this.queue.createWorker(async (job) => {
			if (this.isShuttingDown) {
				logger.warn(`Worker shutting down, rejecting job ${job.data.jobId}`);
				throw new Error('Worker is shutting down');
			}
			await this.processor.process(job);
		});

		this.worker.on('ready', () => {
			logger.info('Worker ready to process jobs');
		});

		this.worker.on('error', (error) => {
			logger.error(`Worker error: ${error.message}`);
		});
	}

	async close(): Promise<void> {
		if (this.isShuttingDown) {
			return;
		}

		this.isShuttingDown = true;
		logger.info('Graceful shutdown initiated');

		try {
			if (this.worker) {
				await this.worker.close();
			}
			logger.info('Worker shut down gracefully');
		} catch (error: any) {
			logger.error(`Error during shutdown: ${error.message}`);
		}
	}
}

export const workerService = new WorkerService();
