use std::path::PathBuf;
use std::process::Command;

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;
const GITHUB_RELEASE_API: &str = "https://api.github.com/repos/MarkHoo/Ascend-Todo/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAsset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub html_url: Option<String>,
    pub draft: bool,
    pub prerelease: bool,
    pub assets: Vec<UpdateAsset>,
}

fn http_client() -> AppResult<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent("Ascend-Todo-Updater")
        .build()
        .map_err(|error| AppError::Internal(format!("failed to create http client: {error}")))
}

#[tauri::command]
pub async fn fetch_latest_release() -> AppResult<GitHubRelease> {
    tauri::async_runtime::spawn_blocking(fetch_latest_release_blocking)
        .await
        .map_err(|error| AppError::Internal(format!("update check task failed: {error}")))?
}

fn fetch_latest_release_blocking() -> AppResult<GitHubRelease> {
    let response = http_client()?
        .get(GITHUB_RELEASE_API)
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|error| AppError::Internal(format!("failed to fetch latest release: {error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Internal(format!(
            "GitHub Release request failed: {}",
            response.status()
        )));
    }

    let body = response
        .text()
        .map_err(|error| AppError::Internal(format!("failed to read latest release: {error}")))?;

    serde_json::from_str::<GitHubRelease>(&body)
        .map_err(|error| AppError::Internal(format!("failed to parse latest release: {error}")))
}

#[tauri::command]
pub async fn download_update_package(asset_url: String, package_path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        download_update_package_blocking(asset_url, package_path)
    })
    .await
    .map_err(|error| AppError::Internal(format!("update download task failed: {error}")))?
}

fn download_update_package_blocking(asset_url: String, package_path: String) -> AppResult<()> {
    if !asset_url.starts_with("https://github.com/MarkHoo/Ascend-Todo/releases/download/") {
        return Err(AppError::Invalid("unsupported update asset url".into()));
    }

    let target = PathBuf::from(package_path);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut response = http_client()?
        .get(asset_url)
        .send()
        .map_err(|error| AppError::Internal(format!("failed to download update package: {error}")))?;

    if !response.status().is_success() {
        return Err(AppError::Internal(format!(
            "update package download failed: {}",
            response.status()
        )));
    }

    let mut file = std::fs::File::create(&target)?;
    response.copy_to(&mut file)
        .map_err(|error| AppError::Internal(format!("failed to save update package: {error}")))?;
    Ok(())
}

#[tauri::command]
pub async fn install_update_package(package_path: String) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || install_update_package_blocking(package_path))
        .await
        .map_err(|error| AppError::Internal(format!("update install task failed: {error}")))?
}

fn install_update_package_blocking(package_path: String) -> AppResult<()> {
    let path = PathBuf::from(package_path);
    if !path.exists() || !path.is_file() {
        return Err(AppError::Invalid("update package does not exist".into()));
    }

    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();

    let mut command = if ext == "msi" {
        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(format!(
                "Start-Process -FilePath msiexec.exe -ArgumentList @('/i', '{}', '/passive', '/norestart') -Verb RunAs",
                escape_powershell_single_quoted(&path.to_string_lossy())
            ));
        command
    } else if ext == "exe" {
        let mut command = Command::new(&path);
        command.arg("/S").arg("/R");
        command
    } else {
        return Err(AppError::Invalid("unsupported update package type".into()));
    };

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn()?;
    Ok(())
}

fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}
