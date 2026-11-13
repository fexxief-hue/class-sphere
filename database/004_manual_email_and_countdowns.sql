-- Manual signup approval, countdown event types, CAT resources, and uploaded site background.
ALTER TABLE users ADD COLUMN admin_approved_at DATETIME NULL AFTER email_verified_at;
ALTER TABLE events ADD COLUMN event_type ENUM('event','cat','exam') NOT NULL DEFAULT 'event' AFTER description;
ALTER TABLE resources MODIFY resource_type ENUM('lecture_notes','past_paper','assignment','practical','cat','other') NOT NULL;
INSERT IGNORE INTO site_settings (setting_key,setting_value) VALUES ('background_image_key','');
