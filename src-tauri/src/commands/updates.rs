use std::path::PathBuf;
use std::process::Command;

use crate::error::{AppError, AppResult};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn install_update_package(package_path: String) -> AppResult<()> {
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
        let mut command = Command::new("msiexec");
        command.arg("/i").arg(&path).arg("/qn").arg("/norestart");
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
