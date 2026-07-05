use git2::Repository;
use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const WORKTREE_BRANCH_PREFIX: &str = "wt/";
const MAX_TASK_NAME_LEN: usize = 64;
const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
    "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8",
    "LPT9",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeCreateRequest {
    pub project_path: String,
    pub task_name: String,
    pub worktree_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeCreateResult {
    pub name: String,
    pub branch: String,
    pub path: String,
    pub base_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeMergeResult {
    pub merged: bool,
    pub output: String,
    pub conflict_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktreeDepsCheckResult {
    pub needs_install: bool,
    pub command: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug)]
struct GitCommandOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

impl GitCommandOutput {
    fn combined(&self) -> String {
        format!("{}{}", self.stdout, self.stderr).trim().to_string()
    }
}

fn strip_windows_extended_path_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("\\\\?\\") {
        if let Some(unc_tail) = rest.strip_prefix("UNC\\") {
            return format!("\\\\{unc_tail}");
        }
        return rest.to_string();
    }
    if let Some(rest) = path.strip_prefix("//?/") {
        if let Some(unc_tail) = rest.strip_prefix("UNC/") {
            return format!("//{unc_tail}");
        }
        return rest.to_string();
    }
    path.to_string()
}

fn local_path_from_input(path: &str) -> PathBuf {
    PathBuf::from(strip_windows_extended_path_prefix(path.trim()))
}

fn path_to_git_arg(path: &Path) -> String {
    strip_windows_extended_path_prefix(&path.to_string_lossy())
}

fn is_wsl_path(path: &str) -> bool {
    let plain = strip_windows_extended_path_prefix(path);
    let normalized = plain.replace('/', "\\").to_lowercase();
    normalized.starts_with("\\\\wsl$\\") || normalized.starts_with("\\\\wsl.localhost\\")
}

fn is_unc_or_remote_path(path: &str) -> bool {
    let plain = strip_windows_extended_path_prefix(path.trim());
    let normalized = plain.replace('/', "\\").to_lowercase();
    normalized.starts_with("\\\\")
        || normalized.contains("://")
        || normalized.starts_with("git@")
}

fn ensure_supported_local_path(path: &str) -> Result<(), String> {
    if is_wsl_path(path) {
        return Err("unsupported_wsl".to_string());
    }
    if is_unc_or_remote_path(path) {
        return Err("unsupported_remote_path".to_string());
    }
    Ok(())
}

fn open_main_repo(project_path: &str) -> Result<Repository, String> {
    ensure_supported_local_path(project_path)?;
    let path = local_path_from_input(project_path);
    if !path.exists() {
        return Err("path_not_found".to_string());
    }
    if !path.is_dir() {
        return Err("path_not_directory".to_string());
    }
    let repo = Repository::open(&path).map_err(|_| "not_git_repository".to_string())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "bare_repository_unsupported".to_string())?;
    if normalize_path_for_compare(workdir) != normalize_path_for_compare(&path) {
        return Err("project_path_not_repo_root".to_string());
    }
    Ok(repo)
}

