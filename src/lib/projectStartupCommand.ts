import type { Project } from "./types";

const CODEX_NO_ALT_SCREEN_ARG = "--no-alt-screen";

function isCodexStartupCommand(command: string): boolean {
  return /\bcodex(?:\.(?:cmd|exe|ps1))?\b/i.test(command);
}

function hasNoAltScreenArg(command: string): boolean {
  return new RegExp(`(^|\\s)${CODEX_NO_ALT_SCREEN_ARG}(\\s|$)`).test(command);
}

export function resolveProjectStartupCommand(project: Pick<Project, "cli_tool" | "startup_cmd">): string | undefined {
  const startupCmd = project.startup_cmd.trim();
  if (startupCmd) return startupCmd;

  const cliTool = project.cli_tool.trim();
  if (!cliTool) return undefined;
  if (isCodexStartupCommand(cliTool) && !hasNoAltScreenArg(cliTool)) {
    return `${cliTool} ${CODEX_NO_ALT_SCREEN_ARG}`;
  }

  return cliTool;
}
