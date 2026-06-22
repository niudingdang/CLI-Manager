# 自动检测 CLI 子 Agent 启动并在前端呈现

## Goal

当 Claude Code 在某个终端 Tab 内启动子 Agent（Agent/Task 工具）时，CLI-Manager 自动感知并在前端给出呈现（提示 / 转录面板 / 分屏其一），让用户无需手动操作即可知道"子 Agent 已启动"。解决用户当前痛点：跑子任务时"没有弹窗"，应用对内部子 Agent 完全无感。

## What I already know（已核实）

- 用户期望：内部子 Agent 一启动就自动呈现（本次明确选「自动检测，新功能」，已知悉"新 pane 只能提示、不能承载子 Agent 输出"）。
- 现有 06-19 manual MVP 是**手动**入口：在分屏弹层点"启动 Claude 子 Agent"，开一个独立 `claude` 进程 pane（`TerminalTabs.tsx`）。与本任务不是一回事。
- 现有 Hook 链路（可复用）：
  - 安装：`hook_settings.rs` 把 `cli-manager.exe __hook --source claude --event <Event>` 写入 Claude `settings.json` 的 `hooks`。
  - 触发：`hook_client.rs` 的 `__hook` 子命令读取注入的 `CLI_MANAGER_TAB_ID/PORT/TOKEN` + stdin 事件 JSON，POST 到本地桥接。
  - 接收：`claude_hook.rs` 校验事件白名单后 `emit("claude-hook-notification", payload)`。
  - 消费：`App.tsx:319` 监听该事件 → `terminalStore.handleCliHookEvent` 绑定 Tab，并按事件类型决定是否弹 toast。
- Claude Code 官方 Hooks 已确认存在 **`SubagentStart`** 事件（"When a subagent is spawned"，matcher = agent 类型：`general-purpose`/`Explore`/`Plan`/自定义名）。这是本功能的理想触发点，无需绕 `PreToolUse`。
- `SubagentStart`/相关 hook 在**同一 OS 进程**内运行，自动继承父会话注入的 `CLI_MANAGER_TAB_ID` → 能精确定位是哪个 Tab 启动了子 Agent。
- 子 Agent hook 负载含 `agent_id`、`agent_type`、`session_id`、`cwd`、`transcript_path`、`agent_transcript_path`（子 Agent 独立转录 jsonl）。
- 项目已有 Claude/Codex 转录 jsonl 的解析与渲染能力（历史会话工作区 / `history_get_session` / Diff 视图）。
- **已就地求证**（读取磁盘真实文件）：
  - 子 Agent 转录确实存在且实时写入，路径 = `<~/.claude/projects>/<项目slug=cwd替换分隔符>/<父session_id>/subagents/agent-<agent_id>.jsonl`。
  - 内容是**标准 Claude transcript jsonl**：行含 `isSidechain:true`、`agentId`、`type`(user/assistant)、`message`、`sessionId`(父会话)、`timestamp`、`cwd` 等 → 与现有历史解析器同构，**可复用渲染**。
  - 路径可由 `cwd + 父session_id + agent_id` 推导；若 `SubagentStart` 负载不含路径/agent_id，可退化为 watch `subagents/` 目录捕获新建文件。

## 硬约束（必须写死在范围里）

- **子 Agent 无独立 PTY**：跑在主 Claude 进程内，输出走主会话流 + `agent_transcript_path` jsonl 文件。"在新 pane 看到子 Agent 实时内容"只能靠**读取/tail 那个 jsonl**，不能接 PTY。空占位 pane 无价值。
- **Codex 无对应事件**：本仓库 Codex 仅 `SessionStart/UserPromptSubmit/PermissionRequest/Stop`。自动检测**仅 Claude**，本版不做 Codex 自动检测。
- **`SubagentStop` 不可靠**（官方 issue #33049：Agent 工具/前台子 Agent 结束常不触发 Stop/SubagentStop）。"结束自动关闭/收起"不能强依赖该事件，需有兜底或不做。
- 不改 `pty_create` / hook bridge 对外鉴权契约；不破坏现有实时统计、通知、SessionStart 绑定。

