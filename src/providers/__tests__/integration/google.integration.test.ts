/**
 * Integration tests for the Google Gemini provider.
 *
 * These tests hit the REAL Google Generative Language API. They are skipped unless:
 * - GOOGLE_API_KEY env var is set
 * - INTEGRATION=1 env var is set
 *
 * Run with: INTEGRATION=1 GOOGLE_API_KEY=AIza... npx jest --config jest.integration.config.js
 */

import { validateGoogleKey } from "../../google";

const SKIP =
  !process.env.INTEGRATION || !process.env.GOOGLE_API_KEY;
const describeIntegration = SKIP ? describe.skip : describe;

describeIntegration("Google Gemini Integration Tests", () => {
  const apiKey = process.env.GOOGLE_API_KEY!;

  it(
    "validates a real API key successfully",
    async () => {
      const result = await validateGoogleKey(apiKey);
      expect(result.valid).toBe(true);
    },
    15000,
  );

  it(
    "rejects an invalid API key",
    async () => {
      const result = await validateGoogleKey("AIza-invalid-key-12345");
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    },
    15000,
  );
});
