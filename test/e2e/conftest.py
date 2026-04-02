"""Pytest configuration and shared fixtures for e2e API tests."""

from __future__ import annotations

import os
from urllib.parse import quote

import pytest
import requests
import urllib3
from dotenv import load_dotenv

# Silence InsecureRequestWarning from the self-signed certificate.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

BASE_URL = os.getenv("OBSIDIAN_API_BASE_URL", "https://127.0.0.1:27124")


def _require_api_key() -> str:
    key = os.getenv("OBSIDIAN_API_KEY")
    if not key:
        pytest.skip("OBSIDIAN_API_KEY not set – skipping e2e tests")
    return key


# ---------------------------------------------------------------------------
# Lightweight API client
# ---------------------------------------------------------------------------


class IronflowApiClient:
    """Thin wrapper around the Ironflow REST API endpoints."""

    def __init__(self, base_url: str, api_key: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {api_key}"
        self.session.verify = False  # self-signed cert

    # -- Endpoints ----------------------------------------------------------

    def get_status(self) -> requests.Response:
        return self.session.get(f"{self.base_url}/ironflow/status/")

    def list_instance_tasks(
        self, workflow: str, instance: str
    ) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/ironflow/workflows/{quote(workflow, safe='')}"
            f"/instances/{quote(instance, safe='')}/tasks/"
        )

    def get_instance_task(
        self, workflow: str, instance: str, task_name: str
    ) -> requests.Response:
        return self.session.get(
            f"{self.base_url}/ironflow/workflows/{quote(workflow, safe='')}"
            f"/instances/{quote(instance, safe='')}"
            f"/tasks/{quote(task_name, safe='')}"
        )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def api_client() -> IronflowApiClient:
    """Session-scoped API client backed by a real Obsidian instance."""
    api_key = _require_api_key()
    return IronflowApiClient(BASE_URL, api_key)
