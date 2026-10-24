import 'reflect-metadata';
import http from 'http';
import express from 'express';
import { initializeDatabase, closeDatabase } from './database/data-source';
import { queueService } from './queue/queue.service';
import { workerService } from './worker/worker.service';
import { createHealthRouter } from './health.controller';
import { config } from './config';
import { logger } from './logger';

async function bootstrap() {
	try {
		await initializeDatabase();
		await queueService.init();
		await workerService.start();

		// An HTTP listener for container platforms probing health
		const app = express();
		app.use('/health', createHealthRouter('worker'));

		const server = http.createServer(app);
		const port = config.workerPort;
		server.listen(port, '0.0.0.0', () => {
			logger.info(`Worker service started, health on 0.0.0.0:${port}/health`);
		});

		let isShuttingDown = false;
		const shutdown = async (signal: string) => {
			if (isShuttingDown) return;
			isShuttingDown = true;
			logger.info(`${signal} received, closing worker`);

			server.close(async () => {
				try {
					await workerService.close();
					await queueService.close();
					await closeDatabase();
					logger.info('Worker service shut down cleanly');
					process.exit(0);
				} catch (error: any) {
					logger.error(`Error during worker shutdown: ${error.message}`);
					process.exit(1);
				}
			});

			setTimeout(() => {
				logger.error('Worker shutdown timed out, exiting');
				process.exit(1);
			}, 15000);
		};

		process.on('SIGTERM', () => shutdown('SIGTERM'));
		process.on('SIGINT', () => shutdown('SIGINT'));
	} catch (error: any) {
		logger.error(`Failed to start worker service: ${error.message}`);
		process.exit(1);
	}
}

bootstrap();
