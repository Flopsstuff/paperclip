/**
 * Regression test for model argument construction in the hermes-local adapter.
 *
 * An agent with no adapterConfig.model falls back to DEFAULT_MODEL ("auto"),
 * which means "let Hermes pick from ~/.hermes/config.yaml". Passing it to the
 * CLI as `-m auto` instead forwards the literal to the provider backend, and a
 * Codex/ChatGPT account answers HTTP 400 (non-retryable), so the run dies.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@paperclipai/adapter-utils/server-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@paperclipai/adapter-utils/server-utils")>();
  return {
    ...actual,
    runChildProcess: vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      timedOut: false,
      stdout: "",
      stderr: "",
      pid: null,
      startedAt: null,
    })),
  };
});

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => ""),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  access: vi.fn(async () => undefined),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ isFile: () => true, isDirectory: () => false })),
}));

import { execute } from "./execute.js";
import * as serverUtils from "@paperclipai/adapter-utils/server-utils";

function makeCtx(configOverrides: Record<string, unknown> = {}) {
  return {
    runId: "test-run-model-args",
    agent: {
      id: "agent-1",
      companyId: "company-1",
      name: "Hermes",
      adapterType: "hermes_local",
      adapterConfig: {},
    },
    runtime: {
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      taskKey: null,
    },
    config: {
      command: "/usr/bin/hermes",
      timeoutSec: 60,
      graceSec: 5,
      ...configOverrides,
    },
    context: {
      issueId: "issue-1",
      wakeReason: "manual",
      paperclipWake: null,
    },
    onLog: vi.fn(async () => undefined),
    onMeta: vi.fn(async () => undefined),
    onSpawn: vi.fn(async () => undefined),
  } satisfies Record<string, unknown>;
}

async function spawnedArgs(configOverrides: Record<string, unknown> = {}): Promise<string[]> {
  await execute(makeCtx(configOverrides) as any);
  const mocked = vi.mocked(serverUtils.runChildProcess);
  const lastCall = mocked.mock.calls[mocked.mock.calls.length - 1];
  return lastCall[2] as string[];
}

describe("hermes-local adapter model arguments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("omits -m when no model is configured", async () => {
    const args = await spawnedArgs();

    expect(args).not.toContain("-m");
    expect(args).not.toContain("auto");
  });

  it("omits -m when the configured model is explicitly auto", async () => {
    const args = await spawnedArgs({ model: "auto" });

    expect(args).not.toContain("-m");
    expect(args).not.toContain("auto");
  });

  it("passes an explicit model through unchanged", async () => {
    const args = await spawnedArgs({ model: "gpt-5.6-sol", provider: "openai-codex" });

    expect(args).toContain("-m");
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-5.6-sol");
    expect(args[args.indexOf("--provider") + 1]).toBe("openai-codex");
  });
});
