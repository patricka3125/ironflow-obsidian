import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(new URL("./test/mocks/obsidian.ts", import.meta.url)),
			"obsidian-local-rest-api": fileURLToPath(
				new URL("./test/mocks/obsidian-local-rest-api.ts", import.meta.url)
			),
		},
	},
	test: {
		include: ["test/**/*.test.ts"],
	},
});
