use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushSnapshotRequest {
    pub snapshot: Value,
    pub local_version: Option<i64>,
    pub client_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullSnapshotResponse {
    pub snapshot: Option<Value>,
    pub version: Option<i64>,
    pub updated_at: Option<NaiveDateTime>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SyncLog {
    pub id: String,
    pub user_id: String,
    pub device_id: Option<String>,
    pub action: String,
    pub status: String,
    pub local_version: Option<i64>,
    pub remote_version: Option<i64>,
    pub error_message: Option<String>,
    pub payload_size: Option<i64>,
    pub created_at: NaiveDateTime,
}
