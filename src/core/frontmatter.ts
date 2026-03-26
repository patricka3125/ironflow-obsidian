import { parseDocument, stringify } from "yaml";

const FRONTMATTER_DELIMITER = "---";
const FRONTMATTER_PATTERN =
	/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown document.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
	const match = content.match(FRONTMATTER_PATTERN);
	if (!match) {
		return {};
	}

	const rawFrontmatter = match[1];
	if (rawFrontmatter.trim().length === 0) {
		return {};
	}

	const document = parseDocument(rawFrontmatter);
	if (document.errors.length > 0) {
		const message = document.errors.map((error) => error.message).join("; ");
		throw new Error(`Failed to parse frontmatter: ${message}`);
	}

	const parsed = document.toJS();
	if (parsed === null || parsed === undefined) {
		return {};
	}

	if (typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("Frontmatter must parse to an object.");
	}

	return parsed as Record<string, unknown>;
}

/**
 * Update frontmatter fields while preserving the markdown body exactly.
 */
export function updateFrontmatter(
	content: string,
	updates: Record<string, unknown>
): string {
	const match = content.match(FRONTMATTER_PATTERN);
	const currentFrontmatter = match ? parseFrontmatter(content) : {};
	const nextFrontmatter: Record<string, unknown> = {
		...currentFrontmatter,
		...updates,
	};

	const frontmatterBlock = serializeFrontmatter(nextFrontmatter);
	if (match) {
		return content.replace(FRONTMATTER_PATTERN, frontmatterBlock);
	}

	const separator = content.length > 0 ? "\n" : "";
	return `${frontmatterBlock}${separator}${content}`;
}

/**
 * Remove the frontmatter block from markdown while preserving the body exactly.
 */
export function stripFrontmatter(content: string): string {
	return content.replace(FRONTMATTER_PATTERN, "");
}

function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
	if (Object.keys(frontmatter).length === 0) {
		return `${FRONTMATTER_DELIMITER}\n${FRONTMATTER_DELIMITER}\n`;
	}

	const yamlBody = stringify(frontmatter, { lineWidth: 0 });

	return `${FRONTMATTER_DELIMITER}\n${yamlBody}${FRONTMATTER_DELIMITER}\n`;
}
