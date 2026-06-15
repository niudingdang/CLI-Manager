# fix-claude-code-ime-drift

## Goal

修复 CLI-Manager 内嵌 xterm 终端中，Claude Code 输出动画/流式重绘时导致中文输入法候选框或 composition 输入锚点漂移的问题。目标是用最小改动让 IME 锚点采样基于 xterm 已处理后的光标位置，而不是写入前或解析中的瞬时光标。

## What I already know

* 用户确认的问题场景：在 Claude Code 终端中，输出动画似乎占用光标位置，导致输入法漂移。
* 相关实现集中在 `src/components/XTermTerminal.tsx`。
* 现有代码已有 IME composition 锚点冻结、TUI 输入行识别、静默光标采样和 render 后覆盖逻辑。
* xterm `Terminal.write(data, callback)` 的类型注释说明：写入是异步处理；只有 callback 执行后，buffer 才反映本次写入变化。
* 当前代码在写入前调用 `noteTerminalWriteActivity()`，可能过早启动 60ms 静默采样，采到动画/状态行中途光标。
* GitNexus impact：`XTermTerminal` upstream risk 为 LOW，直接调用方 0、受影响流程 0。

## Requirements

* 保留现有 IME composition 锚点冻结机制，不推翻已有输入行识别和静默采样设计。
* 将“最近终端写入活动”和“静默光标采样”的触发点调整到 xterm write callback 后。
* 普通完整 chunk 写入和按 `ACTIVE_WRITE_FRAME_BUDGET` 分片写入都必须在 xterm 处理完成后记录写入活动。
* 不新增依赖，不改后端 PTY，不改配置，不做无关重构。

## Acceptance Criteria

* [ ] `src/components/XTermTerminal.tsx` 中静默采样不再在 `terminal.write()` 前启动。
* [ ] 每次发送给 xterm 的 write chunk 都通过 callback 触发 `noteTerminalWriteActivity()`。
* [ ] TypeScript 检查通过：`npx tsc --noEmit`。
* [ ] 人工验证：Claude Code 输出动画/流式输出期间开始中文 IME composition，候选框仍靠近真实输入位置。
* [ ] 人工验证：普通输入、回车、粘贴、中文 composition 结束后恢复离屏 helper textarea 行为。

## Definition of Done

* 最小代码改动完成。
* 静态检查通过，若失败需如实记录原因。
* 运行态 UI/IME 由人工验收，AI 不启动 Tauri 桌面应用。
* 若发现可沉淀的新规则，再更新相关 spec；否则不改 spec。

## Technical Approach

在 `flushActiveWriteQueue()` 中移除写入前的 `noteTerminalWriteActivity()`。新增一个很小的本地 helper，例如 `writeTerminalChunk(chunk)`，内部调用 `terminal.write(chunk, noteTerminalWriteActivity)`。这样 `lastTerminalWriteAtRef` 和后续 quiet cursor sample 都以 xterm parser 已处理完该 chunk 的时刻为准。

## Decision (ADR-lite)

**Context**: Claude/Codex TUI 会高频重绘并移动硬件光标；现有逻辑依赖静默光标采样作为 compositionstart 撞上重绘中途时的可信锚点。

**Decision**: 不增加新启发式，不扩大 prompt 扫描范围；只修正采样时序，把采样挂到 xterm write callback 后。

**Consequences**: 改动小、风险低；采样时间会比以前稍晚，但更符合 xterm buffer 异步更新语义。运行态 IME 仍需人工验证。

## Out of Scope

* 不重写 IME 锚点算法。
* 不调整 UI 样式或终端布局。
* 不改 Rust PTY 输出逻辑。
* 不修复与 Claude Code 无关的输入法问题。
* 不启动桌面应用做自动 UI 验证。

## Technical Notes

* 相关文件：`src/components/XTermTerminal.tsx`。
* 参考 spec：`.trellis/spec/frontend/component-guidelines.md` 中 “Letting xterm helper textarea follow non-IME redraw cursors”。
* 参考 spec：`.trellis/spec/frontend/quality-guidelines.md` 中 “Manual runtime UI verification”。
* xterm API 证据：`node_modules/@xterm/xterm/typings/xterm.d.ts` 的 `write(data, callback)` 注释说明 buffer 更新需要等待 callback。
