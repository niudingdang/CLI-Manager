# 实时统计按 sessionId↔tabId 绑定并门控 Token 类卡片

## Goal

让终端右侧实时统计面板的 4 张「会话级」卡片严格绑定到本终端 hook 回调拿到的 CLI 会话（`cliSessionId`），其余卡片正常展示；切换 Tab 重新查询，并按 tabId 做内存缓存。

本任务取代以下两个在途任务的旧实现方案：
- `06-15-fix-live-stats-multi-window-isolation`（原方案：store 内维护 tabId→cliSessionId 映射）
- `06-15-fix-codex-live-stats-context`（原策略：无 cliSessionId 时回退并展示全部数据）

## 现状

- `handleCliHookEvent`（`terminalStore.ts:510`）已把 hook payload 的 `sessionId` 按 tabId 写入 `TerminalSession.cliSessionId`。
- 面板 `TerminalStatsPanel.tsx` 已按 `activeSessionId`(tabId) 作用域查询，`scopeKey` 含 tabId，切 Tab 会重新查询。
- 4 张卡（`TokenUsageCard / TrendCard / ModelContextCard / ToolsCard`）全部来自 `fetchLatestProjectSessionDetail` 返回的那条会话。
- `HistorySessionDetail extends HistorySessionSummary`，带 `session_id`（`types.ts:113/163`），可与 `cliSessionId` 比对判断绑定。
- 当前 `fetchLatestProjectSessionDetail` 是 4 参函数，但面板调用传了第 5 个参数 `activeSessionId`（多窗口隔离任务遗留的半成品，类型错误）。
- 当前 `awaitingSessionId` 会在「本终端无 cliSessionId 但其他终端已绑定」时把**整个面板**置为空态。

## 核心思路

把「防 token 串显」的手段从「不回退 / 整面板空态」改为「按 `session_id` 绑定门控 4 张卡」：

```
tokensBound = !!cliSessionId && latestSession.session_id === cliSessionId
```

- `tokensBound` 为真：渲染 4 张 token 卡。
- `tokensBound` 为假：4 张卡替换为一条统一空态提示；会话信息卡 + 今日项目用量按项目级回退正常展示。

token 数据不再可能串显（未绑定即空），因此可以安全地恢复「严格查询未命中时回退项目最近会话」，让其余信息正常显示。

## Requirements

- 4 张卡（Token 用量 / Token 趋势 / 模型与上下文 / 工具与扩展）仅在 `tokensBound` 为真时展示；否则显示统一空态提示。
- 无 hook 回调（无 `cliSessionId`）时：会话信息卡（项目/路径/分支/消息分布）与今日项目用量正常展示，4 张卡置空。
- 即使加载到会话但其 `session_id` 不等于本终端 `cliSessionId`，4 张卡仍置空。
- 切换 Tab 重新查询；按 `scopeKey`（含 tabId）做前端内存缓存，切回先显缓存再后台刷新。
- 移除 `awaitingSessionId` 整面板空态逻辑。
- 清理 `fetchLatestProjectSessionDetail` 调用处多传的第 5 个参数（恢复类型正确）。

## Acceptance Criteria

- [ ] 同项目多个 Claude/Codex 终端并行：各自只在收到自己的 hook sessionId 后展示 4 卡数据，互不串显。
- [ ] 无 hook 终端：会话信息 + 今日用量正常显示，4 卡为统一空态提示。
- [ ] 切换 Tab 立即重新查询，且切回已看过的 Tab 时先显缓存不闪「加载中」。
- [ ] `npx tsc --noEmit` 通过。

## Out of Scope

- 不改 hook 上报/安装逻辑、不改后端解析、不加依赖。
- 不重做历史分析看板。
- 不做缓存淘汰策略（终端数量有限，先不处理内存回收）。

## Technical Notes

- `src/stores/historyStore.ts`：`fetchLatestProjectSessionDetail` 严格查询未命中时回退 `loadSummary(null)`；签名保持 4 参。
- `src/components/terminal/TerminalStatsPanel.tsx`：计算 `tokensBound`；条件渲染 4 卡 / 空态；移除 `awaitingSessionId`；新增 `Map<scopeKey, HistorySessionDetail>` 内存缓存并在 scopeKey 变化时 seed。
