# 统一项目滚动条样式

## Goal

将应用内可见滚动条统一为 Git/Diff 变更视图当前使用的滚动条风格，减少不同面板之间的视觉割裂。

## What I Already Know

- 用户要求：项目内所有滚动条都使用“git 变更”这种滚动条，保证统一。
- 现有 Diff 滚动条定义在 `src/App.css` 的 `.diff-code-scroll`：`scrollbar-width: thin`、`scrollbar-color: var(--border) transparent`、WebKit 滚动条 `10px`、透明轨道、`var(--border)` 圆角 thumb。
- 现有通用滚动条 `.ui-thin-scroll` 和 xterm viewport 滚动条使用不同颜色/宽度/hover 规则。
- 多数滚动容器没有统一 class，依赖浏览器默认滚动条；用全局 CSS 是最小可行路径。

## Requirements

- 所有可见浏览器滚动条默认使用 Git/Diff 变更视图风格。
- 保持 `.diff-code-scroll` 的现有视觉不回退。
- 收敛 `.ui-thin-scroll` 与 xterm viewport 的差异，避免同一应用多套滚动条。
- 不改变滚动行为、数据逻辑、布局结构或依赖。

## Acceptance Criteria

- [x] `src/App.css` 中默认滚动条、`.diff-code-scroll`、`.ui-thin-scroll`、xterm viewport 使用同一套颜色、圆角和宽度语义。
- [x] 已知滚动容器无需逐个加 class 也能继承统一风格。
- [x] `npx tsc --noEmit` 通过，或记录无法验证的原因。
- [ ] 人工检查 Git 变更、历史 Diff、设置页、历史会话、统计面板、终端滚动条视觉一致。

## Definition of Done

- 静态检查完成。
- 不混入无关 WIP 文件。
- 若发现需要记录的新前端规范，再更新 `.trellis/spec/frontend/`。

## Technical Approach

在 `src/App.css` 增加一组全局 scrollbar token/规则，并让 `.diff-code-scroll`、`.ui-thin-scroll`、xterm viewport 复用该规则。保留 `ui-terminal-tab-scroll` 的隐藏规则，避免终端标签栏出现额外可见滚动条。

## Out of Scope

- 不重构组件结构。
- 不逐个给所有滚动容器补 class。
- 不调整滚动区域尺寸、布局、数据加载或虚拟列表逻辑。
- 不启动 Tauri 桌面应用做运行时 UI 验证。

## Technical Notes

- 读取文件：`src/App.css`、`src/components/history/DiffModal.tsx`、`src/components/git/DiffViewerModal.tsx`、`src/components/git/diffViewer.css`。
- 前端规范：`.trellis/spec/frontend/index.md`、`.trellis/spec/frontend/component-guidelines.md`、`.trellis/spec/frontend/quality-guidelines.md`。
- 当前工作区已有多处未提交改动，本任务应只触碰 `src/App.css` 和本任务目录。
