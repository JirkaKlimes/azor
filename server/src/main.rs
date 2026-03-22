mod api;
mod call;
mod config;
mod db;
mod ingest;
mod state;

use axum::Router;
use tokio::signal;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::OpenApi;
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa_scalar::{Scalar, Servable};

use config::Config;
use state::AppState;

#[derive(OpenApi)]
#[openapi(
    paths(
        api::health::health,
        api::uploads::create_upload,
        api::auth::login,
        api::auth::me,
        api::call::call_websocket,
    ),
    components(schemas(
        api::health::HealthResponse,
        api::error::ErrorResponse,
        api::auth::LoginRequest,
        api::auth::AuthTokenResponse,
        api::auth::MeResponse,
        api::auth::Claims,
        api::uploads::CreateUploadRequest,
        api::uploads::UploadType,
        api::uploads::UploadCreatedEvent,
        api::uploads::ExtractingEvent,
        api::uploads::DocumentExtractedEvent,
        api::uploads::ChunkingEvent,
        api::uploads::CompletedEvent,
        api::uploads::ErrorEvent,
    )),
    tags(
        (name = "health", description = "Health check endpoints"),
        (name = "auth", description = "Authentication endpoints"),
        (name = "uploads", description = "Upload management"),
        (name = "calls", description = "Call simulation and RAG pipeline")
    ),
    modifiers(&SecurityAddon)
)]
struct ApiDoc;

struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_scheme(
                "bearer_auth",
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

#[tokio::main]
async fn main() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "azor_server=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env().expect("Failed to load config from environment");
    tracing::info!(
        "Starting azor-server v{} (build: {}, profile: {})",
        env!("CARGO_PKG_VERSION"),
        env!("BUILD"),
        env!("PROFILE")
    );

    let db = db::connect(&config.db_uri, &config.db_user, &config.db_pass)
        .await
        .expect("Failed to connect to database");
    tracing::info!("Connected to SurrealDB at {}", config.db_uri);

    let state = AppState::new(config.clone(), db);

    let app = Router::new()
        .nest("/api", api::router())
        .with_state(state)
        .merge(Scalar::with_url("/api/docs", ApiDoc::openapi()))
        .layer(TraceLayer::new_for_http());

    let addr = config.addr();
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind listener");
    tracing::info!("Listening on {addr}");
    tracing::info!("API documentation available at http://{addr}/api/docs");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("Server error");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {},
        () = terminate => {},
    }

    tracing::info!("Shutdown signal received, starting graceful shutdown");
}
