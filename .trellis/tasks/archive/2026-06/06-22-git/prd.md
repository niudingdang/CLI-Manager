# Git 变更分组展示（Group By Module / Directory）

## Goal

在 Git 变更面板中实现 JetBrains 风格的分组展示功能：
1. **Group By Directory**：按目录树展示变更，连续单子目录链压缩成一行（已实现渲染层压缩）
2. **Group By Module**：按顶层目录（视为模块）分组展示变更，每个模块独立折叠
3. 提供顶部切换入口，用户可在两种模式间切换，状态持久化

## What I already know

* 用户希望实现 JetBrains 的 Group By Module 和 Group By Directory 分组模式。
* 用户提供的参考图中，JetBrains 按模块把变更文件分组，每个模块是一个顶层可折叠节点。
* 已实现渲染层目录链压缩（`collectCompactDirectoryChain`）：当前目录独立成行，从其唯一子目录开始压缩成下一行。
* 当前项目 Git 变更 UI：`GitChangesPanel.tsx`（顶层容器） → `GitChangesTree.tsx`（树渲染） → `GitTreeNode.tsx`（节点递归）。
* 当前树数据由 `gitStore.ts` 的 `buildTree()` / `rebuildTrees()` 从 Git 文件变更路径构建，已跟踪树与未跟踪树分离。
* `GitTreeNode` 类型只有 `type/name/path/children/change`，没有模块/分组字段。
* 确认方案：**1-A 保留扩展 + 2-B 按顶层目录当模块 + 3-A 顶部切换菜单**。

## Requirements (evolving)

### Group By Directory（已部分实现）
* Git 变更树中，连续的”单子目录”链应压缩成一行显示。
* 压缩后不应改变原始文件路径、点击文件、暂存/取消暂存、目录级勾选、右键菜单、折叠状态等行为。
* UI 采用 JetBrains 风格：首段目录保持文件夹图标与主目录名，后续连续目录链用较弱的路径文本显示。

### Group By Module（待实现）
* 按文件路径的第一级目录将变更分组，每个顶层目录视为一个模块。
* 每个模块显示为独立的顶层可折叠节点，展示模块名 + 该模块下的文件统计。
* 模块内部的子目录/文件继续使用 Directory 模式的压缩逻辑。
* 模块级复选框应覆盖该模块下所有文件的暂存/选中操作。

### 切换入口（待实现）
* 在 Git 变更面板顶部（Header 区域）添加分组模式切换按钮/下拉菜单。
* 切换状态持久化到 `settingsStore`，下次打开面板恢复上次选择的模式。
* 切换时保留当前的折叠状态（尽量），避免用户体验跳变。

### 通用要求
* 已跟踪变更树和未跟踪文件树都应支持两种分组模式。
* UI 需保留当前的图标、勾选框、计数、Git 状态视觉风格。

## Decision (ADR-lite)

**Context**: 目录层级很深时，当前逐层渲染会占用大量纵向空间，尤其 Java/package 类路径会让用户需要滚动很久才能看到文件。用户希望同时支持 JetBrains 的两种分组模式：按目录树（Directory）和按模块（Module）。

**Decision**: 
1. **渲染层压缩（Directory 模式）**：已实现 `collectCompactDirectoryChain()`，在目录节点渲染时压缩连续单子目录链，显示为”首段目录 + 弱化路径文本”，保留原始树数据与真实路径。
2. **数据层分组（Module 模式）**：在 `gitStore.ts` 新增 `buildTreeByModule()` 函数，按文件路径第一级目录分组构建树，每个顶层目录作为模块节点。模块内部继续使用 Directory 压缩逻辑。
3. **切换机制**：在 `settingsStore` 新增 `gitGroupBy: 'directory' | 'module'` 设置项，`gitStore` 根据该设置调用不同的树构建函数。`GitChangesPanel` 顶部添加切换按钮。

**Consequences**: 
- Directory 模式影响范围仅限 Git 树 UI 渲染层。
- Module 模式需要扩展 `GitTreeNode` 类型，增加 `isModuleRoot?: boolean` 标识模块节点。
- 两种模式共用相同的折叠、勾选、右键操作逻辑，降低维护成本。
- 切换时需要重建树，可能丢失当前折叠状态（可接受的权衡）。

## Acceptance Criteria (evolving)

### Directory 模式
* [x] 对于 `a/b/c/file.ts` 且 `a -> b -> c` 每层只有一个子目录分支时，树中不再逐层占 3 行，而是压缩显示（当前目录独立一行，后续链压缩成下一行）。
* [x] 如果某目录下有多个子目录或文件，合并在分叉处停止，不隐藏同级变更。
* [x] 点击压缩目录行仍能折叠/展开该压缩链末端下的内容。
* [x] 目录复选框作用范围仍覆盖该目录/压缩链下所有文件。
* [x] 文件行仍显示原文件名、状态、增删统计，并能打开 diff。
* [x] 前端类型检查 `npx tsc --noEmit` 通过。

### Module 模式（待验证）
* [x] 数据层：`buildTreeByModule()` 按第一级目录分组构建树，每个顶层目录标记为模块根。
* [x] 模块节点使用 `isModuleRoot: true` 标识，渲染时应用加粗样式。
* [x] 模块内部子树继续使用 Directory 压缩逻辑（复用 `collectCompactDirectoryChain`）。
* [ ] **待手动验证**：模块节点可折叠/展开，展开后显示该模块内的目录树。
* [ ] **待手动验证**：模块级复选框正确反映该模块下所有文件的暂存/选中状态。
* [ ] **待手动验证**：已跟踪树和未跟踪树都支持 Module 分组。

### 切换入口（待验证）
* [x] Git 变更面板 Header 左侧添加分组模式切换下拉菜单（图标：Directory=FolderTree，Module=Layers）。
* [x] 点击菜单项切换模式，立即调用 `updateSettings` 并刷新树。
* [x] 切换状态持久化到 `settingsStore.gitGroupBy`，默认值 `"directory"`。
* [x] 前端类型检查通过。
* [ ] **待手动验证**：切换后树立即重新渲染为对应模式，视觉效果符合预期。
* [ ] **待手动验证**：重启应用后分组模式恢复上次选择。

## Definition of Done

* 代码改动范围清晰，尽量局部在 Git 树构建/渲染层。
* 前端类型检查通过；如未运行，明确说明原因。
* 不主动提交，等待用户明确指令。

## Out of Scope (explicit)

* 不重做 Git 变更面板整体布局。
* 不改变 Git 暂存/提交/回滚语义。
* 不改变后端 Git 命令或数据库结构。
* 不引入新的 UI 组件库。

## Technical Notes

* 可能改动文件：
  * `src/components/git/GitTreeNode.tsx`：最可能在渲染层压缩连续目录链，保持 store 数据结构不变。
  * `src/stores/gitStore.ts`：如果需要在数据层预处理压缩，可能影响折叠 key 与目录路径收集，风险更高。
  * `src/lib/types.ts`：若采用数据层压缩，可能需要扩展 `GitTreeNode`；渲染层压缩则不一定需要。
* 推荐优先采用“渲染层压缩”：在目录节点渲染时沿着 `children.length === 1 && child.type === "directory"` 向下收集链条，仅改变显示 label 和递归起点，不改变原始树结构。
