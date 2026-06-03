import { Select } from "@/components/ui/select";
import { RefreshCw, Search, Star, Trash2 } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import type { HistorySearchHit, HistorySessionView, HistorySourceFilter, Project } from "../../lib/types";
import { SearchHitsPanel } from "./SearchHitsPanel";
import { formatTime, makeSessionLabel } from "./historyViewUtils";

const ALL_PROJECTS_SELECT_VALUE = "__all_projects__";

interface SessionGroup {
  label: string;
  items: HistorySessionView[];
}

interface HistoryListPaneProps {
  historySidebarWidth: number;
  sidebarRef: RefObject<HTMLElement | null>;
  sessionListRef: RefObject<HTMLDivElement | null>;
  sourceFilter: HistorySourceFilter;
  projectPathFilter: string | null;
  projects: Project[];
  globalQuery: string;
  activeSessionKey: string | null;
  loadingSessions: boolean;
  loadingMoreSessions: boolean;
  searching: boolean;
  normalizedGlobal: string;
  groupedSessions: SessionGroup[];
  filteredSessionCount: number;
  hasMoreSessions: boolean;
  loadMoreSessionMode: "local" | "backend";
  visibleSessionCount: number;
  searchHits: HistorySearchHit[];
  globalSearchRef: RefObject<HTMLInputElement | null>;
  onRefresh: () => void;
  onSourceFilterChange: (value: HistorySourceFilter) => void;
  onProjectPathFilterChange: (value: string | null) => void;
  onGlobalQueryChange: (value: string) => void;
  onOpenSession: (sessionKey: string) => void;
  onDeleteSession: (session: HistorySessionView) => void;
  onOpenHit: (hit: HistorySearchHit) => void;
  onLoadMoreSessions: () => void;
  onSessionListScroll: () => void;
  onStartResize: (e: ReactMouseEvent) => void;
}

export function HistoryListPane({
  historySidebarWidth,
  sidebarRef,
  sessionListRef,
  sourceFilter,
  projectPathFilter,
  projects,
  globalQuery,
  activeSessionKey,
  loadingSessions,
  loadingMoreSessions,
  searching,
  normalizedGlobal,
  groupedSessions,
  filteredSessionCount,
  hasMoreSessions,
  loadMoreSessionMode,
  visibleSessionCount,
  searchHits,
  globalSearchRef,
  onRefresh,
  onSourceFilterChange,
  onProjectPathFilterChange,
  onGlobalQueryChange,
  onOpenSession,
  onDeleteSession,
  onOpenHit,
  onLoadMoreSessions,
  onSessionListScroll,
  onStartResize,
}: HistoryListPaneProps) {
  return (
    <aside
      ref={sidebarRef}
      className="ui-history-sidebar relative flex min-h-0 min-w-[220px] max-w-[70%] flex-col"
      style={{ width: historySidebarWidth }}
    >
      <div className="ui-history-sidebar-top p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-8 shrink-0 text-[12px]"
            value={sourceFilter}
            onChange={(e) => onSourceFilterChange(e.target.value as HistorySourceFilter)}
            aria-label="历史来源过滤"
          >
            <option value="all">全部来源</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </Select>

          <Select
            className="h-8 min-w-[120px] shrink-0 text-[12px]"
            value={projectPathFilter ?? ALL_PROJECTS_SELECT_VALUE}
            onChange={(e) => {
              const nextValue = e.target.value;
              onProjectPathFilterChange(nextValue === ALL_PROJECTS_SELECT_VALUE ? null : nextValue);
            }}
            aria-label="历史项目过滤"
          >
            <option value={ALL_PROJECTS_SELECT_VALUE}>全部项目</option>
            {projects.map((project) => (
              <option key={project.id} value={project.path}>
                {project.name}
              </option>
            ))}
          </Select>

          <button
            onClick={onRefresh}
            aria-label="刷新历史会话列表"
            className="ui-flat-action ui-toolbar-button ui-toolbar-button-compact shrink-0"
            title="刷新会话列表"
          >
            <RefreshCw size={12} />
            刷新
          </button>
        </div>

        <div className="ui-history-search-shell mt-2 gap-2 px-2.5 py-1.5 text-text-secondary">
          <Search size={13} />
          <input
            ref={globalSearchRef}
            value={globalQuery}
            onChange={(e) => onGlobalQueryChange(e.target.value)}
            aria-label="全局搜索历史会话"
            placeholder="全局搜索（标题/消息/标签）"
            className="flex-1 bg-transparent text-[12px] outline-none"
          />
        </div>

        <div className="mt-1 text-[12px] text-text-muted">Ctrl+K 打开全局搜索</div>
      </div>

      <div ref={sessionListRef} onScroll={onSessionListScroll} className="flex-1 overflow-y-auto">
        {loadingSessions && <div className="px-3 py-4 text-xs text-text-muted">正在加载会话...</div>}

        {!loadingSessions && normalizedGlobal && searching && (
          <div className="px-3 py-2 text-[11px] text-text-muted">正在搜索...</div>
        )}

        {!loadingSessions && normalizedGlobal && (
          <SearchHitsPanel searchHits={searchHits} onOpenHit={onOpenHit} />
        )}

        {!loadingSessions &&
          groupedSessions.map((group) => (
            <div key={group.label}>
              <div className="ui-history-section-label ui-dev-label px-3 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-text-muted">
                {group.label}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.sessionKey}
                  className="ui-list-row flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left"
                  style={{ backgroundColor: item.sessionKey === activeSessionKey ? "var(--bg-tertiary)" : "transparent" }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenSession(item.sessionKey)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      {item.starred && <Star size={12} style={{ color: "var(--warning)" }} fill="currentColor" />}
                      <span className="truncate text-[13px] font-semibold text-text-primary">{item.displayTitle}</span>
                    </div>
                    <div className="ui-dev-label mt-1 text-[11px] text-text-muted">
                      {item.source} · {makeSessionLabel(item)} · {item.message_count} 条消息
                    </div>
                    <div className="ui-dev-label mt-1 text-[11px] text-text-muted">更新于 {formatTime(item.updated_at)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(item)}
                    className="ui-flat-action mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted hover:text-danger"
                    aria-label={`删除历史会话 ${item.displayTitle}`}
                    title="删除历史会话"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}

        {!loadingSessions && filteredSessionCount === 0 && (
          <div className="px-3 py-6 text-center text-xs text-text-muted">未找到匹配会话</div>
        )}

        {!loadingSessions && hasMoreSessions && (
          <div className="p-2">
            <button
              onClick={onLoadMoreSessions}
              className="ui-btn w-full"
              aria-label="加载更多历史会话"
              disabled={loadingMoreSessions}
            >
              {loadingMoreSessions
                ? "正在加载更多..."
                : loadMoreSessionMode === "local"
                  ? `显示更多匹配会话（${visibleSessionCount}/${filteredSessionCount}）`
                  : `继续扫描更多历史（已载入 ${filteredSessionCount} 条）`}
            </button>
          </div>
        )}
      </div>

      <div
        onMouseDown={onStartResize}
        className="ui-history-resize-handle absolute bottom-0 right-0 top-0 z-10 w-1.5 cursor-col-resize transition-colors"
        style={{ opacity: 0.6 }}
      />
    </aside>
  );
}
