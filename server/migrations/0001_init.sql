CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified_at DATETIME NULL,
  phone VARCHAR(32) NULL,
  phone_verified_at DATETIME NULL,
  password_hash TEXT NOT NULL,
  nickname VARCHAR(120) NULL,
  status ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active',
  role ENUM('user','admin','operator','readonly') NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  last_login_at DATETIME NULL,
  INDEX idx_users_status (status),
  INDEX idx_users_role (role)
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  purpose ENUM('verify_email','reset_password','change_email') NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  send_ip VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_email_codes_user (user_id),
  INDEX idx_email_codes_email (email),
  CONSTRAINT fk_email_codes_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_devices (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  device_name VARCHAR(160) NOT NULL,
  device_fingerprint VARCHAR(255) NOT NULL,
  platform VARCHAR(80) NULL,
  app_version VARCHAR(40) NULL,
  last_login_at DATETIME NULL,
  last_sync_at DATETIME NULL,
  revoked_at DATETIME NULL,
  wipe_requested_at DATETIME NULL,
  wiped_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_user_device_fingerprint (user_id, device_fingerprint),
  INDEX idx_devices_user (user_id),
  CONSTRAINT fk_devices_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  device_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  last_used_at DATETIME NULL,
  INDEX idx_refresh_user (user_id),
  INDEX idx_refresh_device (device_id),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_refresh_device FOREIGN KEY (device_id) REFERENCES user_devices(id)
);

CREATE TABLE IF NOT EXISTS sync_snapshots (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  snapshot_json JSON NOT NULL,
  version BIGINT NOT NULL,
  client_version VARCHAR(40) NULL,
  device_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_sync_snapshot_user (user_id),
  CONSTRAINT fk_snapshots_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_snapshots_device FOREIGN KEY (device_id) REFERENCES user_devices(id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  device_id CHAR(36) NULL,
  action ENUM('push','pull','merge','wipe','status') NOT NULL,
  status ENUM('success','failed') NOT NULL,
  local_version BIGINT NULL,
  remote_version BIGINT NULL,
  error_message TEXT NULL,
  payload_size BIGINT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_sync_logs_user (user_id),
  INDEX idx_sync_logs_created (created_at)
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id CHAR(36) PRIMARY KEY,
  admin_user_id CHAR(36) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(80) NULL,
  target_id VARCHAR(120) NULL,
  ip VARCHAR(64) NULL,
  user_agent TEXT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_admin_audit_admin (admin_user_id),
  INDEX idx_admin_audit_created (created_at)
);

