import { describe, expect, it } from "vitest";

import {
	createMockResponse,
	getAPI,
	type MockLocalRestApi,
	type MockRouteRequest,
} from "./mocks/obsidian-local-rest-api";

describe("obsidian-local-rest-api mock", () => {
	it("stores GET handlers by path and method", () => {
		const api = getAPI();
		const handler = (_request: MockRouteRequest) => {
			return;
		};

		api.addRoute("/ironflow/workflows/:name/instances/:instance/tasks/").get(handler);

		expect(
			api.getRoute("/ironflow/workflows/:name/instances/:instance/tasks/")
		).toBe(handler);
	});

	it("invokes a stored handler with params and captures chained response output", async () => {
		const api = getAPI();
		api.addRoute("/ironflow/workflows/:name/instances/:instance/tasks/:taskName").get(
			(request, response) => {
				return response.status(201).json({
					workflow: request.params.name,
					instance: request.params.instance,
					taskName: request.params.taskName,
				});
			}
		);

		const response = await api.invokeRoute(
			"/ironflow/workflows/:name/instances/:instance/tasks/:taskName",
			"get",
			{
				params: {
					name: "alpha",
					instance: "run-a1b2",
					taskName: "lint-code",
				},
			}
		);

		expect(response.statusCode).toBe(201);
		expect(response.jsonBody).toEqual({
			workflow: "alpha",
			instance: "run-a1b2",
			taskName: "lint-code",
		});
	});

	it("creates chainable mock responses for direct assertions when needed", () => {
		const response = createMockResponse();

		expect(response.status(404).json({ error: "missing" })).toBe(response);
		expect(response.statusCode).toBe(404);
		expect(response.jsonBody).toEqual({ error: "missing" });
	});

	it("clears registered handlers on unregister", async () => {
		const api: MockLocalRestApi = getAPI();
		api.addRoute("/ironflow/status/").get((_request, response) => {
			return response.json({ status: "ok" });
		});

		await expect(api.invokeRoute("/ironflow/status/")).resolves.toMatchObject({
			statusCode: 200,
			jsonBody: { status: "ok" },
		});

		api.unregister?.();

		await expect(api.invokeRoute("/ironflow/status/")).rejects.toThrow(
			"No mock route registered for GET /ironflow/status/"
		);
	});
});
