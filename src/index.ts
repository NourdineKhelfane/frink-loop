#!/usr/bin/env node
// Frink Loop - Smart autonomous coding loop
// Supports both OpenAI and Anthropic as orchestrating agents

if (!process.env.DEBUG) {
  process.env.DEBUG = "";
}

import * as path from "path";

// Config & Prompts
import {
  loadEnvironment,
  hasApiKey,
  buildTaskPrompt,
  buildTaskPromptWithPredefinedTasks,
} from "./config/index.js";

// Agent
import { FrinkAgent } from "./agent.js";

// Tools & Session
import { getOrCreateSession, resetSession } from "./tools/claude-session.js";
import { setSessionConfig } from "./tools/reset-session.js";
import { resetTodoState, setTodos, getTodoSummary } from "./state/todo-state.js";
import { resetTodoRenderer } from "./ui/todo-renderer.js";

// CLI
import { parseArgs, showHelp } from "./cli/args.js";
import { showLogo, showDisclaimer, showTaskStatus, showResult, showDivider } from "./cli/ui.js";
import { promptForTask, confirmStart } from "./cli/prompts.js";
import { needsSetup, runSetup } from "./cli/setup.js";

// Theme
import { colors, c } from "./ui/theme.js";

// =============================================================================
// State Management
// =============================================================================

function resetAllState(): void {
  resetSession();
  resetTodoState();
  resetTodoRenderer();
}

// =============================================================================
// Interactive Mode
// =============================================================================

async function runInteractiveMode(defaultWorkingDir: string): Promise<{ task: string; workingDir: string } | null> {
  const input = await promptForTask(defaultWorkingDir);
  if (!input) {
    console.log(colors.muted("\n    Cancelled.\n"));
    return null;
  }

  const task = input.task;
  const workingDir = path.resolve(input.workingDir);

  showTaskStatus(task, workingDir);

  if (!(await confirmStart())) {
    console.log(colors.muted("\n    Cancelled.\n"));
    return null;
  }

  return { task, workingDir };
}

// =============================================================================
// Agent Execution
// =============================================================================

async function runAgent(agent: FrinkAgent, fullPrompt: string): Promise<void> {
  const claudeSession = getOrCreateSession({
    workingDirectory: process.cwd(),
    yoloMode: true,
  });

  let finalOutput = "";

  for await (const event of agent.run(fullPrompt, {
    onTextDelta: (text) => {
      process.stdout.write(c.muted(text));
    },
    onToolCall: (name) => {
      console.log(c.primary(`\n    [Frink] ${name}`));
    },
    onError: (error) => {
      console.log(c.muted(`\n    [!!] Error: ${error.message}`));
    },
  })) {
    if (event.type === "text_delta") {
      finalOutput += event.data.text;
    }
  }

  const todoSummary = getTodoSummary();
  const success = todoSummary.total > 0 && todoSummary.completed === todoSummary.total;

  showResult(success, `${todoSummary.completed}/${todoSummary.total} tasks completed`, claudeSession.getCallCount());
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main() {
  await loadEnvironment();

  const args = parseArgs();

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.setup) {
    console.clear();
    showLogo();
    const setupResult = await runSetup(true);
    console.log(setupResult ? colors.primary("\n    Setup complete!\n") : colors.muted("\n    Setup cancelled.\n"));
    process.exit(0);
  }

  console.clear();
  showLogo();

  if (needsSetup()) {
    const setupResult = await runSetup();
    if (!setupResult) {
      console.log(colors.muted("\n    Setup cancelled.\n"));
      process.exit(0);
    }
  }

  if (!hasApiKey()) {
    console.log(colors.muted("    [!!] No API key found"));
    console.log(colors.muted("    Run 'frink setup' to configure.\n"));
    process.exit(1);
  }

  showDisclaimer();

  // Get task input
  let task: string;
  let workingDir: string;

  if (args.interactive || !args.task) {
    const result = await runInteractiveMode(args.workingDir || process.cwd());
    if (!result) process.exit(0);
    task = result.task;
    workingDir = result.workingDir;
  } else {
    task = args.task;
    workingDir = path.resolve(args.workingDir || process.cwd());
    showTaskStatus(task, workingDir);
  }

  showDivider();

  // Initialize session
  console.log(c.muted("\n    [*] Initializing..."));
  const sessionConfig = { workingDirectory: workingDir, yoloMode: true };
  setSessionConfig(sessionConfig);
  getOrCreateSession(sessionConfig);

  // Create agent
  let agent: FrinkAgent;
  try {
    agent = new FrinkAgent({ promptPath: args.prompt, workingDir });
    console.log(c.muted(`    [*] Provider: ${agent.getProviderName()}`));
    console.log(c.muted(`    [*] Model: ${agent.getModelName()}`));
  } catch (error) {
    console.log(c.muted(`\n    [!!] Error: ${(error as Error).message}\n`));
    process.exit(1);
  }

  // Build prompt
  let fullPrompt: string;

  if (args.taskDefinition && args.taskDefinition.tasks.length > 0) {
    const todoInputs = args.taskDefinition.tasks.map((t) => ({
      task: t,
      status: "pending" as const,
    }));
    setTodos(todoInputs);
    console.log(c.muted(`    [*] Loaded ${args.taskDefinition.tasks.length} pre-defined tasks`));
    fullPrompt = buildTaskPromptWithPredefinedTasks(task, workingDir, args.taskDefinition.tasks);
  } else {
    fullPrompt = buildTaskPrompt(task, workingDir);
  }

  console.log(c.primary("\n    [*] Starting Frink Loop"));
  console.log(c.muted("        (ctrl+c to interrupt)\n"));
  showDivider();

  try {
    await runAgent(agent, fullPrompt);
  } catch (error) {
    console.log(c.muted("\n    [!!] Error occurred:"));
    const errorMessage = (error as Error).message || "Unknown error";

    if (errorMessage.includes("rate limit")) {
      console.log(colors.muted("    [!!] Rate limited - wait and try again"));
    } else {
      console.log(colors.muted(`    [!!] ${errorMessage}`));
    }
  } finally {
    resetAllState();
  }

  console.log(colors.muted("\n    [*] Frink Loop complete\n"));
}

main().catch(console.error);
