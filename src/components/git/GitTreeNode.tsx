import { ChevronRight, Undo2, Check, Minus } from "../icons";
import type { GitTreeNode, GitFileChange } from "../../lib/types";
import { GitStatusIcon } from "./GitStatusIcon";
import { useGitStore } from "../../stores/gitStore";
import { TERM } from "../stats/termStatsUi";
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "../ui/context-menu";
import { getMaterialFileIcon, getMaterialFolderIcon } from "@baybreezy/file-extension-icon";
import { StageCheckbox, type StageState } from "./StageCheckbox";

// 收集某节点下所有文件变更（含子目录），用于目录级三态暂存框与批量勾选。
function collectFileChanges(node: GitTreeNode): GitFileChange[] {
  if (node.type === "file") return node.change ? [node.change] : [];
  return (node.children ?? []).flatMap(collectFileChanges);
}

// 由一组文件的暂存状态推导三态。
function aggregateStageState(files: GitFileChange[]): StageState {
  if (files.length === 0) return "unchecked";
  const staged = files.filter((f) => f.staged).length;
  if (staged === 0) return "unchecked";
  if (staged === files.length) return "checked";
  return "indeterminate";
}

interface GitTreeNodeProps {
  node: GitTreeNode;
  depth: number;
  treeId: string;
  onFileClick: (filePath: string) => void;
  onRequestDiscard: (path: string, name: string, status: string) => void;
  onToggleStage: (filePath: string, staged: boolean) => void;
  onToggleStagePaths: (paths: string[], allStaged: boolean) => void;
}

