import { spawn } from "node:child_process";

// Uses the person's own installed and logged-in Claude Code (`claude -p`), so a
// Claude subscription covers it. shipnotes never sees or stores credentials:
// locally Claude Code uses its own login; in CI it reads CLAUDE_CODE_OAUTH_TOKEN
// (from `claude setup-token`) or ANTHROPIC_API_KEY from the environment.

export interface LlmRequest {
  system: string;
  prompt: string;
  /** JSON Schema the answer must match (structured output). */
  schema: object;
}

export interface Llm {
  generate(req: LlmRequest): Promise<unknown>;
}

interface ClaudeCodeResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
}

// Claude Code gets only what it needs: no GITHUB_TOKEN, no project keys.
const PASS_THROUGH = [
  "PATH", "HOME", "USER", "LANG", "LC_ALL", "TMPDIR", "SHELL",
  "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY", "CLAUDE_CONFIG_DIR", "XDG_CONFIG_HOME",
  "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS",
];

export function minimalEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(PASS_THROUGH.filter((k) => env[k]).map((k) => [k, env[k]]));
}

export function claudeCode(options: { model?: string; timeoutSeconds: number; bin?: string }): Llm {
  return {
    generate(req) {
      const args = [
        "-p",
        "--output-format", "json",
        // Drafting only: no tools, no MCP servers, no project or user settings.
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--no-session-persistence",
        "--system-prompt", req.system,
        "--json-schema", JSON.stringify(req.schema),
        ...(options.model ? ["--model", options.model] : []),
      ];

      return new Promise((resolvePromise, reject) => {
        const child = spawn(options.bin ?? "claude", args, { stdio: ["pipe", "pipe", "pipe"], env: minimalEnv() });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error(`Claude Code did not answer within ${options.timeoutSeconds}s`));
        }, options.timeoutSeconds * 1000);

        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(
            (err as NodeJS.ErrnoException).code === "ENOENT"
              ? new Error("Claude Code (`claude`) is not installed. Install it with: npm install -g @anthropic-ai/claude-code")
              : err
          );
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          let parsed: ClaudeCodeResult;
          try {
            parsed = JSON.parse(stdout) as ClaudeCodeResult;
          } catch {
            reject(new Error(`Claude Code exited ${code} without JSON output. ${stderr.trim().slice(0, 500)}`));
            return;
          }
          if (parsed.is_error || parsed.structured_output === undefined) {
            reject(new Error(`Claude Code returned no structured output (${parsed.subtype ?? "error"}): ${(parsed.result ?? stderr).slice(0, 500)}`));
            return;
          }
          resolvePromise(parsed.structured_output);
        });

        // The prompt goes in on stdin, so it is not limited by argument length.
        child.stdin.end(req.prompt);
      });
    },
  };
}
