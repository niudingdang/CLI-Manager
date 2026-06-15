# 设置的工具栏添加统计面板按钮的隐藏选项

## Goal

在设置页面「通用设置 - 工具栏」区块新增一个开关，允许用户控制终端标签栏右侧工具栏的「统计」按钮（`BarChart3` 图标）的显示/隐藏。

## What I already know

* **按钮位置**：`src/components/TerminalTabs.tsx` 第 1322-1336 行，终端标签栏右侧工具栏，与「新建」「Templates」「历史命令」「全屏」「会话历史」并列。
* **功能**：点击打开/关闭 `TerminalStatsPanel` 面板（终端实时统计）。
* **现有工具栏配置**：
  - `src/stores/settingsStore.ts` 中 `TerminalToolbarVisibilitySettings` 接口定义工具栏按钮显隐配置。
  - 当前字段：`templates`、`commandHistory`、`fullscreen`、`sessionHistory`、`showText`。
  - `src/components/settings/pages/GeneralSettingsPage.tsx` 第 796-838 行，「工具栏」区块通过 `TERMINAL_TOOLBAR_OPTIONS` 渲染开关列表。
* **设置页面结构**：「通用设置 - 工具栏」区块（第 796 行起），使用 `SimpleGrid` + `Card` + `Switch` 布局。

## Requirements

* [ ] 在 `TerminalToolbarVisibilitySettings` 接口新增 `stats: boolean` 字段，默认 `true`。
* [ ] 在 `DEFAULTS.terminalToolbarVisibility` 中新增 `stats: true`。
* [ ] 在 `TERMINAL_TOOLBAR_OPTIONS` 数组新增 `{ key: "stats", label: "统计" }`。
* [ ] 在 `TerminalTabs.tsx` 中读取 `terminalToolbarVisibility.stats`，条件渲染统计按钮。
* [ ] 类型定义 `TerminalToolbarOptionKey` 自动包含 `stats`。

## Acceptance Criteria

* [ ] 设置页面「通用设置 - 工具栏」区块新增「统计」开关，默认开启。
* [ ] 关闭开关后，终端标签栏右侧工具栏的「统计」按钮立即隐藏。
* [ ] 再次开启开关后，按钮立即恢复显示。
* [ ] 设置持久化到 `tauri-plugin-store`，下次启动生效。
* [ ] 显示/隐藏工具栏文字时，按钮样式一致（图标模式 vs 图标+文字模式）。
* [ ] 类型检查、lint 通过。

## Definition of Done (team quality bar)

* 类型检查、lint 通过。
* 手动验证设置页开关与工具栏按钮显隐联动正常（图标模式 + 文字模式）。
* 确保迁移逻辑兼容（新字段缺失时使用默认值 `true`）。

## Out of Scope (explicit)

* 不涉及统计面板（`TerminalStatsPanel`）内部功能变更。
* 不涉及其他工具栏按钮显隐逻辑调整。
* 不涉及侧边栏底部的「历史用量统计」按钮（那是另一个入口）。

## Technical Notes

* 文件路径：
  - `src/stores/settingsStore.ts` — 扩展 `TerminalToolbarVisibilitySettings` 接口与默认值
  - `src/components/settings/pages/GeneralSettingsPage.tsx` — 扩展 `TERMINAL_TOOLBAR_OPTIONS`
  - `src/components/TerminalTabs.tsx` — 条件渲染统计按钮
* 参考现有字段：`templates`、`commandHistory`、`fullscreen`、`sessionHistory`
* 迁移逻辑：`settingsStore.load()` 中已有字段缺失回退逻辑，新增字段自动继承
