# Git changes untracked delete menu

## Goal

Add a right-click delete action for untracked files in the Git changes panel so users can remove unwanted untracked files without using the terminal or accidentally triggering tracked-file discard behavior.

## Changelog Target

V1.2.6

## Requirements

* Show a delete action in the Git changes tree context menu for untracked files.
* Show a delete action for untracked directories that deletes the untracked files under that directory.
* Require a destructive confirmation before deleting.
* Backend must revalidate repo-relative paths and only delete files that are still untracked.
* Refresh Git changes after deletion.
* Keep tracked-file discard behavior unchanged.
* Add zh-CN and en-US UI strings.

## Acceptance Criteria

* [ ] Right-clicking an untracked file offers Delete and deletes only after confirmation.
* [ ] Right-clicking an untracked directory offers Delete and deletes only untracked files under it.
* [ ] Right-clicking tracked changes does not expose the untracked-delete action.
* [ ] Backend rejects absolute paths, parent traversal, and tracked paths.
* [ ] Git panel refreshes after successful deletion.
* [ ] Type-check and Rust checks pass for touched code.

## Definition of Done

* Tests added or updated where the backend behavior is risky.
* Frontend type-check passes.
* Rust check/tests pass for Git command changes.
* Changelog and feature inventory updated for user-visible behavior.

## Out of Scope

* Deleting ignored files that are not reported by `git status`.
* Recursive arbitrary folder deletion outside Git untracked status results.
* Changing tracked-file discard semantics.
* Committing changes from this session.

## Technical Notes

* Frontend files: `src/components/git/GitTreeNode.tsx`, `src/components/git/GitChangesTree.tsx`, `src/components/git/GitChangesPanel.tsx`, `src/stores/gitStore.ts`, `src/lib/i18n.ts`.
* Backend files: `src-tauri/src/commands/git.rs`, `src-tauri/src/lib.rs`.
* Existing helper `remove_untracked_snapshot_file` already validates repo-relative paths and removes empty parent directories, but it only supports files and is not exposed as IPC.
* GitNexus MCP tools were not exposed in this Codex session; local symbol and call-site search is used as fallback impact analysis.
