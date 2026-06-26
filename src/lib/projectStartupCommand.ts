import type { Project } from "./types";
import { getCodexProviderOverride, isExactCodexProject } from "./providerSwitching";

const CODEX_NO_ALT_SCREEN_ARG = "--no-alt-screen";
const CODEX_PROFILE_ARG = "--profile";

function isCodexStartupCommand(command: string): boolean {
  return /\bcodex(?:\.(?:cmd|exe|ps1))?\b/i.test(command);
}

function hasNoAltScreenArg(command: string): boolean {
  return new RegExp(`(^|\\s)${CODEX_NO_ALT_SCREEN_ARG}(\\s|$)`).test(command);
}

function hasProfileArg(command: string): boolean {
  return new RegExp(`(^|\\s)${CODEX_PROFILE_ARG}(\\s|$)`).test(command);
}

export function resolveProjectStartupCommand(
  project: Pick<Project, "cli_tool" | "startup_cmd" | "provider_overrides">,
  options: { includeCodexProviderProfile?: boolean } = {}
): string | undefined {
  const startupCmd = project.startup_cmd.trim();
  if (startupCmd) return startupCmd;

  const cliTool = project.cli_tool.trim();
  if (!cliTool) return undefined;

  let command = cliTool;
  if (options.includeCodexProviderProfile !== false && isExactCodexProject(project)) {
    const override = getCodexProviderOverride(project);
    if (override && !hasProfileArg(command)) {
      command = `${command} ${CODEX_PROFILE_ARG} ${override.profileName}`;
    }
  }
  if (isCodexStartupCommand(command) && !hasNoAltScreenArg(command)) {
    return `${command} ${CODEX_NO_ALT_SCREEN_ARG}`;
  }

  return command;
}
