use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};

use crate::{
    config::Config,
    error::{AppError, AppResult},
};

pub async fn send_verification_code(config: &Config, to: &str, code: &str) -> AppResult<()> {
    let subject = "光阶 Todo 邮箱验证码";
    let body =
        format!("你的邮箱验证码是：{code}\n\n验证码将在数分钟后过期。若非本人操作，请忽略此邮件。");
    if config.smtp_host.is_none() {
        tracing::warn!("SMTP not configured; verification code for {to}: {code}");
        return Ok(());
    }

    let from: Mailbox = config
        .smtp_from
        .parse()
        .map_err(|e| AppError::Internal(format!("invalid SMTP_FROM: {e}")))?;
    let to: Mailbox = to
        .parse()
        .map_err(|e| AppError::BadRequest(format!("invalid email: {e}")))?;
    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .body(body)
        .map_err(|e| AppError::Internal(format!("email build failed: {e}")))?;

    let mut builder =
        AsyncSmtpTransport::<Tokio1Executor>::relay(config.smtp_host.as_deref().unwrap())
            .map_err(|e| AppError::Internal(format!("smtp setup failed: {e}")))?;
    builder = builder.port(config.smtp_port);
    if let (Some(username), Some(password)) = (&config.smtp_username, &config.smtp_password) {
        builder = builder.credentials(Credentials::new(username.clone(), password.clone()));
    }
    builder
        .build()
        .send(email)
        .await
        .map(|_| ())
        .map_err(|e| AppError::Internal(format!("email send failed: {e}")))
}