fn validate_task_name(task_name: &str) -> Result<String, String> {
    let trimmed = task_name.trim();
    if trimmed.is_empty() {
        return Err("task_name_empty".to_string());
    }
    if trimmed.len() > MAX_TASK_NAME_LEN {
        return Err("task_name_too_long".to_string());
    }
    if trimmed.starts_with('-') {
        return Err("task_name_invalid".to_string());
    }
    if !trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("task_name_invalid".to_string());
    }
    if RESERVED_WINDOWS_NAMES
        .iter()
        .any(|reserved| trimmed.eq_ignore_ascii_case(reserved))
    {
        return Err("task_name_reserved".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_worktree_branch(branch: &str) -> Result<(), String> {
    let task_name = branch
        .strip_prefix(WORKTREE_BRANCH_PREFIX)
        .ok_or_else(|| "branch_not_worktree".to_string())?;
    validate_task_name(task_name)?;
    Ok(())
}

fn validate_plain_branch_name(branch: &str) -> Result<(), String> {
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("base_branch_empty".to_string());
    }
    if trimmed != branch
        || trimmed.starts_with('-')
        || trimmed.starts_with('/')
        || trimmed.ends_with('/')
    {
        return Err("base_branch_invalid".to_string());
    }
    if trimmed.contains("..") || trimmed.ends_with(".lock") {
        return Err("base_branch_invalid".to_string());
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_control() || matches!(ch, ' ' | '~' | '^' | ':' | '?' | '*' | '[' | '\\'))
    {
        return Err("base_branch_invalid".to_string());
    }
    Ok(())
}

fn current_branch_name(repo: &Repository) -> Result<String, String> {
    let head = repo.head().map_err(|_| "head_not_found".to_string())?;
    if !head.is_branch() {
        return Err("detached_head".to_string());
    }
    head.shorthand()
        .map(|value| value.to_string())
        .ok_or_else(|| "branch_name_unknown".to_string())
}

fn default_worktree_root(project_path: &Path) -> Result<PathBuf, String> {
    let project_name = project_path
        .file_name()
        .and_then(OsStr::to_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "project_name_unknown".to_string())?;
    let parent = project_path
        .parent()
        .ok_or_else(|| "project_parent_unknown".to_string())?;
    Ok(parent.join(format!("{project_name}-worktrees")))
}

fn resolve_worktree_target_path(
    project_path: &Path,
    task_name: &str,
    worktree_root: Option<&str>,
) -> Result<PathBuf, String> {
    let raw_root = match worktree_root
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(root) => {
            ensure_supported_local_path(root)?;
            let path = local_path_from_input(root);
            if !path.is_absolute() {
                return Err("worktree_root_not_absolute".to_string());
            }
            path
        }
        None => default_worktree_root(project_path)?,
    };

    fs::create_dir_all(&raw_root).map_err(|e| format!("create_worktree_root_failed: {e}"))?;
    let root = raw_root
        .canonicalize()
        .map_err(|e| format!("canonicalize_worktree_root_failed: {e}"))?;
    let target = root.join(task_name);
    if target.exists() {
        return Err("worktree_path_exists".to_string());
    }
    if !target.starts_with(&root) {
        return Err("worktree_path_escape".to_string());
    }
    Ok(target)
}

fn run_git_raw<I, S>(cwd: &Path, args: I) -> Result<GitCommandOutput, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    if !cwd.exists() {
        return Err("path_not_found".to_string());
    }

    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "git_not_found".to_string()
        } else {
            format!("spawn_failed: {e}")
        }
    })?;

    Ok(GitCommandOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn run_git_checked<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let output = run_git_raw(cwd, args)?;
    if output.success {
        Ok(output.combined())
    } else {
        let combined = output.combined();
        let snippet: String = combined.chars().take(300).collect();
        Err(format!("git_failed: {snippet}"))
    }
}

fn branch_exists(project_path: &Path, branch: &str) -> Result<bool, String> {
    let branch_ref = format!("refs/heads/{branch}");
    let output = run_git_raw(project_path, ["rev-parse", "--verify", branch_ref.as_str()])?;
    Ok(output.success)
}

fn should_cleanup_worktree_branch_after_failed_add(
    branch: &str,
    branch_existed_before_add: bool,
) -> bool {
    !branch_existed_before_add && validate_worktree_branch(branch).is_ok()
}

