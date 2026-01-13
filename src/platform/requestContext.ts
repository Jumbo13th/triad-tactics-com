import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
	requestId: string;
	route: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
	return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
	return storage.getStore();
}
