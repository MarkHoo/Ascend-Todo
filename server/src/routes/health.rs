use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: &'static str,
    pub version: &'static str,
}

#[utoipa::path(
    get,
    path = "/api/health",
    tag = "System",
    responses((status = 200, description = "Service health", body = HealthResponse))
)]
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "ascend-todo-server",
        version: env!("CARGO_PKG_VERSION"),
    })
}
