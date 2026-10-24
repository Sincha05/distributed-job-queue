import { Container, getContainer } from '@cloudflare/containers';
import type { DurableObject } from 'cloudflare:workers';

type Ctx = DurableObject['ctx'];

interface Env {
	API_CONTAINER: DurableObjectNamespace<ApiContainer>;
	WORKER_CONTAINER: DurableObjectNamespace<WorkerContainer>;
	DATABASE_URL: string;
	REDIS_URL: string;
	DB_SYNC?: string;
	WORKER_CONCURRENCY?: string;
}

class JobContainer extends Container<Env> {
	defaultPort = 3000;
	// Longer than the cron interval below, so the keepalive ping always lands first.
	sleepAfter = '15m';

	constructor(ctx: Ctx, env: Env, role: 'api' | 'worker') {
		super(ctx, env);
		// Secrets live as Worker secrets and are handed to the container as env vars.
		this.envVars = {
			ROLE: role,
			NODE_ENV: 'production',
			PORT: '3000',
			DATABASE_URL: env.DATABASE_URL,
			REDIS_URL: env.REDIS_URL,
			DB_SYNC: env.DB_SYNC ?? 'true',
			WORKER_CONCURRENCY: env.WORKER_CONCURRENCY ?? '5',
		};
	}
}

export class ApiContainer extends JobContainer {
	constructor(ctx: Ctx, env: Env) {
		super(ctx, env, 'api');
	}
}

export class WorkerContainer extends JobContainer {
	constructor(ctx: Ctx, env: Env) {
		super(ctx, env, 'worker');
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return getContainer(env.API_CONTAINER).fetch(request);
	},

	// Containers sleep when idle, and a queue consumer receives no HTTP traffic of
	// its own. The cron trigger pings both so the worker keeps draining the queue.
	// ponytail: keeps both instances effectively always-on, so you pay for 24/7
	// container time. Drop the cron if bursty, request-driven processing is enough.
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			Promise.allSettled([
				getContainer(env.API_CONTAINER).fetch('http://container/health'),
				getContainer(env.WORKER_CONTAINER).fetch('http://container/health'),
			])
		);
	},
};
