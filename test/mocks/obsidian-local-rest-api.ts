export interface LocalRestApiPublicApi {
	addRoute(path: string): {
		get: (handler: (...args: unknown[]) => unknown) => void;
	};
	unregister?: () => void;
}

export function getAPI(): LocalRestApiPublicApi {
	return {
		addRoute() {
			return {
				get() {
					return;
				},
			};
		},
		unregister() {
			return;
		},
	};
}
