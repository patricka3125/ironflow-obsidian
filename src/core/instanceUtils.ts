/**
 * Create a workflow instance identifier using a short random hex suffix.
 */
export function generateInstanceId(): string {
	const randomValue = Math.floor(Math.random() * 0x10000);
	return `run-${randomValue.toString(16).padStart(4, "0")}`;
}
