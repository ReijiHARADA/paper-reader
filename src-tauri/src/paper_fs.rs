use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

fn is_safe_relative(relative: &str) -> bool {
    if relative.is_empty() || relative.starts_with('/') || relative.contains('\\') {
        return false;
    }
    Path::new(relative)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn resolve(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    if !is_safe_relative(relative) {
        return Err("無効なパスです".into());
    }
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = root.join(relative);
    if !path.starts_with(&root) {
        return Err("無効なパスです".into());
    }
    Ok(path)
}

fn collect_files(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(root, &path, out)?;
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_app_file(app: AppHandle, relative_path: String) -> Result<Option<Vec<u8>>, String> {
    let path = resolve(&app, &relative_path)?;
    if !path.is_file() {
        return Ok(None);
    }
    fs::read(&path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_app_file(app: AppHandle, relative_path: String, data: Vec<u8>) -> Result<(), String> {
    let path = resolve(&app, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_file_exists(app: AppHandle, relative_path: String) -> Result<bool, String> {
    Ok(resolve(&app, &relative_path)?.exists())
}

#[tauri::command]
pub fn remove_app_file(app: AppHandle, relative_path: String) -> Result<(), String> {
    let path = resolve(&app, &relative_path)?;
    if path.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_app_file(app: AppHandle, from: String, to: String) -> Result<(), String> {
    let source = resolve(&app, &from)?;
    let dest = resolve(&app, &to)?;
    if !source.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&source, &dest).map_err(|e| e.to_string())
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn run_osascript(script: &str) -> Result<String, String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        if err.contains("-128") || err.to_lowercase().contains("user canceled") {
            return Ok(String::new());
        }
        return Err(err.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn require_absolute_user_path(path: &str) -> Result<PathBuf, String> {
    let dest = PathBuf::from(path);
    if !dest.is_absolute() {
        return Err("絶対パスが必要です".into());
    }
    Ok(dest)
}

#[tauri::command]
pub fn pick_save_path(default_name: String) -> Result<Option<String>, String> {
    let name = escape_applescript(&default_name);
    let path = run_osascript(&format!(
        r#"try
set thePath to POSIX path of (choose file name with prompt "書き出し先を選択" default name "{name}")
return thePath
on error number -128
return ""
end try"#
    ))?;
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[tauri::command]
pub fn pick_directory() -> Result<Option<String>, String> {
    let path = run_osascript(
        r#"try
set thePath to POSIX path of (choose folder with prompt "保存先フォルダを選択")
return thePath
on error number -128
return ""
end try"#,
    )?;
    Ok(if path.is_empty() { None } else { Some(path) })
}

#[tauri::command]
pub fn write_user_file(path: String, data: Vec<u8>) -> Result<(), String> {
    let dest = require_absolute_user_path(&path)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(dest, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_app_file_to_user(
    app: AppHandle,
    relative_path: String,
    dest_path: String,
) -> Result<(), String> {
    let src = resolve(&app, &relative_path)?;
    if !src.is_file() {
        return Err("コピー元ファイルがありません".into());
    }
    let dest = require_absolute_user_path(&dest_path)?;
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_app_files(app: AppHandle, prefix: String) -> Result<Vec<String>, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = resolve(&app, &prefix)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    if path.is_file() {
        return Ok(vec![prefix]);
    }
    let mut files = vec![];
    collect_files(&root, &path, &mut files)?;
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::is_safe_relative;

    #[test]
    fn accepts_package_paths() {
        assert!(is_safe_relative("library.sqlite"));
        assert!(is_safe_relative("papers/abc/original.md"));
        assert!(is_safe_relative("papers/abc.tmp/paper.json"));
    }

    #[test]
    fn rejects_traversal() {
        assert!(!is_safe_relative("../secret"));
        assert!(!is_safe_relative("/tmp/x"));
        assert!(!is_safe_relative("papers/../x"));
    }
}
