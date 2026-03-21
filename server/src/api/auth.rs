use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use surrealdb::types::RecordId;

use crate::state::AppState;

use super::error::ApiError;

#[derive(Debug, Deserialize, utoipa::ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct AuthTokenResponse {
    pub access_token: String,
    pub token_type: &'static str,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Serialize, utoipa::ToSchema)]
pub struct MeResponse {
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Claims {
    pub sub: String,
    #[serde(default)]
    pub email: String,
    pub iat: usize,
    pub exp: usize,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let auth_header = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| ApiError::Unauthorized("missing authorization header".into()))?;

        let token = extract_bearer_token(auth_header)?;
        let claims = decode_token(token, &state.jwt_decoding_key)?;

        Ok(Self {
            user_id: claims.sub,
        })
    }
}

#[utoipa::path(
    post,
    path = "/api/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Authenticated", body = AuthTokenResponse),
        (status = 401, description = "Unauthorized", body = super::error::ErrorResponse)
    ),
    tag = "auth"
)]
pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, ApiError> {
    validate_credentials(&req.email, &req.password)?;

    let mut result = state
        .db
        .query(
            "SELECT VALUE id FROM users \
             WHERE email = string::lowercase($email) \
             AND crypto::argon2::compare(password_hash, $password) \
             LIMIT 1",
        )
        .bind(("email", req.email.trim().to_string()))
        .bind(("password", req.password))
        .await?;

    let user: Option<RecordId> = result.take(0)?;
    let user = user.ok_or_else(|| ApiError::Unauthorized("invalid credentials".into()))?;

    let user_id = format!("{}:{:?}", user.table, user.key);
    let email = req.email.trim().to_lowercase();
    let (access_token, expires_in_seconds) = mint_token(
        &user_id,
        &email,
        state.config.jwt_ttl_minutes,
        &state.jwt_encoding_key,
    )?;

    Ok(Json(AuthTokenResponse {
        access_token,
        token_type: "Bearer",
        expires_in_seconds,
    }))
}

#[utoipa::path(
    get,
    path = "/api/auth/me",
    responses(
        (status = 200, description = "Current user", body = MeResponse),
        (status = 401, description = "Unauthorized", body = super::error::ErrorResponse)
    ),
    security(("bearer_auth" = [])),
    tag = "auth"
)]
pub async fn me(auth_user: AuthUser) -> Result<impl IntoResponse, ApiError> {
    Ok(Json(MeResponse {
        user_id: auth_user.user_id,
    }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/login", post(login))
        .route("/auth/me", get(me))
}

fn validate_credentials(email: &str, password: &str) -> Result<(), ApiError> {
    let email = email.trim();
    if email.is_empty() || !email.contains('@') {
        return Err(ApiError::BadRequest("valid email is required".into()));
    }

    if password.len() < 8 {
        return Err(ApiError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }

    Ok(())
}

fn extract_bearer_token(value: &str) -> Result<&str, ApiError> {
    const PREFIX: &str = "Bearer ";
    if !value.starts_with(PREFIX) {
        return Err(ApiError::Unauthorized(
            "authorization header must use Bearer token".into(),
        ));
    }

    Ok(value.trim_start_matches(PREFIX).trim())
}

fn mint_token(
    user_id: &str,
    email: &str,
    ttl_minutes: u64,
    encoding_key: &EncodingKey,
) -> Result<(String, u64), ApiError> {
    let now = unix_now_seconds()?;
    let expires_in_seconds = ttl_minutes.saturating_mul(60);
    let exp = now.saturating_add(expires_in_seconds);

    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        iat: now as usize,
        exp: exp as usize,
    };

    let token = encode(&Header::default(), &claims, encoding_key)
        .map_err(|e| ApiError::Internal(format!("failed to mint token: {e}")))?;

    Ok((token, expires_in_seconds))
}

fn decode_token(token: &str, decoding_key: &DecodingKey) -> Result<Claims, ApiError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    decode::<Claims>(token, decoding_key, &validation)
        .map(|data| data.claims)
        .map_err(|_| ApiError::Unauthorized("invalid or expired token".into()))
}

fn unix_now_seconds() -> Result<u64, ApiError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .map_err(|e| ApiError::Internal(format!("system clock error: {e}")))
}
