import type { Request } from "express";
import type { PluginManifest } from "obsidian";

export type MockHttpMethod = "get";

export interface MockRouteRequest {
	params: Record<string, string>;
}

export interface MockRouteResponse {
	statusCode: number;
	jsonBody: unknown;
	status(code: number): MockRouteResponse;
	json(data: unknown): MockRouteResponse;
}

export type MockRouteHandler = (
	request: MockRouteRequest,
	response: MockRouteResponse
) => unknown | Promise<unknown>;

export interface LocalRestApiPublicApi {
	manifest: PluginManifest;
	addRoute(path: string): {
		get: (handler: MockRouteHandler) => void;
	};
	requestIsAuthenticated(request: Request): boolean;
	unregister?: () => void;
}

export interface MockLocalRestApi extends LocalRestApiPublicApi {
	getRoute(path: string, method?: MockHttpMethod): MockRouteHandler | undefined;
	invokeRoute(
		path: string,
		method?: MockHttpMethod,
		request?: Partial<MockRouteRequest>
	): Promise<MockRouteResponse>;
}

/**
 * Build a mock request object for route-handler tests.
 */
export function createMockRequest(
	params: Record<string, string> = {}
): MockRouteRequest {
	return { params };
}

/**
 * Build a mock response object that records status and JSON output.
 */
export function createMockResponse(): MockRouteResponse {
	const response: MockRouteResponse = {
		statusCode: 200,
		jsonBody: undefined,
		status(code: number): MockRouteResponse {
			response.statusCode = code;
			return response;
		},
		json(data: unknown): MockRouteResponse {
			response.jsonBody = data;
			return response;
		},
	};

	return response;
}

/**
 * Create a mock local REST API surface that captures registered handlers.
 */
export function getAPI(): MockLocalRestApi {
	const routes = new Map<string, Map<MockHttpMethod, MockRouteHandler>>();

	function registerHandler(
		path: string,
		method: MockHttpMethod,
		handler: MockRouteHandler
	): void {
		const methods = routes.get(path) ?? new Map<MockHttpMethod, MockRouteHandler>();
		methods.set(method, handler);
		routes.set(path, methods);
	}

	return {
		manifest: {
			id: "ironflow-obsidian",
			name: "Ironflow",
			version: "1.0.0",
			minAppVersion: "0.0.0",
			description: "Mock local REST API plugin manifest",
			author: "test",
			authorUrl: "",
			isDesktopOnly: false,
		},
		addRoute(path: string) {
			return {
				get(handler: MockRouteHandler): void {
					registerHandler(path, "get", handler);
				},
			};
		},
		requestIsAuthenticated(_request: Request): boolean {
			return true;
		},
		getRoute(path: string, method: MockHttpMethod = "get") {
			return routes.get(path)?.get(method);
		},
		async invokeRoute(
			path: string,
			method: MockHttpMethod = "get",
			request: Partial<MockRouteRequest> = {}
		): Promise<MockRouteResponse> {
			const handler = routes.get(path)?.get(method);
			if (!handler) {
				throw new Error(`No mock route registered for ${method.toUpperCase()} ${path}`);
			}

			const response = createMockResponse();
			await handler(createMockRequest(request.params ?? {}), response);
			return response;
		},
		unregister(): void {
			routes.clear();
		},
	};
}
