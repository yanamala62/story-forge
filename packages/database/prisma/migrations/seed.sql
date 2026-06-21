-- Seed system user for development (no auth yet)
INSERT INTO users (id, email, username, password, role, is_active, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@storyforge.ai',
  'system',
  '$2b$10$placeholder_hashed_password',
  'ADMIN',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
