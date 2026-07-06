use axum::{response::Html, routing::get, Router};
use utoipa::{
    openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme},
    Modify, OpenApi,
};
use utoipa_swagger_ui::SwaggerUi;

use crate::{
    models::{
        auth::{AuthResponse, RefreshTokenRequest, SendEmailCodeRequest, VerifyEmailRequest},
        device::{Device, RenameDeviceRequest},
        sync::{PullSnapshotResponse, PushSnapshotRequest, SyncLog},
        user::{LoginRequest, RegisterRequest, User, UserProfile},
    },
    routes::{
        admin::{OverviewResponse, SystemHealthResponse},
        auth::LogoutResponse,
        devices::SimpleResponse as DeviceSimpleResponse,
        email::SimpleResponse as EmailSimpleResponse,
        health::HealthResponse,
        sync::SyncStatusResponse,
    },
    state::AppState,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health,
        crate::routes::auth::register,
        crate::routes::auth::login,
        crate::routes::auth::me,
        crate::routes::auth::logout,
        crate::routes::auth::refresh,
        crate::routes::email::send_verification_code,
        crate::routes::email::verify_email,
        crate::routes::email::phone_reserved,
        crate::routes::devices::list_devices,
        crate::routes::devices::rename_device,
        crate::routes::devices::revoke_device,
        crate::routes::devices::revoke_others,
        crate::routes::devices::request_wipe,
        crate::routes::devices::mark_wiped,
        crate::routes::sync::status,
        crate::routes::sync::push_snapshot,
        crate::routes::sync::pull_snapshot,
        crate::routes::sync::logs,
        crate::routes::admin::login,
        crate::routes::admin::overview,
        crate::routes::admin::users,
        crate::routes::admin::user_detail,
        crate::routes::admin::devices,
        crate::routes::admin::sync_logs,
        crate::routes::admin::system_health
    ),
    components(schemas(
        AuthResponse,
        Device,
        DeviceSimpleResponse,
        EmailSimpleResponse,
        HealthResponse,
        LoginRequest,
        LogoutResponse,
        OverviewResponse,
        PullSnapshotResponse,
        PushSnapshotRequest,
        RefreshTokenRequest,
        RegisterRequest,
        RenameDeviceRequest,
        SendEmailCodeRequest,
        SyncLog,
        SyncStatusResponse,
        SystemHealthResponse,
        User,
        UserProfile,
        VerifyEmailRequest
    )),
    modifiers(&SecurityAddon),
    tags(
        (name = "System", description = "Health and service metadata"),
        (name = "Auth", description = "User registration, login and session APIs"),
        (name = "Email", description = "Email verification APIs"),
        (name = "Phone", description = "Reserved phone verification APIs"),
        (name = "Devices", description = "Signed-in device management"),
        (name = "Sync", description = "Cloud snapshot sync APIs"),
        (name = "Admin", description = "Admin dashboard APIs")
    ),
    info(
        title = "Ascend Todo API",
        version = env!("CARGO_PKG_VERSION"),
        description = "Ascend Todo backend API for account, device, cloud sync and admin operations."
    )
)]
pub struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearerAuth",
                SecurityScheme::Http(
                    HttpBuilder::new()
                        .scheme(HttpAuthScheme::Bearer)
                        .bearer_format("JWT")
                        .build(),
                ),
            );
        }
    }
}

pub fn docs() -> Router<AppState> {
    Router::new()
        .merge(SwaggerUi::new("/docs").url("/api/openapi.json", ApiDoc::openapi()))
        .route("/scalar", get(scalar_docs))
}

async fn scalar_docs() -> Html<&'static str> {
    Html(
        r#"<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ascend Todo API - Scalar</title>
    <style>
      body { margin: 0; }
      scalar-api-reference { min-height: 100vh; }
    </style>
  </head>
  <body>
    <script
      id="api-reference"
      data-url="/api/openapi.json"
      data-theme="default"
      data-layout="modern"
    ></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>"#,
    )
}
