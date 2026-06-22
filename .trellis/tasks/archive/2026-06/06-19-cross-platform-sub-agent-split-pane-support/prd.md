# 跨平台子 Agent 分屏支持

## Goal

为 Claude/Codex 等 AI CLI 提供跨平台的“子 Agent/辅助会话”分屏入口。默认使用 CLI-Manager 已有内置 pane 创建新 PTY，覆盖 PowerShell、CMD、Git Bash、WSL、Linux、macOS；不依赖 tmux/cmux 作为统一底座。

## What I already know

- 用户要求实施“跨平台子 Agent 分屏支持”。
- 旧任务 `06-18-auto-tmux-sub-agent-pane` 已完成调研：tmux 适合 Linux/macOS/WSL，但不能作为 Windows PowerShell/CMD 的统一方案；cmux 当前更偏 macOS 外部终端应用。
- 现有应用内分屏能力已经存在：`terminalStore.splitTerminal` 创建新 PTY 并用 `terminalPaneTree.splitPaneLeaf` 放入 pane。
- 现有 UI 已有“向右分屏 / 向下分屏”入口和项目选择弹层 `SplitProjectPicker`。
- 项目启动命令来源已经统一为 `startup_cmd || cli_tool`，并在 PTY 创建后写入。
- Claude/Codex Hook 当前没有可靠的“内部子 Agent 启动”事件，第一版不能承诺自动识别 CLI 内部子 Agent。
- Hook 环境变量由 `pty_create` 注入，WSL 通过 `WSLENV` 转发；本任务不能破坏实时统计/通知。

## Assumptions

- “子 Agent 分屏”第一版指手动启动一个同类 AI CLI 辅助会话，而不是解析 Claude/Codex 内部协议。
- 默认方案应优先复用内置 pane；tmux/cmux/Windows Terminal 外部适配后续再做，避免引入平台分支和命令 quoting 风险。
- 当前 session/project 能推断出 Claude/Codex 时，入口直接给出“启动 Claude/Codex 子 Agent”；无法推断时不强行猜测。

## Open Questions

- MVP 是否按推荐方案先只做“内置 pane + 手动子 Agent 入口”，tmux/cmux/Windows Terminal 外部适配留到后续任务？

## Requirements

- 在现有分屏选择弹层中增加“子 Agent/辅助会话”入口。
- 从当前终端会话或所属项目推断 AI CLI：
  - 命令/工具包含 `claude` → 默认启动 `claude`。
  - 命令/工具包含 `codex` 或等于 `code` → 默认启动 `codex`。
- 子 Agent 会话复用当前会话/项目的 `cwd`、`shell`、`envVars`、`projectId`。
- 子 Agent 会话使用 CLI-Manager 内置 pane 创建，保证 Windows/macOS/Linux/WSL/Git Bash 都可用。
- Claude 与 Codex 走同一套 UI/状态/PTY 创建路径，不做只服务 Claude 的特判。
- 不能影响普通“空终端分屏”“项目分屏”“复制终端”“新建终端”等现有行为。
- 不改变 `pty_create` / Hook bridge 对外契约。

## Acceptance Criteria

- [ ] Claude 项目/会话可通过分屏弹层启动一个 Claude 辅助会话。
- [ ] Codex 项目/会话可通过分屏弹层启动一个 Codex 辅助会话。
- [ ] PowerShell/CMD/Git Bash/WSL/Linux/macOS 均走同一内置 pane 逻辑，无平台硬依赖。
- [ ] 无法推断 Claude/Codex 时，不显示误导性的子 Agent 入口，仍保留空终端/项目分屏。
- [ ] 非 Claude/Codex 项目行为不变。
- [ ] 现有 Hook 通知、实时统计、SessionStart 绑定不被破坏。
- [ ] `npx tsc --noEmit` 通过。
- [ ] 如修改 Rust 后端，`cd src-tauri && cargo check` 通过；若本次只改前端，可不跑 cargo check 并说明原因。

## Definition of Done

- Typecheck 通过。
- 代码改动保持最小，不新增依赖。
- UI 运行态由人工验收，AI 不启动 Tauri 桌面应用。
- 风险与回滚方案已说明。

## Technical Approach

推荐 MVP：复用现有 `splitTerminal`。

- 在 `TerminalTabs.tsx` 增加纯函数推断当前 session/project 的 Agent 命令与标题。
- 扩展 `SplitProjectPicker`，当能推断 Claude/Codex 时，在“空终端”和项目列表之间显示“启动 Claude/Codex 子 Agent”。
- 点击后调用现有 `splitTerminal(sessionId, direction, options)`，options 带入推断出的 `startupCmd`、`title`、`cwd`、`shell`、`envVars`、`projectId`。
- 不改 Rust `pty_create` 和 Hook 环境变量逻辑。

## Decision (ADR-lite)

**Context**: tmux/cmux/Windows Terminal 都不能同时覆盖 CLI-Manager 内置终端的所有平台；项目已有成熟内置 pane 和 PTY 创建路径。

**Decision**: 第一版以内置 pane 为核心，实现手动子 Agent/辅助会话入口；外部 multiplexer 仅作为后续扩展，不进入本次 MVP。

**Consequences**: 跨平台一致性最高、改动最小；缺点是暂不支持在已有 tmux session 内直接 `tmux split-window`，也不自动识别 Claude/Codex 内部子 Agent 事件。

## Out of Scope

- 不实现 Claude/Codex CLI 内部协议解析。
- 不承诺自动识别 Claude/Codex 内部子 Agent 创建事件。
- 不在本次实现 tmux/cmux/Windows Terminal 外部 adapter。
- 不新增设置项、依赖或后端命令。
- 不修改全局 Claude/Codex hook 配置。

## Technical Notes

- Relevant prior research: `.trellis/tasks/06-18-auto-tmux-sub-agent-pane/research/multiplexer-cross-platform.md`。
- Relevant frontend specs:
  - `.trellis/spec/frontend/component-guidelines.md`
  - `.trellis/spec/frontend/state-management.md`
  - `.trellis/spec/frontend/quality-guidelines.md`
- Relevant backend/cross-layer specs:
  - `.trellis/spec/backend/terminal-runtime-monitoring-contracts.md`
  - `.trellis/spec/guides/cross-layer-thinking-guide.md`
  - `.trellis/spec/guides/code-reuse-thinking-guide.md`
- GitNexus impact:
  - `TerminalTabs` upstream risk LOW。
  - `splitTerminal` upstream query matched local frontend const with LOW risk；实际实现位于 `terminalStore.ts`，推荐尽量不改该 store 方法。
