"""End-to-end tests for the Ironflow instance-tasks REST API.

These tests run against a live Obsidian vault with the Local REST API and
Ironflow plugins enabled.  They expect the following data to be present:

    Workflow:  Code Development
    Instance:  run-9e79
    Tasks:     Develop Phase 1, Review Phase 1
"""

from __future__ import annotations

import pytest

from conftest import IronflowApiClient

# -- Test data constants ----------------------------------------------------

WORKFLOW = "Code Development"
INSTANCE = "run-9e79"
TASK = "Develop Phase 1"

REQUIRED_FRONTMATTER_KEYS = {
    "ironflow-template",
    "ironflow-workflow",
    "ironflow-agent-profile",
    "ironflow-depends-on",
    "ironflow-next-tasks",
    "ironflow-instance-id",
    "ironflow-status",
}


# -- Status endpoint --------------------------------------------------------


class TestStatusEndpoint:
    def test_returns_200_with_plugin_info(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.get_status()

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["plugin"] == "ironflow-obsidian"
        assert "version" in body


# -- List tasks endpoint ----------------------------------------------------


class TestListInstanceTasks:
    def test_returns_200_with_task_array(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.list_instance_tasks(WORKFLOW, INSTANCE)

        assert resp.status_code == 200
        tasks = resp.json()
        assert isinstance(tasks, list)
        assert len(tasks) >= 2

    def test_each_task_has_required_fields(
        self, api_client: IronflowApiClient
    ) -> None:
        tasks = api_client.list_instance_tasks(WORKFLOW, INSTANCE).json()

        for task in tasks:
            assert "name" in task
            assert "filePath" in task
            assert "frontmatter" in task
            assert REQUIRED_FRONTMATTER_KEYS <= task["frontmatter"].keys()

    def test_contains_expected_task_names(
        self, api_client: IronflowApiClient
    ) -> None:
        tasks = api_client.list_instance_tasks(WORKFLOW, INSTANCE).json()
        names = {t["name"] for t in tasks}

        assert "Develop Phase 1" in names
        assert "Review Phase 1" in names

    def test_frontmatter_values_match_instance(
        self, api_client: IronflowApiClient
    ) -> None:
        tasks = api_client.list_instance_tasks(WORKFLOW, INSTANCE).json()

        for task in tasks:
            fm = task["frontmatter"]
            assert isinstance(fm["ironflow-workflow"], str)
            assert len(fm["ironflow-workflow"]) > 0
            assert fm["ironflow-instance-id"] == INSTANCE
            assert fm["ironflow-status"] in (
                "open",
                "pending",
                "in-progress",
                "done",
            )

    def test_no_body_field_in_summary(
        self, api_client: IronflowApiClient
    ) -> None:
        tasks = api_client.list_instance_tasks(WORKFLOW, INSTANCE).json()

        for task in tasks:
            assert "body" not in task

    def test_404_for_nonexistent_workflow(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.list_instance_tasks(
            "nonexistent-workflow", INSTANCE
        )

        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "not found" in body["error"].lower()

    def test_404_for_nonexistent_instance(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.list_instance_tasks(
            WORKFLOW, "nonexistent-instance"
        )

        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "not found" in body["error"].lower()


# -- Get single task endpoint -----------------------------------------------


class TestGetInstanceTask:
    def test_returns_200_with_task_detail(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.get_instance_task(WORKFLOW, INSTANCE, TASK)

        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == TASK
        assert body["filePath"].endswith(f"{TASK}.md")
        assert REQUIRED_FRONTMATTER_KEYS <= body["frontmatter"].keys()

    def test_body_is_non_empty_string(
        self, api_client: IronflowApiClient
    ) -> None:
        body = api_client.get_instance_task(
            WORKFLOW, INSTANCE, TASK
        ).json()

        assert isinstance(body["body"], str)
        assert len(body["body"]) > 0

    def test_body_does_not_contain_frontmatter_fences(
        self, api_client: IronflowApiClient
    ) -> None:
        body = api_client.get_instance_task(
            WORKFLOW, INSTANCE, TASK
        ).json()["body"]

        assert not body.startswith("---")

    def test_frontmatter_matches_instance(
        self, api_client: IronflowApiClient
    ) -> None:
        fm = api_client.get_instance_task(
            WORKFLOW, INSTANCE, TASK
        ).json()["frontmatter"]

        assert isinstance(fm["ironflow-workflow"], str)
        assert len(fm["ironflow-workflow"]) > 0
        assert fm["ironflow-instance-id"] == INSTANCE

    def test_404_for_nonexistent_task(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.get_instance_task(
            WORKFLOW, INSTANCE, "nonexistent-task"
        )

        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "not found" in body["error"].lower()

    def test_404_for_nonexistent_workflow(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.get_instance_task(
            "nonexistent-workflow", INSTANCE, TASK
        )

        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "not found" in body["error"].lower()

    def test_404_for_nonexistent_instance(
        self, api_client: IronflowApiClient
    ) -> None:
        resp = api_client.get_instance_task(
            WORKFLOW, "nonexistent-instance", TASK
        )

        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body
        assert "not found" in body["error"].lower()