## Assumptions（待确认）

- MVP 触发点用 `SubagentStart`（启动即呈现），不强求"结束"事件。
- **呈现形态已定：转录面板** —— 自动开面板，实时 tail 子 Agent 的转录 jsonl 并复用历史渲染器。
- 需要让用户重新"安装 hook"以注册新的 `SubagentStart` 命令（沿用现有安装按钮即可）。

## Resolved Decisions

- **触发**：订阅 Claude `SubagentStart`（仅 Claude）。
- **形态**：实时转录面板，tail 子 Agent jsonl，复用历史渲染器。
- **挂载**：真·pane 树分屏。**实现策略：把转录建模为带 `kind` 标记的"伪会话"塞进 `terminalStore.sessions`，pane 树算法零改动**（继续操作不透明 sessionId），仅在渲染层（`SplitTerminalView`）分叉：`kind==='subagent-transcript'` → 渲染转录组件，否则 `XTermTerminal`。
- **并行多子 Agent**：同一 Tab 第一个子 Agent → split 出一个转录 pane；后续子 Agent 作为**同 pane 内的 Tab**追加（叶子本就支持 `sessionIds[]` 多 Tab），避免布局被多 pane 撑爆。
- **结束收尾**：不强依赖 `SubagentStop`；转录 pane 由用户手动关闭，转录文件静默 N 秒标记"已结束"（best-effort，非阻塞）。
- **过滤**：MVP 捕获全部 agent_type，不做过滤。

## Requirements

- 注册并转发 Claude `SubagentStart`：`hook_settings.rs` 安装项 + `claude_hook.rs` 事件白名单 + 负载字段（`agentId`/`agentType`/`agentTranscriptPath`）+ `hook_client.rs` 从 stdin 透传这些字段。
- 后端能从 `SubagentStart` 定位子 Agent 转录 jsonl：优先用负载 `agentTranscriptPath`/`agentId`，否则由 `cwd + 父session_id` 推导并 watch `subagents/` 目录捕获新文件。
- 提供转录 tail 能力（增量读取 + 变更推送），供前端实时渲染；复用现有 Claude transcript 解析。
- 前端收到事件 → 在发起 Tab 上 split 出转录 pane（伪会话），多子 Agent 在同 pane 内追加 Tab；正确归属、多窗口不串。
- 转录伪会话**不进入会话持久化/恢复**，应用重启不残留。
- 仅 Claude；非 Claude / 无法定位 Tab / 找不到文件时静默不报错、不影响 CLI。
- 不影响既有事件（SessionStart/UserPromptSubmit/Notification/Stop/StopFailure）与现有分屏/拖拽/键盘导航行为。

## Acceptance Criteria

- [ ] 在已装 hook 的 Claude 终端内启动子 Agent，自动 split 出转录 pane 并实时显示该子 Agent 的转录内容。
- [ ] 同一 Tab 并行多个子 Agent 时，转录在同一 pane 内以多 Tab 并列，不会撑爆布局。
- [ ] 转录 pane 归属发起 Tab，多 Tab/多窗口互不串扰。
- [ ] 关闭转录 pane / 应用重启后无残留伪会话；现有分屏、拖拽、键盘导航不受影响。
- [ ] 非 Claude（Codex/普通 shell）无此行为且不报错。
- [ ] 现有通知/实时统计/SessionStart 绑定不被破坏。
- [ ] `npx tsc --noEmit` 通过；`cd src-tauri && cargo check` 通过；新增可下沉纯逻辑加 `cargo test`。

## Definition of Done

- Typecheck / cargo check 通过；可下沉的纯逻辑加 Rust 单测。
- 改动最小、不新增依赖。
- 运行态 UI 人工验收（AI 不启动桌面应用）。
- 风险与回滚说明清楚（hook 安装项可被现有卸载逻辑清除即为回滚）。

