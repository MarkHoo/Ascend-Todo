use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};

use crate::{
    error::{AppError, AppResult},
    models::auth::Claims,
};

pub fn create_access_token(
    secret: &str,
    user_id: &str,
    device_id: &str,
    role: &str,
    minutes: i64,
) -> AppResult<String> {
    let exp = Utc::now()
        .checked_add_signed(chrono::Duration::minutes(minutes))
        .ok_or_else(|| AppError::Internal("invalid token expiration".into()))?
        .timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        device_id: device_id.to_string(),
        role: role.to_string(),
        exp,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("token encode failed: {e}")))
}

pub fn verify_access_token(secret: &str, token: &str) -> AppResult<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthorized)
}