export function GitTreeNodeComponent({ node, depth, treeId, onFileClick, onRequestDiscard, onToggleStage, onToggleStagePaths }: GitTreeNodeProps) {
  const { collapsedDirs, toggleDir } = useGitStore();
  // 折叠 key 按分区前缀隔离：已跟踪树与未跟踪树同名目录互不影响。
  const collapseKey = `${treeId}:${node.path}`;
  const isCollapsed = collapsedDirs.has(collapseKey);
  const indentPx = depth * 12 + 4;

  if (node.type === "file") {
    // 获取 Material Design 文件图标（base64 data URI）
    const iconDataUri = getMaterialFileIcon(node.name);

    // 根据 Git 状态给文件名着色
    let fileNameColor = TERM.fg;
    if (node.change) {
      switch (node.change.status) {
        case "M":
          fileNameColor = TERM.blue;
          break;
        case "A":
          fileNameColor = TERM.green;
          break;
        case "D":
          fileNameColor = "#808080";
          break;
        case "U":
        case "??":
          fileNameColor = TERM.red;
          break;
        case "R":
          fileNameColor = TERM.magenta;
          break;
        default:
          fileNameColor = TERM.fg;
      }
    }

    // 已跟踪文件才可回滚；未跟踪(U/??)排除。
    const canDiscard = !!node.change && node.change.status !== "U" && node.change.status !== "??";

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="group flex items-center gap-1.5 rounded py-0.5 px-1 cursor-pointer text-[11px]"
            style={{ paddingLeft: indentPx, backgroundColor: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${TERM.cyan}20`)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            onClick={() => onFileClick(node.path)}
          >
            {/* 占位对齐：文件行无 chevron，补一个等宽占位让复选框列与目录行对齐 */}
            <span className="inline-flex shrink-0" style={{ width: 10 }} aria-hidden="true" />
            <StageCheckbox
              state={node.change?.staged ? "checked" : "unchecked"}
              onToggle={() => {
                if (node.change) onToggleStage(node.path, node.change.staged);
              }}
              title={node.change?.staged ? "取消暂存（移出暂存区）" : "暂存此文件（git add）"}
            />
            <img
              src={iconDataUri}
              alt=""
              width={14}
              height={14}
              className="shrink-0"
              style={{ objectFit: "contain" }}
            />
            <span className="flex-1 truncate" style={{ color: fileNameColor }}>{node.name}</span>
            {canDiscard && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDiscard(node.path, node.name, node.change!.status);
                }}
                className="ui-focus-ring shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: TERM.dim }}
                title="回滚此文件改动"
                aria-label="回滚此文件改动"
              >
                <Undo2 size={11} />
              </button>
            )}
            {node.change && (
              <>
                <GitStatusIcon status={node.change.status} size={12} />
                {(node.change.added > 0 || node.change.deleted > 0) && (
                  <span className="text-[10px]" style={{ color: TERM.dim }}>
                    {node.change.added > 0 && (
                      <span style={{ color: TERM.green }}>+{node.change.added}</span>
                    )}
                    {node.change.added > 0 && node.change.deleted > 0 && " "}
                    {node.change.deleted > 0 && (
                      <span style={{ color: TERM.red }}>-{node.change.deleted}</span>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="flex items-center gap-2"
            onSelect={() => {
              if (node.change) onToggleStage(node.path, node.change.staged);
            }}
          >
            {node.change?.staged ? <Minus size={12} /> : <Check size={12} />}
            {node.change?.staged ? "取消暂存" : "暂存（git add）"}
          </ContextMenuItem>
          <ContextMenuItem
            danger
            disabled={!canDiscard}
            className="flex items-center gap-2"
            onSelect={() => {
              if (canDiscard) onRequestDiscard(node.path, node.name, node.change!.status);
            }}
          >
            <Undo2 size={12} />
            回滚改动
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // 目录节点 - 使用 Material Design 文件夹图标
  const hasChildren = node.children && node.children.length > 0;
  const folderIconDataUri = getMaterialFolderIcon(node.name, !isCollapsed);
  // 目录三态暂存：聚合子孙文件的暂存状态
  const dirFiles = collectFileChanges(node);
  const dirStageState = aggregateStageState(dirFiles);

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="flex items-center gap-1.5 rounded py-0.5 px-1 hover:bg-opacity-10 cursor-pointer font-medium text-[11px]"
            style={{ paddingLeft: indentPx, backgroundColor: "transparent" }}
            onClick={() => toggleDir(collapseKey)}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = `${TERM.cyan}20`)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <span
              className="inline-flex items-center justify-center shrink-0 transition-transform"
              style={{
                transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                color: TERM.dim,
              }}
            >
              <ChevronRight size={10} strokeWidth={2} />
            </span>
            {dirFiles.length > 0 && (
              <StageCheckbox
                state={dirStageState}
                onToggle={() => {
                  // 部分/未暂存 → 全部暂存；全部暂存 → 全部取消
                  const allStaged = dirStageState === "checked";
                  onToggleStagePaths(dirFiles.map((f) => f.path), allStaged);
                }}
                title={dirStageState === "checked" ? "取消暂存该目录（移出暂存区）" : "暂存该目录全部文件（git add）"}
              />
            )}
            <img
              src={folderIconDataUri}
              alt=""
              width={14}
              height={14}
              className="shrink-0"
              style={{ objectFit: "contain" }}
            />
            <span className="flex-1 truncate" style={{ color: TERM.fg }}>{node.name}</span>
            {hasChildren && (
              <span className="text-[9px] rounded px-1 py-0" style={{ color: TERM.dim, backgroundColor: `${TERM.dim}20` }}>
                {node.children!.length}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="flex items-center gap-2"
            disabled={dirFiles.length === 0}
            onSelect={() => {
              const allStaged = dirStageState === "checked";
              onToggleStagePaths(dirFiles.map((f) => f.path), allStaged);
            }}
          >
            {dirStageState === "checked" ? <Minus size={12} /> : <Check size={12} />}
            {dirStageState === "checked" ? "取消暂存该目录" : "暂存该目录（git add）"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {!isCollapsed && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <GitTreeNodeComponent key={child.path} node={child} depth={depth + 1} treeId={treeId} onFileClick={onFileClick} onRequestDiscard={onRequestDiscard} onToggleStage={onToggleStage} onToggleStagePaths={onToggleStagePaths} />
          ))}
        </div>
      )}
    </div>
  );
}
