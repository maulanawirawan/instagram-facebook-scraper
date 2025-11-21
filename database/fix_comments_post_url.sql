-- ================================================================
-- FIX: Update NULL post_url in instagram_comments
-- ================================================================
-- This script updates comments.post_url from posts.post_url
-- based on matching post_pk
--
-- Usage:
--   docker exec -it facebook-postgres psql -U fbadmin -d facebook_data -f /path/to/fix_comments_post_url.sql
--
-- Or directly:
--   docker exec -it facebook-postgres psql -U fbadmin -d facebook_data < database/fix_comments_post_url.sql
-- ================================================================

-- Show current status
\echo '========================================';
\echo 'Current Status:';
\echo '========================================';
SELECT
    COUNT(*) as total_comments,
    COUNT(post_url) as comments_with_post_url,
    COUNT(*) FILTER (WHERE post_url IS NULL) as comments_null_post_url
FROM instagram_comments;

-- Update NULL post_url from posts table
\echo '';
\echo '========================================';
\echo 'Updating NULL post_url...';
\echo '========================================';

UPDATE instagram_comments c
SET post_url = p.post_url
FROM instagram_posts p
WHERE c.post_pk = p.id::TEXT
  AND c.post_url IS NULL;

-- Show updated status
\echo '';
\echo '========================================';
\echo 'Updated Status:';
\echo '========================================';
SELECT
    COUNT(*) as total_comments,
    COUNT(post_url) as comments_with_post_url,
    COUNT(*) FILTER (WHERE post_url IS NULL) as comments_null_post_url
FROM instagram_comments;

-- Show sample of fixed comments
\echo '';
\echo '========================================';
\echo 'Sample of Fixed Comments:';
\echo '========================================';
SELECT
    comment_author,
    LEFT(comment_text, 50) as comment_preview,
    post_url
FROM instagram_comments
WHERE post_url IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

\echo '';
\echo '✅ Fix completed!';
