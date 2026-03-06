/**
 * Integration tests for the Anthropic provider.
 *
 * These tests hit the REAL Anthropic API. They are skipped unless:
 * - ANTHROPIC_API_KEY env var is set
 * - INTEGRATION=1 env var is set
 *
 * Run with: INTEGRATION=1 ANTHROPIC_API_KEY=sk-ant-... npx jest --config jest.integration.config.js
 */

import { validateAnthropicKey } from "../../anthropic";

const SKIP =
  !process.env.INTEGRATION || !process.env.ANTHROPIC_API_KEY;
const describeIntegration = SKIP ? describe.skip : describe;

describeIntegration("Anthropic Integration Tests", () => {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  it(
    "validates a real API key successfully",
    async () => {
      const result = await validateAnthropicKey(apiKey);
      expect(result.valid).toBe(true);
    },
    15000,
  );

  it(
    "rejects an invalid API key",
    async () => {
      const result = await validateAnthropicKey("sk-ant-invalid-key-12345");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    },
    15000,
  );
});
