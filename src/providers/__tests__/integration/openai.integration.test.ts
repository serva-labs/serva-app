/**
 * Integration tests for the OpenAI provider.
 *
 * These tests hit the REAL OpenAI API. They are skipped unless:
 * - OPENAI_API_KEY env var is set
 * - INTEGRATION=1 env var is set
 *
 * Run with: INTEGRATION=1 OPENAI_API_KEY=sk-... npx jest --testPathPattern=integration
 */

import { validateOpenAIKey } from "../../openai";

const SKIP =
  !process.env.INTEGRATION || !process.env.OPENAI_API_KEY;
const describeIntegration = SKIP ? describe.skip : describe;

describeIntegration("OpenAI Integration Tests", () => {
  const apiKey = process.env.OPENAI_API_KEY!;

  it(
    "validates a real API key successfully",
    async () => {
      const result = await validateOpenAIKey(apiKey);
      expect(result.valid).toBe(true);
    },
    15000,
  );

  it(
    "rejects an invalid API key",
    async () => {
      const result = await validateOpenAIKey("sk-invalid-key-12345");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    },
    15000,
  );
});
