import { Repository, FindOptionsWhere } from 'typeorm';
import { JobEntity } from '../entities/job.entity';
import { JobStatus } from '../../shared/enums/job-status.enum';
import { ICreateJobPayload } from '../../shared/interfaces/job.interface';
import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_MAX_ATTEMPTS } from '../../shared/constants';
import { JobPriority } from '../../shared/enums/job-priority.enum';
import { AppDataSource } from '../data-source';

export class JobRepository {
	private get repository(): Repository<JobEntity> {
		return AppDataSource.getRepository(JobEntity);
	}

	async createJob(data: ICreateJobPayload): Promise<JobEntity> {
		const job = this.repository.create({
			id: uuidv4(),
			type: data.type,
			payload: data.payload,
			idempotencyKey: data.idempotencyKey,
			priority: data.priority ?? JobPriority.NORMAL,
			maxAttempts: data.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
			delay: data.delay,
			status: JobStatus.QUEUED,
			attempts: 0,
		});

		return this.repository.save(job);
	}

	async findByIdempotencyKey(key: string): Promise<JobEntity | null> {
		return this.repository.findOne({ where: { idempotencyKey: key } });
	}

	async findById(id: string): Promise<JobEntity | null> {
		return this.repository.findOne({ where: { id } });
	}

	async findRecent(limit = 50, status?: JobStatus): Promise<JobEntity[]> {
		const where: FindOptionsWhere<JobEntity> = status ? { status } : {};
		return this.repository.find({
			where,
			order: { createdAt: 'DESC' },
			take: limit,
		});
	}

	async getStats(): Promise<{
		queued: number;
		processing: number;
		completed: number;
		failed: number;
		dead_letter: number;
		total: number;
	}> {
		const rawCounts = await this.repository
			.createQueryBuilder('job')
			.select('job.status', 'status')
			.addSelect('COUNT(*)', 'count')
			.groupBy('job.status')
			.getRawMany();

		const stats = {
			queued: 0,
			processing: 0,
			completed: 0,
			failed: 0,
			dead_letter: 0,
			total: 0,
		};

		for (const row of rawCounts) {
			const count = parseInt(row.count, 10);
			stats.total += count;
			if (row.status === JobStatus.QUEUED) stats.queued = count;
			else if (row.status === JobStatus.PROCESSING) stats.processing = count;
			else if (row.status === JobStatus.COMPLETED) stats.completed = count;
			else if (row.status === JobStatus.FAILED) stats.failed = count;
			else if (row.status === JobStatus.DEAD_LETTER) stats.dead_letter = count;
		}

		return stats;
	}

	async updateStatus(id: string, status: JobStatus, options?: { error?: string; processedAt?: Date; completedAt?: Date }): Promise<void> {
		await this.repository.update(id, {
			status,
			...options,
		});
	}

	async incrementAttempts(id: string): Promise<void> {
		await this.repository.increment({ id }, 'attempts', 1);
	}

	async markAsProcessing(id: string): Promise<void> {
		await this.repository.update(id, {
			status: JobStatus.PROCESSING,
			processedAt: new Date(),
		});
	}

	async markAsCompleted(id: string): Promise<void> {
		await this.repository.update(id, {
			status: JobStatus.COMPLETED,
			completedAt: new Date(),
		});
	}

	async markAsFailed(id: string, error: string): Promise<void> {
		await this.repository.update(id, {
			status: JobStatus.FAILED,
			error,
		});
	}

	async markAsDeadLetter(id: string, error: string): Promise<void> {
		await this.repository.update(id, {
			status: JobStatus.DEAD_LETTER,
			error,
		});
	}
}

export const jobRepository = new JobRepository();
