use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use chrono::Utc;
use sqlx::MySqlPool;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let database_url = std::env::var("DATABASE_URL")?;
    let email = std::env::var("ADMIN_EMAIL")
        .or_else(|_| std::env::var("ADMIN_BOOTSTRAP_EMAIL"))?
        .trim()
        .to_lowercase();
    let password = std::env::var("ADMIN_PASSWORD")?;
    let nickname = std::env::var("ADMIN_NICKNAME").unwrap_or_else(|_| "Admin".to_string());

    if password.len() < 8 {
        return Err("ADMIN_PASSWORD must be at least 8 characters".into());
    }

    let pool = MySqlPool::connect(&database_url).await?;
    let now = Utc::now().naive_utc();
    let user_id = Uuid::new_v4().to_string();
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("password hash failed: {e}"))?
        .to_string();

    sqlx::query(
        "INSERT INTO users
            (id, email, email_verified_at, password_hash, nickname, status, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'admin', ?, ?)
         ON DUPLICATE KEY UPDATE
            email_verified_at = VALUES(email_verified_at),
            password_hash = VALUES(password_hash),
            nickname = VALUES(nickname),
            status = 'active',
            role = 'admin',
            updated_at = VALUES(updated_at)",
    )
    .bind(user_id)
    .bind(&email)
    .bind(now)
    .bind(password_hash)
    .bind(nickname)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await?;

    println!("admin account is ready: {email}");
    Ok(())
}
