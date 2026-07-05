use std::env;

#[derive(Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub access_token_minutes: i64,
    pub refresh_token_days: i64,
    pub email_code_minutes: i64,
    pub smtp_host: Option<String>,
    pub smtp_port: u16,
    pub smtp_username: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: env::var("SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(8080),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL is required"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET is required"),
            access_token_minutes: env::var("ACCESS_TOKEN_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(15),
            refresh_token_days: env::var("REFRESH_TOKEN_DAYS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(30),
            email_code_minutes: env::var("EMAIL_CODE_MINUTES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10),
            smtp_host: env::var("SMTP_HOST").ok().filter(|v| !v.trim().is_empty()),
            smtp_port: env::var("SMTP_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(587),
            smtp_username: env::var("SMTP_USERNAME")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            smtp_password: env::var("SMTP_PASSWORD")
                .ok()
                .filter(|v| !v.trim().is_empty()),
            smtp_from: env::var("SMTP_FROM").unwrap_or_else(|_| "no-reply@ascendtodo.com".into()),
        }
    }
}
