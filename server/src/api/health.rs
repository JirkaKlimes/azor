use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize, utoipa::ToSchema)]
pub struct HealthResponse {
    status: String,
    version: &'static str,
    build: &'static str,
    profile: &'static str,
}

#[utoipa::path(
    get,
    path = "/api/health",
    responses(
        (status = 200, description = "Service is healthy", body = HealthResponse),
        (status = 503, description = "Service is unhealthy", body = HealthResponse)
    ),
    tag = "health"
)]
pub async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let db_ok = state.db.query("RETURN true").await.is_ok();

    let (status_code, status_text) = if db_ok {
        (StatusCode::OK, "ok")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "unhealthy")
    };

    (
        status_code,
        Json(HealthResponse {
            status: status_text.to_string(),
            version: env!("CARGO_PKG_VERSION"),
            build: env!("BUILD"),
            profile: env!("PROFILE"),
        }),
    )
}

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health))
}
