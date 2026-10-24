import dotenv from 'dotenv';
dotenv.config();

const flag = (value: string | undefined, fallback: boolean): boolean => {
	if (value === undefined) return fallback;
	return value.toLowerCase() === 'true';
};

export const config = {
	port: Number(process.env.PORT) || 3000,
	workerPort: Number(process.env.WORKER_PORT) || (process.env.ROLE === 'worker' && process.env.PORT ? Number(process.env.PORT) : 3001),
	nodeEnv: process.env.NODE_ENV || 'development',
	role: process.env.ROLE,
	database: {
		url: process.env.DATABASE_URL,
		host: process.env.DB_HOST || 'localhost',
		port: Number(process.env.DB_PORT) || 5432,
		username: process.env.DB_USERNAME || 'postgres',
		password: process.env.DB_PASSWORD || 'postgres',
		database: process.env.DB_NAME || 'job_queue',
		ssl: flag(process.env.DB_SSL, Boolean(process.env.DATABASE_URL)),
		synchronize: flag(process.env.DB_SYNC, true),
		logging: flag(process.env.DB_LOGGING, false),
	},
	redis: {
		url: process.env.REDIS_URL,
		host: process.env.REDIS_HOST || 'localhost',
		port: Number(process.env.REDIS_PORT) || 6379,
	},
	worker: {
		concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
	},
};
