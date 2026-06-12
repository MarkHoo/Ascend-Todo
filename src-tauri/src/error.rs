use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("invalid: {0}")]
    Invalid(String),

    #[error("auth error: {0}")]
    Auth(String),

    #[error("internal: {0}")]
    Internal(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, ser: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ser.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
