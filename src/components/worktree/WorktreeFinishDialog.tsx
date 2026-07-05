import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { GitFileChange, Project, WorktreeRecord } from "../../lib/types";
import { useI18n } from "../../lib/i18n";
import { useWorktreeStore } from "../../stores/worktreeStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

interface WorktreeFinishDialogProps {
  project: Project | null;
  worktree: WorktreeRecord | null;
  open: boolean;
  onClose: () => void;
}

type Step = "review" | "merge" | "cleanup" | "done";

function formatChangeSummary(changes: GitFileChange[]): string {
  if (changes.length === 0) return "";
  return changes.map((change) => `${change.status} ${change.path}`).join("\n");
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function WorktreeFinishDialog({ project, worktree, open, onClose }: WorktreeFinishDialogProps) {
  const { t } = useI18n();
  const mergeWorktree = useWorktreeStore((state) => state.mergeWorktree);
  const removeWorktree = useWorktreeStore((state) => state.removeWorktree);
  const [changes, setChanges] = useState<GitFileChange[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [commitMessage, setCommitMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !worktree) return;
    setStep("review");
    setCommitMessage(worktree.name);
    setOutput("");
    setError(null);
    setConflicts([]);
    setLoadingChanges(true);
    invoke<GitFileChange[]>("git_get_changes", { projectPath: worktree.path })
      .then(setChanges)
      .catch((err) => setError(errorText(err)))
      .finally(() => setLoadingChanges(false));
  }, [open, worktree]);

  const changeSummary = useMemo(() => formatChangeSummary(changes), [changes]);
  const canCommit = commitMessage.trim().length > 0 && !busy;

  if (!project || !worktree) return null;

  const handleCommit = async () => {
    if (!canCommit) return;
    setBusy(true);
    setError(null);
    setOutput(`git add --all\ngit commit -m "${commitMessage.trim()}"`);
    try {
      await invoke("git_stage_all", { projectPath: worktree.path });
      const commitId = await invoke<string>("git_commit", { projectPath: worktree.path, message: commitMessage.trim() });
      setOutput((current) => `${current}\n${t("worktree.finish.commitResult", { commitId })}`);
      setStep("merge");
    } catch (err) {
      const text = errorText(err);
      if (text === "nothing_staged") {
        setOutput((current) => `${current}\n${t("worktree.finish.nothingToCommit")}`);
        setStep("merge");
      } else {
        setError(text);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleMerge = async () => {
    setBusy(true);
    setError(null);
    setConflicts([]);
    setOutput((current) => `${current}\n\ngit -C "${project.path}" merge --no-ff --no-edit ${worktree.branch}`);
    try {
      const result = await mergeWorktree(worktree);
      setOutput((current) => `${current}\n${result.output}`);
      if (result.merged) {
        setStep("cleanup");
      } else {
        setConflicts(result.conflictFiles);
        setError(t("worktree.finish.mergeConflict"));
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCleanup = async () => {
    setBusy(true);
    setError(null);
    setOutput((current) => `${current}\n\ngit worktree remove "${worktree.path}"\ngit branch -D ${worktree.branch}`);
    try {
      await removeWorktree(worktree, true);
      setStep("done");
      toast.success(t("worktree.finish.cleanupDone"));
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-[520px]" showCloseButton={false}>
        <DialogTitle>{t("worktree.finish.title", { name: worktree.name })}</DialogTitle>
        <DialogDescription className="mt-2">
          {t("worktree.finish.description", { branch: worktree.branch })}
        </DialogDescription>

        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-lg border border-border bg-bg-secondary/60 p-3">
            <div className="mb-1 text-xs font-semibold text-text-secondary">{t("worktree.finish.changes")}</div>
            {loadingChanges ? (
              <div className="text-xs text-text-muted">{t("common.loading")}</div>
            ) : changes.length === 0 ? (
              <div className="text-xs text-text-muted">{t("worktree.finish.noChanges")}</div>
            ) : (
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-text-secondary">{changeSummary}</pre>
            )}
          </div>

          {step === "review" && (
            <div>
              <label className="mb-1 block text-xs text-text-muted">{t("worktree.finish.commitMessage")}</label>
              <Textarea
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.currentTarget.value)}
                className="h-20 resize-none text-sm"
              />
            </div>
          )}

          {output && (
            <pre className="max-h-36 overflow-auto rounded-lg border border-border bg-bg-tertiary p-2 text-[11px] text-text-secondary">{output}</pre>
          )}

          {error && (
            <div className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
              {error}
              {conflicts.length > 0 && (
                <pre className="mt-2 whitespace-pre-wrap">{conflicts.join("\n")}</pre>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
          {step === "review" && <Button onClick={handleCommit} disabled={!canCommit}>{busy ? t("common.processing") : t("worktree.finish.commitAll")}</Button>}
          {step === "merge" && <Button onClick={handleMerge} disabled={busy}>{busy ? t("common.processing") : t("worktree.finish.merge")}</Button>}
          {step === "cleanup" && <Button onClick={handleCleanup} disabled={busy}>{busy ? t("common.processing") : t("worktree.finish.cleanup")}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
