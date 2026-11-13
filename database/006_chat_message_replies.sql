-- Persisted, conversation-scoped replies for class chat messages.
ALTER TABLE chat_messages ADD COLUMN reply_to_message_id BIGINT UNSIGNED NULL AFTER body;
ALTER TABLE chat_messages ADD KEY idx_chat_messages_reply (reply_to_message_id);
ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_reply FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
