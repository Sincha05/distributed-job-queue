import { DataSource } from 'typeorm';
import { JobEntity } from './entities/job.entity';
import { config } from '../config';
import { logger } from '../logger';

export const AppDataSource = new DataSource(
	config.database.url
		? {
				type: 'postgres',
				url: config.database.url,
				ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
				entities: [JobEntity],
				synchronize: config.database.synchronize,
				logging: config.database.logging,
			}
		: {
				type: 'postgres',
				host: config.database.host,
				port: config.database.port,
				username: config.database.username,
				password: config.database.password,
				database: config.database.database,
				ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
				entities: [JobEntity],
				synchronize: config.database.synchronize,
				logging: config.database.logging,
			}
);

export async function initializeDatabase(): Promise<DataSource> {
	if (!AppDataSource.isInitialized) {
		await AppDataSource.initialize();
		logger.info('Database initialized successfully');
	}
	return AppDataSource;
}

export async function closeDatabase(): Promise<void> {
	if (AppDataSource.isInitialized) {
		await AppDataSource.destroy();
		logger.info('Database connection closed');
	}
}
