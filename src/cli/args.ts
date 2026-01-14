// CLI Argument Parser
// Handles command-line argument parsing for Frink Loop

import * as fs from "fs";
import { showLogo } from "./ui.js";
import { colors } from "../ui/theme.js";

// =============================================================================
// Types
// =============================================================================

export interface ParsedArgs {
  task?: string;
  taskFile?: string;
  workingDir?: string;
  prompt?: string;
  interactive: boolean;
  debug: boolean;
  help: boolean;
  setup: boolean;
}

// =============================================================================
// Argument Parsing
// =============================================================================

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  // Check for help flag
  if (argv.includes("--help") || argv.includes("-h")) {
    return {
      interactive: false,
      debug: false,
      help: true,
      setup: false,
    };
  }

  // Check for setup command
  if (argv[0] === "setup") {
    return {
      interactive: false,
      debug: false,
      help: false,
      setup: true,
    };
  }

  // Debug mode
  const debug = argv.includes("--debug");
  if (debug) {
    process.env.DEBUG = "1";
  }

  let task: string | undefined;
  let taskFile: string | undefined;
  let workingDir: string | undefined;
  let prompt: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir" || arg === "-d") {
      workingDir = argv[++i];
    } else if (arg === "--prompt" || arg === "-p") {
      prompt = argv[++i];
    } else if (arg === "--file" || arg === "-f") {
      taskFile = argv[++i];
    } else if (arg === "--debug") {
      // Already handled
    } else if (!arg.startsWith("-")) {
      task = arg;
    }
  }

  // If task file provided, read task from file
  if (taskFile) {
    try {
      task = fs.readFileSync(taskFile, "utf-8").trim();
    } catch (error) {
      console.error(`Error reading task file: ${taskFile}`);
      process.exit(1);
    }
  }

  // Interactive mode if no task provided
  const interactive = !task;

  return {
    task,
    taskFile,
    workingDir,
    prompt,
    interactive,
    debug,
    help: false,
    setup: false,
  };
}

// =============================================================================
// Help Display
// =============================================================================

/**
 * Show help message and usage information
 */
export function showHelp(): void {
  showLogo();
  console.log(`
${colors.primary("Usage:")}
  ${colors.muted("frink")}                          ${colors.muted("# Interactive mode (uses current dir)")}
  ${colors.muted('frink "your task"')}              ${colors.muted("# Run with task")}
  ${colors.muted('frink -f ./task.md')}             ${colors.muted("# Run with task from file")}
  ${colors.muted('frink "task" --dir ./project')}   ${colors.muted("# Specify directory")}

${colors.primary("Commands:")}
  ${colors.secondary("setup")}            Run configuration wizard

${colors.primary("Options:")}
  ${colors.secondary("-f, --file")}       Read task from file (alternative to string)
  ${colors.secondary("-d, --dir")}        Working directory (default: current dir)
  ${colors.secondary("-p, --prompt")}     Custom system prompt file (default: .frink/prompt.md)
  ${colors.secondary("--debug")}          Enable debug output
  ${colors.secondary("-h, --help")}       Show this help

${colors.primary("Examples:")}
  ${colors.muted('frink "Add user authentication"')}
  ${colors.muted('frink -f ./TASK.md -d ./backend')}
  ${colors.muted('frink "Fix TypeScript errors" -d ./backend')}
  ${colors.muted("frink setup")}
`);
}
