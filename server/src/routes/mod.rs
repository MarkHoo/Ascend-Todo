pub mod admin;
pub mod auth;
pub mod devices;
pub mod docs;
pub mod email;
pub mod health;
pub mod sync;

use axum::{
    routing::{get, patch, post},
    Router,
};

use crate::state::AppState;

pub fn api() -> Router<AppState> {
    Router::new()
        .route("/health", get(health::health))
        .route("/auth/register", post(auth::register))
        .route("/auth/login", post(auth::login))
        .route("/auth/me", get(auth::me))
        .route("/auth/logout", post(auth::logout))
        .route("/auth/refresh", post(auth::refresh))
        .route(
            "/email/send-verification-code",
            post(email::send_verification_code),
        )
        .route("/email/verify", post(email::verify_email))
        .route("/phone/send-verification-code", post(email::phone_reserved))
        .route("/devices", get(devices::list_devices))
        .route("/devices/revoke-others", post(devices::revoke_others))
        .route(
            "/devices/{id}",
            patch(devices::rename_device).delete(devices::revoke_device),
        )
        .route("/devices/{id}/request-wipe", post(devices::request_wipe))
        .route("/sync/status", get(sync::status))
        .route("/sync/push-snapshot", post(sync::push_snapshot))
        .route("/sync/pull-snapshot", get(sync::pull_snapshot))
        .route("/sync/logs", get(sync::logs))
        .route("/admin/login", post(admin::login))
        .route("/admin/overview", get(admin::overview))
        .route("/admin/users", get(admin::users))
        .route("/admin/users/{id}", get(admin::user_detail))
        .route("/admin/devices", get(admin::devices))
        .route("/admin/sync-logs", get(admin::sync_logs))
        .route("/admin/system-health", get(admin::system_health))
}
