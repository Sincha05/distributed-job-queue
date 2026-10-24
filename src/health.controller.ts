import { Router, Request, Response } from 'express';
import { config } from './config';

export function createHealthRouter(defaultRole: 'api' | 'worker' = 'api'): Router {
	const router = Router();

	router.get('/', (req: Request, res: Response) => {
		res.json({ status: 'ok', role: config.role ?? defaultRole });
	});

	return router;
}
