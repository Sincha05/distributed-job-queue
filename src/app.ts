import express, { Express, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import pinoHttp from 'pino-http';
import { logger } from './logger';
import { jobsRouter } from './api/jobs.router';
import { createHealthRouter } from './health.controller';
import { NotFoundError } from './api/jobs.service';

export function createApp(): Express {
	const app = express();

	app.use(
		pinoHttp({
			logger,
			autoLogging: {
				ignore: (req) => req.url === '/health' || req.url.startsWith('/css') || req.url.startsWith('/js'),
			},
		})
	);

	app.use(express.json());

	// Serve static frontend files from 'public' directory
	const publicDir = fs.existsSync(path.resolve(__dirname, '../public'))
		? path.resolve(__dirname, '../public')
		: path.resolve(process.cwd(), 'public');

	app.use(express.static(publicDir));

	// API Routes
	app.use('/health', createHealthRouter('api'));
	app.use('/jobs', jobsRouter);

	// Fallback route to serve index.html for root path or SPA navigation if not an API route
	app.get('/', (_req: Request, res: Response) => {
		const indexPath = path.join(publicDir, 'index.html');
		if (fs.existsSync(indexPath)) {
			res.sendFile(indexPath);
		} else {
			res.send('Distributed Job Queue System API Online');
		}
	});

	// Central error handling middleware
	app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
		if (err instanceof NotFoundError) {
			res.status(404).json({ statusCode: 404, message: err.message });
			return;
		}

		logger.error({ err }, 'Unhandled request error');
		res.status(err.statusCode || 500).json({
			statusCode: err.statusCode || 500,
			message: err.message || 'Internal server error',
		});
	});

	return app;
}
