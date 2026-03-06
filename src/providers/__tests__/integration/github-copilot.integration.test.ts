/**
 * Integration tests for GitHub Copilot provider.
 *
 * These tests hit the real GitHub and Copilot APIs.
 * They are skipped unless:
 * - INTEGRATION=1 env var is set
 * - GITHUB_COPILOT_TOKEN env var is set (a gho_* OAuth token)
 *
 * To obtain a token for testing:
 * 1. Sign in via the Serva app's Settings screen, or
 * 2. Copy from ~/.config/github-copilot/hosts.json (if using VS Code)
 *
 * Run with: INTEGRATION=1 GITHUB_COPILOT_TOKEN=gho_... npx jest -c jest.integration.config.js --testPathPatterns=github-copilot
 */

import * as SecureStore from "expo-secure-store";
import { exchangeForCopilotToken, clearTokenCache } from "../../github-copilot/auth";
import { GitHubCopilotProvider } from "../../github-copilot";

const SKIP =
  !process.env.INTEGRATION || !process.env.GITHUB_COPILOT_TOKEN;
const describeIntegration = SKIP ? describe.skip : describe;

const GITHUB_TOKEN = process.env.GITHUB_COPILOT_TOKEN!;

describeIntegration("GitHub Copilot Integration Tests", () => {
  beforeEach(() => {
    clearTokenCache();
    // Override the mock to return our test token
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(
      (key: string) => {
        if (key === "serva_github-copilot_oauth_token") {
          return Promise.resolve(GITHUB_TOKEN);
        }
        return Promise.resolve(null);
      },
    );
  });

  it("exchanges OAuth token for Copilot JWT", async () => {
    const result = await exchangeForCopilotToken(GITHUB_TOKEN);

    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe("string");
    expect(result.expires_at).toBeGreaterThan(Date.now() / 1000);
  }, 15000);

  it("sends a streaming message via Copilot API", async () => {
    const provider = new GitHubCopilotProvider(true);

    const tokens: string[] = [];

    const result = await new Promise<string>((resolve, reject) => {
      provider.sendMessage(
        [{ role: "user", content: "Say hello in exactly 3 words." }],
        "gpt-4o",
        {
          onToken: (token) => tokens.push(token),
          onDone: (fullText) => resolve(fullText),
          onError: (err) => reject(err),
        },
      );
    });

    expect(result.length).toBeGreaterThan(0);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join("")).toBe(result);
  }, 30000);
});