## Technical Approach

数据流：`Claude SubagentStart` → `cli-manager __hook`（读 stdin + 注入的 `CLI_MANAGER_TAB_ID`）→ POST 桥接 → `claude_hook.rs` emit → 前端。

1. **Hook 注册**（`hook_settings.rs`）：claude 安装/卸载/状态校验加入 `SubagentStart`（沿用 `build_command` + `__hook` 标志，自动兼容 WSL/PATH）。
2. **负载透传**（`hook_client.rs` + `claude_hook.rs`）：扩展请求/负载结构带 `agentId`/`agentType`/`agentTranscriptPath`；`SubagentStart` 加入 claude 事件白名单。
3. **转录定位 + tail**（Rust 新增最小命令/watcher）：由负载或 `cwd+父session_id` 解析 jsonl 路径，增量读取并向前端推送新行；复用现有 transcript 解析逻辑。
4. **伪会话模型**（`terminalStore.ts`）：`TerminalSession` 加判别字段 `kind: "pty" | "subagent-transcript"` + 转录元数据（path/agentId/agentType）；`splitTerminal` 支持创建转录伪会话；持久化层跳过转录伪会话。
5. **渲染分叉**（`SplitTerminalView` / pane 叶子渲染）：转录会话渲染 `<SubagentTranscriptView>`（复用历史渲染器），否则 `XTermTerminal`。pane 树（`terminalPaneTree.ts`）**不改**。
6. **事件接入**（`App.tsx`）：`SubagentStart` 分支 → 定位 Tab → split 或追加 Tab，并启动 tail。

## Decision (ADR-lite)

**Context**：用户要"真·pane 分屏"看子 Agent；但 pane 树只承载 PTY 会话，子 Agent 又无独立 PTY、仅有转录 jsonl。
**Decision**：转录建模为 `kind` 标记的伪会话，pane 树算法零改动，仅渲染层分叉；触发用 Claude `SubagentStart`，内容用 tail jsonl + 复用历史渲染。
**Consequences**：拿到"真 pane 分屏"体验且核心树回归风险最低；代价是引入会话判别分支（需全面 grep 现有 `sessions` 消费点确保不误把伪会话当 PTY 处理，如 resize/write/close/持久化）。仅 Claude；`SubagentStop` 不可靠致结束态为 best-effort。

## Implementation Plan（小步 PR）

- **PR1 后端管线**：hook 注册 + 负载透传 + `SubagentStart` 白名单 + 转录定位/tail 命令；含路径推导与解析的 `cargo test`。（先用真实子 Agent 抓一次 `SubagentStart` stdin 核实字段。）
- **PR2 伪会话 + 渲染**：`terminalStore` 加 `kind`、持久化跳过、`splitTerminal` 支持转录会话；`SplitTerminalView` 渲染分叉 + `SubagentTranscriptView`（复用历史渲染）。审计所有 `sessions` 消费点。
- **PR3 自动接入 + 收尾**：`App.tsx` 接 `SubagentStart` → split/追加 Tab + 启动 tail；并行多子 Agent 同 pane 多 Tab；静默结束标记；多窗口隔离与边界。



- 不做 Codex 子 Agent 自动检测。
- 不为子 Agent 接独立 PTY，不做空占位 pane。
- 不强依赖 `SubagentStop` 做结束收尾。
- 不改 Claude/Codex CLI 本体或全局 hook 鉴权契约。

## Technical Notes

- Files: `src-tauri/src/commands/hook_settings.rs`、`src-tauri/src/claude_hook.rs`、`src-tauri/src/hook_client.rs`、`src/App.tsx`、`src/stores/terminalStore.ts`、（形态 B 才涉及）历史转录渲染组件。
- Refs: Claude Code Hooks 官方文档（SubagentStart/SubagentStop、agent_id/agent_transcript_path）；issue anthropics/claude-code#33049。
- 既有 manual MVP：`06-19-cross-platform-sub-agent-split-pane-support`（手动入口，互补不冲突）。
