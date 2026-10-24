import 'reflect-metadata';
import http from 'http';
import { createApp } from './app';
import { initializeDatabase, closeDatabase } from './database/data-source';
import { queueService } from './queue/queue.service';
import { config } from './config';
import { logger } from './logger';

async function bootstrap() {
	try {
		await initializeDatabase();
		await queueService.init();

		const app = createApp();
		const server = http.createServer(app);

		const port = config.port;
		server.listen(port, '0.0.0.0', () => {
			logger.info(`API service listening on 0.0.0.0:${port}`);
		});

		let isShuttingDown = false;
		const shutdown = async (signal: string) => {
			if (isShuttingDown) return;
			isShuttingDown = true;
			logger.info(`${signal} received, closing API service`);

			server.close(async () => {
				logger.info('HTTP server closed');
				try {
					await queueService.close();
					await closeDatabase();
					logger.info('API service shut down successfully');
					process.exit(0);
				} catch (error: any) {
					logger.error(`Error during API shutdown: ${error.message}`);
					process.exit(1);
				}
			});

			setTimeout(() => {
				logger.error('Shutdown timed out, forcefully terminating');
				process.exit(1);
			}, 10000);
		};

		process.on('SIGTERM', () => shutdown('SIGTERM'));
		process.on('SIGINT', () => shutdown('SIGINT'));
	} catch (error: any) {
		logger.error(`Failed to start API service: ${error.message}`);
		process.exit(1);
	}
}

bootstrap();
