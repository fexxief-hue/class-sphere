-- Student file submissions and editable site appearance.
ALTER TABLE resources ADD COLUMN approval_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved' AFTER visibility;
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_site_setting_actor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
INSERT INTO site_settings (setting_key,setting_value) VALUES ('background_image_url',''),('background_tint','#071a17') ON DUPLICATE KEY UPDATE setting_key=VALUES(setting_key);
