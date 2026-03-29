import { describe, expect, it } from "vitest";

import { generateInstanceId } from "../src/core/instanceUtils";

describe("generateInstanceId", () => {
	it("returns IDs in the expected run-hex format", () => {
		for (let index = 0; index < 10; index += 1) {
			expect(generateInstanceId()).toMatch(/^run-[0-9a-f]{4}$/);
		}
	});

	it("produces varying values across multiple invocations", () => {
		const generatedIds = new Set(
			Array.from({ length: 20 }, () => generateInstanceId())
		);

		expect(generatedIds.size).toBeGreaterThan(1);
	});
});
