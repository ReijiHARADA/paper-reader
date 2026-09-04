use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn paper_dir(app: &AppHandle, paper_id: &str) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("papers")
        .join(paper_id);
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
