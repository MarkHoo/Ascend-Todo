use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub user_id: String,
    pub device_name: String,
    pub device_fingerprint: String,
    pub platform: Option<String>,
    pub app_version: Option<String>,
    pub last_login_at: Option<NaiveDateTime>,
    pub last_sync_at: Option<NaiveDateTime>,
    pub revoked_at: Option<NaiveDateTime>,
    pub wipe_requested_at: Option<NaiveDateTime>,
    pub wiped_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameDeviceRequest {
    pub device_name: String,
}
