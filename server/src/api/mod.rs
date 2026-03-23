pub mod auth;
pub mod call;
pub mod error;
pub mod health;
pub mod intelligence;
pub mod uploads;

use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(auth::router())
        .merge(health::router())
        .merge(uploads::router())
        .merge(call::router())
        .merge(intelligence::router())
}
