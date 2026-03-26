import { describe, expect, it } from "vitest";

import {
	parseFrontmatter,
	updateFrontmatter,
} from "../src/core/frontmatter";

describe("parseFrontmatter", () => {
	it("returns an empty object when frontmatter is missing", () => {
		expect(parseFrontmatter("# No frontmatter")).toEqual({});
	});

	it("parses scalar, array, and nested values", () => {
		const markdown = `---
title: "Build Feature"
tags:
  - one
  - two
config:
  enabled: true
---
Body`;

		expect(parseFrontmatter(markdown)).toEqual({
			title: "Build Feature",
			tags: ["one", "two"],
			config: {
				enabled: true,
			},
		});
	});

	it("throws when the YAML is invalid", () => {
		expect(() => parseFrontmatter("---\nkey: [unterminated\n---\nBody")).toThrow(
			/Failed to parse frontmatter/
		);
	});

	it("throws when the parsed frontmatter is not an object", () => {
		expect(() => parseFrontmatter("---\nhello\n---\n")).toThrow(
			/must parse to an object/
		);
	});

	it("parses quoted separators inside frontmatter values", () => {
		const markdown = `---
separator: "---"
---
Body`;

		expect(parseFrontmatter(markdown)).toEqual({
			separator: "---",
		});
	});
});

describe("updateFrontmatter", () => {
	it("updates only the requested fields and preserves the body exactly", () => {
		const markdown = `---
title: "Build Feature"
owner: "dev"
---
Line 1
<% tp.file.title %>
Line 3`;

		const updated = updateFrontmatter(markdown, {
			owner: "reviewer",
			status: "open",
		});

		expect(parseFrontmatter(updated)).toEqual({
			title: "Build Feature",
			owner: "reviewer",
			status: "open",
		});
		expect(updated.endsWith("Line 1\n<% tp.file.title %>\nLine 3")).toBe(true);
		expect(updated.split("---\n").at(-1)).not.toMatch(/[ \t]+\n/);
	});

	it("creates a frontmatter block when one does not exist", () => {
		const updated = updateFrontmatter("# Title", {
			"ironflow-next-tasks": ["[[task-a]]"],
		});

		expect(parseFrontmatter(updated)).toEqual({
			"ironflow-next-tasks": ["[[task-a]]"],
		});
		expect(updated.endsWith("# Title")).toBe(true);
	});

	it("handles empty frontmatter blocks", () => {
		const updated = updateFrontmatter("---\n---\nBody", {
			"ironflow-depends-on": ["[[task-a]]"],
		});

		expect(parseFrontmatter(updated)).toEqual({
			"ironflow-depends-on": ["[[task-a]]"],
		});
		expect(updated.endsWith("Body")).toBe(true);
	});

	it("is idempotent when the same updates are applied twice", () => {
		const updates = {
			"ironflow-agent-profile": "developer",
			"ironflow-next-tasks": ["[[task-a]]"],
		};
		const once = updateFrontmatter("# Body", updates);
		const twice = updateFrontmatter(once, updates);

		expect(twice).toBe(once);
	});

	it("round-trips wikilink arrays used by Ironflow tasks", () => {
		const updated = updateFrontmatter("# Title", {
			"ironflow-depends-on": ["[[task-a]]", "[[task-b]]"],
		});

		expect(parseFrontmatter(updated)).toEqual({
			"ironflow-depends-on": ["[[task-a]]", "[[task-b]]"],
		});
	});
});
