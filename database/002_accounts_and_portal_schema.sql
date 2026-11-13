-- CLASS SPHERE account and portal content schema
-- Apply after 001_initial_academics_and_y3_timetable.sql.
-- No student accounts or announcements are seeded.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  admission_number VARCHAR(50) NULL UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','admin') NOT NULL DEFAULT 'student',
  status ENUM('pending_email','active','suspended') NOT NULL DEFAULT 'pending_email',
  email_verified_at DATETIME NULL,
  directory_public BOOLEAN NOT NULL DEFAULT FALSE,
  public_display_name VARCHAR(120) NULL,
  profile_photo_key VARCHAR(512) NULL,
  nonessential_email_consent_at DATETIME NULL,
  email_unsubscribed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_user_admission_role CHECK (
    (role = 'admin' AND admission_number IS NULL) OR
    (role = 'student' AND admission_number LIKE 'SB62/%')
  ),
  KEY idx_users_status_role (status, role)
);

CREATE TABLE IF NOT EXISTS app_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  session_data MEDIUMTEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_session_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_verify_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_verify_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_reset_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  category ENUM('academic','timetable','event','general') NOT NULL DEFAULT 'general',
  audience ENUM('public','students') NOT NULL DEFAULT 'students',
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
  author_id BIGINT UNSIGNED NOT NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcement_author FOREIGN KEY (author_id) REFERENCES users(id),
  KEY idx_announcement_published (status, audience, published_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  announcement_id BIGINT UNSIGNED NULL,
  category ENUM('academic','timetable','event','general') NOT NULL,
  priority ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  dismissed_at DATETIME NULL,
  snoozed_until DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_announcement FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE SET NULL,
  KEY idx_notification_user_created (user_id, created_at),
  KEY idx_notification_user_unread (user_id, read_at, dismissed_at)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  academic_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timetable_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  general_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_start TIME NULL,
  quiet_end TIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_pref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  unit_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  resource_type ENUM('lecture_notes','past_paper','assignment','practical','other') NOT NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  visibility ENUM('students','public') NOT NULL DEFAULT 'students',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resource_unit FOREIGN KEY (unit_id) REFERENCES units(id),
  CONSTRAINT fk_resource_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id),
  KEY idx_resource_unit_type (unit_id, resource_type)
);

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  venue VARCHAR(160) NULL,
  status ENUM('draft','published','cancelled','archived') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_creator FOREIGN KEY (created_by) REFERENCES users(id),
  KEY idx_event_status_start (status, starts_at)
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  category VARCHAR(80) NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  alt_text VARCHAR(200) NOT NULL,
  permission_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_gallery_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id),
  KEY idx_gallery_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS ai_announcement_drafts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prompt TEXT NOT NULL,
  title VARCHAR(200) NULL,
  body MEDIUMTEXT NULL,
  funny_version MEDIUMTEXT NULL,
  professional_version MEDIUMTEXT NULL,
  whatsapp_version TEXT NULL,
  provider VARCHAR(80) NOT NULL,
  model VARCHAR(120) NULL,
  status ENUM('draft','published','discarded') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_draft_author FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject VARCHAR(250) NOT NULL,
  body MEDIUMTEXT NOT NULL,
  category ENUM('essential','nonessential') NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_campaign_author FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_email_idempotency (created_by, idempotency_key)
);

CREATE TABLE IF NOT EXISTS email_recipients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(254) NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  status ENUM('queued','sent','delivered','failed','bounced','unsubscribed') NOT NULL DEFAULT 'queued',
  error_summary VARCHAR(500) NULL,
  attempted_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_email_recipient_campaign FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_email_recipient_user FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uq_campaign_recipient (campaign_id, user_id),
  KEY idx_recipient_status (status, updated_at)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NULL,
  context_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_audit_created (created_at),
  KEY idx_audit_actor (actor_id, created_at)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_name VARCHAR(160) NOT NULL,
  sender_email VARCHAR(254) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('new','reviewed','closed') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_contact_status_created (status, created_at)
);


CREATE TABLE IF NOT EXISTS class_popup_states (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  timetable_entry_id BIGINT UNSIGNED NOT NULL,
  class_date DATE NOT NULL,
  dismissed_at DATETIME NULL,
  snoozed_until DATETIME NULL,
  UNIQUE KEY uq_popup_class_user (user_id, timetable_entry_id, class_date),
  CONSTRAINT fk_popup_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_popup_timetable FOREIGN KEY (timetable_entry_id) REFERENCES timetable_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_unsubscribe_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_unsubscribe_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_unsubscribe_expiry (expires_at)
);
