use std::path::Path;
use std::process::Command;

/// 查询指定路径的当前 git 分支
///
/// # Arguments
/// * `path` - 项目路径
///
/// # Returns
/// * `Ok(Some(branch))` - 成功获取分支名
/// * `Ok(None)` - 不是 git 仓库或获取失败
#[tauri::command]
pub async fn get_current_git_branch(path: String) -> Result<Option<String>, String> {
    let project_path = Path::new(&path);

    // 检查是否是 git 仓库
    if !project_path.join(".git").exists() {
        return Ok(None);
    }

    // 执行 git branch --show-current
    let output = Command::new("git")
        .args(["-c", "i18n.logOutputEncoding=UTF-8", "branch", "--show-current"])
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("执行 git 命令失败: {}", e))?;

    if !output.status.success() {
        return Ok(None);
    }

    let branch = String::from_utf8_lossy(&output.stdout)
        .trim()
        .to_string();

    if branch.is_empty() {
        Ok(None)
    } else {
        Ok(Some(branch))
    }
}