fn cleanup_worktree_branch_after_failed_add(
    project_path: &Path,
    branch: &str,
    branch_existed_before_add: bool,
) {
    if !should_cleanup_worktree_branch_after_failed_add(branch, branch_existed_before_add) {
        return;
    }
    let _ = run_git_raw(project_path, ["branch", "-D", branch]);
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorktreeListEntry {
    path: PathBuf,
    branch: Option<String>,
}

fn parse_worktree_list_entries(output: &str) -> Vec<WorktreeListEntry> {
    let mut entries = Vec::new();
    let mut current_path: Option<PathBuf> = None;
    let mut current_branch: Option<String> = None;

    let flush = |entries: &mut Vec<WorktreeListEntry>,
                 path: &mut Option<PathBuf>,
                 branch: &mut Option<String>| {
        if let Some(path) = path.take() {
            entries.push(WorktreeListEntry {
                path,
                branch: branch.take(),
            });
        } else {
            let _ = branch.take();
        }
    };

    for line in output.lines() {
        if line.trim().is_empty() {
            flush(&mut entries, &mut current_path, &mut current_branch);
            continue;
        }
        if let Some(path) = line.strip_prefix("worktree ") {
            flush(&mut entries, &mut current_path, &mut current_branch);
            current_path = Some(PathBuf::from(path));
            continue;
        }
        if let Some(branch) = line.strip_prefix("branch refs/heads/") {
            current_branch = Some(branch.to_string());
        }
    }
    flush(&mut entries, &mut current_path, &mut current_branch);
    entries
}

fn normalize_path_for_compare(path: &Path) -> String {
    let normalized_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut value = normalized_path.to_string_lossy().replace('\\', "/");
    while value.ends_with('/') && value.len() > 1 {
        value.pop();
    }
    if cfg!(target_os = "windows") {
        value.to_lowercase()
    } else {
        value
    }
}

fn is_registered_worktree_branch(
    project_path: &Path,
    worktree_path: &Path,
    branch: &str,
) -> Result<bool, String> {
    let output = run_git_checked(project_path, ["worktree", "list", "--porcelain"])?;
    let target = normalize_path_for_compare(worktree_path);
    Ok(parse_worktree_list_entries(&output)
        .iter()
        .any(|registered| {
            normalize_path_for_compare(&registered.path) == target
                && registered.branch.as_deref() == Some(branch)
        }))
}

fn check_dependency_need(path: &Path) -> GitWorktreeDepsCheckResult {
    let node_modules_missing = !path.join("node_modules").exists();
    if path.join("pnpm-lock.yaml").exists() && node_modules_missing {
        return GitWorktreeDepsCheckResult {
            needs_install: true,
            command: Some("pnpm install".to_string()),
            reason: Some("pnpm-lock.yaml exists but node_modules is missing".to_string()),
        };
    }
    if path.join("yarn.lock").exists() && node_modules_missing {
        return GitWorktreeDepsCheckResult {
            needs_install: true,
            command: Some("yarn install".to_string()),
            reason: Some("yarn.lock exists but node_modules is missing".to_string()),
        };
    }
    if (path.join("package-lock.json").exists() || path.join("package.json").exists())
        && node_modules_missing
    {
        return GitWorktreeDepsCheckResult {
            needs_install: true,
            command: Some("npm install".to_string()),
            reason: Some("package.json exists but node_modules is missing".to_string()),
        };
    }
    if path.join("Cargo.toml").exists() && !path.join("target").exists() {
        return GitWorktreeDepsCheckResult {
            needs_install: true,
            command: Some("cargo fetch".to_string()),
            reason: Some("Cargo.toml exists but target is missing".to_string()),
        };
    }

    GitWorktreeDepsCheckResult {
        needs_install: false,
        command: None,
        reason: None,
    }
}

fn conflict_files(project_path: &Path) -> Vec<String> {
    match run_git_raw(project_path, ["diff", "--name-only", "--diff-filter=U"]) {
        Ok(output) => output
            .stdout
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToString::to_string)
            .collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub async fn git_worktree_validate(project_path: String) -> Result<bool, String> {
    tokio::task::spawn_blocking(move || {
        if is_wsl_path(&project_path) {
            return Ok(false);
        }
        let path = local_path_from_input(&project_path);
        if !path.exists() || !path.is_dir() {
            return Ok(false);
        }
        Ok(open_main_repo(&project_path).is_ok())
    })
    .await
    .map_err(|e| format!("task_failed: {e}"))?
}

#[tauri::command]
pub async fn git_worktree_create(
    req: GitWorktreeCreateRequest,
) -> Result<GitWorktreeCreateResult, String> {
    let task_name = validate_task_name(&req.task_name)?;
    tokio::task::spawn_blocking(move || {
        let repo = open_main_repo(&req.project_path)?;
        let base_branch = current_branch_name(&repo)?;
        let project_path = local_path_from_input(&req.project_path)
            .canonicalize()
            .map_err(|e| format!("canonicalize_project_path_failed: {e}"))?;
        let target_path =
            resolve_worktree_target_path(&project_path, &task_name, req.worktree_root.as_deref())?;
        let branch = format!("{WORKTREE_BRANCH_PREFIX}{task_name}");
        validate_worktree_branch(&branch)?;
        let branch_existed_before_add = branch_exists(&project_path, &branch)?;

        let target_arg = path_to_git_arg(&target_path);
        let add_output = run_git_raw(
            &project_path,
            [
                "worktree",
                "add",
                "-b",
                branch.as_str(),
                target_arg.as_str(),
                "HEAD",
            ],
        )?;
        if !add_output.success {
            cleanup_worktree_branch_after_failed_add(
                &project_path,
                &branch,
                branch_existed_before_add,
            );
            let snippet: String = add_output.combined().chars().take(300).collect();
            return Err(format!("git_failed: {snippet}"));
        }

        Ok(GitWorktreeCreateResult {
            name: task_name,
            branch,
            path: path_to_git_arg(&target_path),
            base_branch,
        })
    })
    .await
    .map_err(|e| format!("task_failed: {e}"))?
}

#[tauri::command]
pub async fn git_worktree_check_deps(
    worktree_path: String,
) -> Result<GitWorktreeDepsCheckResult, String> {
    ensure_supported_local_path(&worktree_path)?;
    tokio::task::spawn_blocking(move || {
        let path = local_path_from_input(&worktree_path);
        if !path.exists() {
            return Err("path_not_found".to_string());
        }
        if !path.is_dir() {
            return Err("path_not_directory".to_string());
        }
        Ok(check_dependency_need(&path))
    })
    .await
    .map_err(|e| format!("task_failed: {e}"))?
}

#[tauri::command]
pub async fn git_worktree_merge(
    project_path: String,
    worktree_branch: String,
    base_branch: String,
) -> Result<GitWorktreeMergeResult, String> {
    validate_worktree_branch(&worktree_branch)?;
    validate_plain_branch_name(&base_branch)?;
    tokio::task::spawn_blocking(move || {
        let repo = open_main_repo(&project_path)?;
        let current_branch = current_branch_name(&repo)?;
        let project_path = local_path_from_input(&project_path)
            .canonicalize()
            .map_err(|e| format!("canonicalize_project_path_failed: {e}"))?;

        let status = run_git_checked(&project_path, ["status", "--porcelain"])?;
        if !status.trim().is_empty() {
            return Err("dirty_main_worktree".to_string());
        }
        if current_branch != base_branch {
            run_git_checked(&project_path, ["checkout", base_branch.as_str()])?;
        }
        let branch_ref = format!("refs/heads/{worktree_branch}");
        let branch_exists = run_git_raw(&project_path, ["rev-parse", "--verify", branch_ref.as_str()])?;
        if !branch_exists.success {
            return Err("worktree_branch_not_found".to_string());
        }

        let merge_output = run_git_raw(
            &project_path,
            ["merge", "--no-ff", "--no-edit", worktree_branch.as_str()],
        )?;
        if merge_output.success {
            return Ok(GitWorktreeMergeResult {
                merged: true,
                output: merge_output.combined(),
                conflict_files: Vec::new(),
            });
        }

        let files = conflict_files(&project_path);
        if !files.is_empty() {
            let _ = run_git_raw(&project_path, ["merge", "--abort"]);
            return Ok(GitWorktreeMergeResult {
                merged: false,
                output: format!("merge_conflict: {}", merge_output.combined()),
                conflict_files: files,
            });
        }

        let _ = run_git_raw(&project_path, ["merge", "--abort"]);
        let snippet: String = merge_output.combined().chars().take(300).collect();
        Err(format!("merge_failed: {snippet}"))
    })
    .await
    .map_err(|e| format!("task_failed: {e}"))?
}

#[tauri::command]
pub async fn git_worktree_remove(
    project_path: String,
    worktree_path: String,
    branch: String,
    delete_branch: bool,
) -> Result<String, String> {
    validate_worktree_branch(&branch)?;
    ensure_supported_local_path(&worktree_path)?;
    tokio::task::spawn_blocking(move || {
        open_main_repo(&project_path)?;
        let project_path = local_path_from_input(&project_path)
            .canonicalize()
            .map_err(|e| format!("canonicalize_project_path_failed: {e}"))?;
        let target_path = local_path_from_input(&worktree_path);
        if !target_path.is_absolute() {
            return Err("worktree_path_not_absolute".to_string());
        }
        if !is_registered_worktree_branch(&project_path, &target_path, &branch)? {
            return Err("worktree_not_registered".to_string());
        }

        let target_arg = path_to_git_arg(&target_path);
        let mut output = String::new();
        if target_path.exists() {
            output.push_str(&run_git_checked(
                &project_path,
                ["worktree", "remove", "--force", target_arg.as_str()],
            )?);
        } else {
            output.push_str(&run_git_checked(&project_path, ["worktree", "prune"])?);
        }

        if delete_branch {
            if !output.is_empty() {
                output.push('\n');
            }
            output.push_str(&run_git_checked(
                &project_path,
                ["branch", "-D", branch.as_str()],
            )?);
        }

        Ok(output.trim().to_string())
    })
    .await
    .map_err(|e| format!("task_failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        check_dependency_need, default_worktree_root, parse_worktree_list_entries, path_to_git_arg,
        resolve_worktree_target_path, should_cleanup_worktree_branch_after_failed_add,
        validate_plain_branch_name, validate_task_name, validate_worktree_branch,
    };
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn validates_task_names() {
        assert_eq!(
            validate_task_name("task-0705_1200").unwrap(),
            "task-0705_1200"
        );
        assert_eq!(validate_task_name("").unwrap_err(), "task_name_empty");
        assert_eq!(validate_task_name("-bad").unwrap_err(), "task_name_invalid");
        assert_eq!(
            validate_task_name("bad/name").unwrap_err(),
            "task_name_invalid"
        );
        assert_eq!(
            validate_task_name("bad name").unwrap_err(),
            "task_name_invalid"
        );
        assert_eq!(validate_task_name("con").unwrap_err(), "task_name_reserved");
        assert_eq!(
            validate_task_name(&"a".repeat(65)).unwrap_err(),
            "task_name_too_long"
        );
    }

    #[test]
    fn validates_worktree_branch_prefix() {
        assert!(validate_worktree_branch("wt/task-1").is_ok());
        assert_eq!(
            validate_worktree_branch("feature/task-1").unwrap_err(),
            "branch_not_worktree"
        );
        assert_eq!(
            validate_worktree_branch("wt/bad/name").unwrap_err(),
            "task_name_invalid"
        );
    }

    #[test]
    fn computes_default_worktree_root_next_to_project() {
        let project_path = Path::new("/repo/demo-app");
        let root = default_worktree_root(project_path).unwrap();
        assert_eq!(root, PathBuf::from("/repo/demo-app-worktrees"));
    }

    #[test]
    fn resolves_target_path_under_custom_root() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("project");
        let root = temp.path().join("custom-root");
        fs::create_dir_all(&project).unwrap();
        let target =
            resolve_worktree_target_path(&project, "task-1", Some(root.to_str().unwrap())).unwrap();
        assert_eq!(target, root.canonicalize().unwrap().join("task-1"));
    }

    #[test]
    fn git_path_args_do_not_keep_windows_extended_prefix() {
        assert_eq!(
            path_to_git_arg(Path::new("\\\\?\\D:\\repo\\worktrees\\task-1")),
            "D:\\repo\\worktrees\\task-1"
        );
        assert_eq!(
            path_to_git_arg(Path::new("//?/D:/repo/worktrees/task-1")),
            "D:/repo/worktrees/task-1"
        );
    }

    #[test]
    fn cleanup_after_failed_add_is_limited_to_new_wt_branches() {
        assert!(should_cleanup_worktree_branch_after_failed_add(
            "wt/task-1",
            false
        ));
        assert!(!should_cleanup_worktree_branch_after_failed_add(
            "wt/task-1",
            true
        ));
        assert!(!should_cleanup_worktree_branch_after_failed_add(
            "main",
            false
        ));
        assert!(!should_cleanup_worktree_branch_after_failed_add(
            "feature/task-1",
            false
        ));
    }

    #[test]
    fn validates_base_branch_names() {
        assert!(validate_plain_branch_name("main").is_ok());
        assert!(validate_plain_branch_name("release/1.0").is_ok());
        assert_eq!(
            validate_plain_branch_name("-bad").unwrap_err(),
            "base_branch_invalid"
        );
        assert_eq!(
            validate_plain_branch_name("bad branch").unwrap_err(),
            "base_branch_invalid"
        );
        assert_eq!(
            validate_plain_branch_name("bad..branch").unwrap_err(),
            "base_branch_invalid"
        );
    }

    #[test]
    fn parses_porcelain_worktree_entries() {
        let output = "worktree C:/repo/main\nHEAD abc\nbranch refs/heads/main\n\nworktree C:/repo/wt/task\nHEAD def\nbranch refs/heads/wt/task\n";
        let entries = parse_worktree_list_entries(output);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[1].path, PathBuf::from("C:/repo/wt/task"));
        assert_eq!(entries[1].branch.as_deref(), Some("wt/task"));
    }

    #[test]
    fn detects_dependency_install_matrix() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("package.json"), "{}").unwrap();
        let npm = check_dependency_need(temp.path());
        assert!(npm.needs_install);
        assert_eq!(npm.command.as_deref(), Some("npm install"));

        fs::create_dir(temp.path().join("node_modules")).unwrap();
        let none = check_dependency_need(temp.path());
        assert!(!none.needs_install);

        let cargo_dir = tempfile::tempdir().unwrap();
        fs::write(cargo_dir.path().join("Cargo.toml"), "[package]\nname='x'\n").unwrap();
        let cargo = check_dependency_need(cargo_dir.path());
        assert!(cargo.needs_install);
        assert_eq!(cargo.command.as_deref(), Some("cargo fetch"));
    }
}
