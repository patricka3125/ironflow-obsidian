import type { Request, Response } from "express";
import type { LocalRestApiPublicApi } from "obsidian-local-rest-api";

import type { InstanceManager } from "../core/InstanceManager";
import type {
	IronflowTask,
	IronflowTaskFrontmatter,
} from "../types";
import type { components } from "./schema";

type ErrorResponse = components["schemas"]["ErrorResponse"];
type ApiIronflowTaskFrontmatter =
	components["schemas"]["IronflowTaskFrontmatter"];
type InstanceTaskSummary = components["schemas"]["InstanceTaskSummary"];
type InstanceTaskDetail = components["schemas"]["InstanceTaskDetail"];

/**
 * Register read-only REST API routes for workflow instance tasks.
 */
export function registerRoutes(
	api: LocalRestApiPublicApi,
	instanceManager: InstanceManager
): void {
	api.addRoute("/ironflow/workflows/:name/instances/:instance/tasks/").get(
		async (request: Request, response: Response) => {
			try {
				const tasks = await instanceManager.getInstanceTasks(
					request.params.name,
					request.params.instance
				);
				sendJson(
					response,
					200,
					tasks.map((task) => toInstanceTaskSummary(task))
				);
			} catch (error) {
				sendErrorResponse(response, error);
			}
		}
	);

	api.addRoute(
		"/ironflow/workflows/:name/instances/:instance/tasks/:taskName"
	).get(async (request: Request, response: Response) => {
		try {
			const result = await instanceManager.getInstanceTask(
				request.params.name,
				request.params.instance,
				request.params.taskName
			);
			if (!result) {
				sendJson(response, 404, {
					error: `Task "${request.params.taskName}" not found in instance "${request.params.instance}".`,
				});
				return;
			}

			sendJson(response, 200, toInstanceTaskDetail(result.task, result.body));
		} catch (error) {
			sendErrorResponse(response, error);
		}
	});
}

function toInstanceTaskSummary(task: IronflowTask): InstanceTaskSummary {
	return {
		name: task.name,
		filePath: task.filePath,
		frontmatter: toApiFrontmatter(task.frontmatter),
	};
}

function toInstanceTaskDetail(
	task: IronflowTask,
	body: string
): InstanceTaskDetail {
	return {
		...toInstanceTaskSummary(task),
		body,
	};
}

function toApiFrontmatter(
	frontmatter: IronflowTaskFrontmatter
): ApiIronflowTaskFrontmatter {
	const {
		"ironflow-template": template,
		"ironflow-workflow": workflow,
		"ironflow-agent-profile": agentProfile,
		"ironflow-depends-on": dependsOn,
		"ironflow-next-tasks": nextTasks,
		"ironflow-instance-id": instanceId,
		"ironflow-status": status,
		...userDefinedFields
	} = frontmatter;

	if (instanceId === undefined) {
		throw new Error('Task frontmatter is missing "ironflow-instance-id".');
	}

	if (status === undefined) {
		throw new Error('Task frontmatter is missing "ironflow-status".');
	}

	return {
		...userDefinedFields,
		"ironflow-template": template,
		"ironflow-workflow": workflow,
		"ironflow-agent-profile": agentProfile,
		"ironflow-depends-on": dependsOn,
		"ironflow-next-tasks": nextTasks,
		"ironflow-instance-id": instanceId,
		"ironflow-status": status,
	};
}

function sendErrorResponse(response: Response, error: unknown): void {
	const message = getErrorMessage(error);
	sendJson(response, isNotFoundError(message) ? 404 : 500, { error: message });
}

function sendJson(
	response: Response,
	statusCode: number,
	body: ErrorResponse | InstanceTaskSummary[] | InstanceTaskDetail
): void {
	response.status(statusCode).json(body);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

function isNotFoundError(message: string): boolean {
	return message.toLowerCase().includes("not found");
}
