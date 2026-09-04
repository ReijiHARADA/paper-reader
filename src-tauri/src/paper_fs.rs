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
