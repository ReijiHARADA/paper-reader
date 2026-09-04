use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_DROPPED_PDF_BYTES: u64 = 100 * 1024 * 1024;
const MAX_PAPER_ID_LEN: usize = 128;

pub fn is_safe_paper_id(paper_id: &str) -> bool {
    if paper_id.is_empty() || paper_id.len() > MAX_PAPER_ID_LEN {
        return false;
    }
    if paper_id == "." || paper_id == ".." {
        return false;
    }
    if paper_id.contains('/') || paper_id.contains('\\') {
        return false;
    }
    if !paper_id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }
    let mut components = Path::new(paper_id).components();
    match components.next() {
        Some(Component::Normal(name)) => {
            components.next().is_none() && name.to_str() == Some(paper_id)
        }
        _ => false,
    }
}

fn paper_dir(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    if !is_safe_paper_id(paper_id) {
        return Err("無効な論文IDです".into());
    }
    let papers_root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("papers");
    let root = papers_root.join(paper_id);
    if root.parent() != Some(papers_root.as_path()) {
        return Err("無効な論文IDです".into());
    }
    Ok(root)
}

#[tauri::command]
pub fn save_source_pdf(app: AppHandle, paper_id: String, data: Vec<u8>) -> Result<String, String> {
    let dir = paper_dir(&app, &paper_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("source.pdf");
    fs::write(&path, &data).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn copy_source_pdf(
    app: AppHandle,
    paper_id: String,
    source_path: String,
) -> Result<String, String> {
    let dir = paper_dir(&app, &paper_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join("source.pdf");
    fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_source_pdf(app: AppHandle, paper_id: String, page: Option<u32>) -> Result<(), String> {
    let path = paper_dir(&app, &paper_id)?.join("source.pdf");
    if !path.exists() {
        return Err("保存されたPDFが見つかりません".into());
    }
    let _ = page;
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("このOSでは元PDFを開く操作に未対応です".into())
    }
}

#[tauri::command]
pub fn delete_source_pdf(app: AppHandle, paper_id: String) -> Result<(), String> {
    let dir = paper_dir(&app, &paper_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn source_pdf_exists(app: AppHandle, paper_id: String) -> Result<bool, String> {
    Ok(paper_dir(&app, &paper_id)?.join("source.pdf").exists())
}

#[tauri::command]
pub fn read_dropped_pdf(path: String) -> Result<Vec<u8>, String> {
    let file_path = PathBuf::from(&path);
    let ext = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext != "pdf" {
        return Err("PDFファイルのみ対応しています".into());
    }
    if !file_path.is_file() {
        return Err("ファイルが見つかりません".into());
    }
    let size = fs::metadata(&file_path)
        .map_err(|e| e.to_string())?
        .len();
    if size > MAX_DROPPED_PDF_BYTES {
        return Err("PDFが大きすぎます（100MBまで）".into());
    }
    fs::read(&file_path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::is_safe_paper_id;

    #[test]
    fn accepts_uuid_and_sample_ids() {
        assert!(is_safe_paper_id("550e8400-e29b-41d4-a716-446655440000"));
        assert!(is_safe_paper_id("paper-001"));
        assert!(is_safe_paper_id("paper_001"));
        assert!(is_safe_paper_id("A1"));
    }

    #[test]
    fn rejects_empty_and_dots() {
        assert!(!is_safe_paper_id(""));
        assert!(!is_safe_paper_id("."));
        assert!(!is_safe_paper_id(".."));
    }

    #[test]
    fn rejects_path_traversal_and_separators() {
        assert!(!is_safe_paper_id("../foo"));
        assert!(!is_safe_paper_id("foo/bar"));
        assert!(!is_safe_paper_id("foo\\bar"));
        assert!(!is_safe_paper_id("/tmp"));
        assert!(!is_safe_paper_id("C:\\windows"));
        assert!(!is_safe_paper_id("foo bar"));
        assert!(!is_safe_paper_id("paper.id"));
    }
}
