-- ========================================
-- POST URL INVESTIGATION & FIX SCRIPT
-- ========================================
-- This script helps identify and fix incorrect post URLs

-- 1. Check for posts with missing or invalid URLs
SELECT
    id,
    author,
    SUBSTRING(text, 1, 100) as text_preview,
    post_url,
    share_url,
    timestamp,
    CASE
        WHEN post_url IS NULL THEN 'Missing URL'
        WHEN post_url = '' THEN 'Empty URL'
        WHEN post_url NOT LIKE '%facebook.com%' THEN 'Invalid URL format'
        WHEN post_url LIKE '%fbid=%' THEN 'Photo/Video URL (OK)'
        WHEN post_url LIKE '%/posts/%' THEN 'Post URL (OK)'
        WHEN post_url LIKE '%/photos/%' THEN 'Photo URL (OK)'
        WHEN post_url LIKE '%/videos/%' THEN 'Video URL (OK)'
        ELSE 'Other format'
    END as url_status
FROM posts
ORDER BY id DESC
LIMIT 50;

-- 2. Count URL status
SELECT
    CASE
        WHEN post_url IS NULL THEN 'Missing URL'
        WHEN post_url = '' THEN 'Empty URL'
        WHEN post_url NOT LIKE '%facebook.com%' THEN 'Invalid URL format'
        WHEN post_url LIKE '%fbid=%' THEN 'Photo/Video URL'
        WHEN post_url LIKE '%/posts/%' THEN 'Post URL'
        WHEN post_url LIKE '%/photos/%' THEN 'Photo URL'
        WHEN post_url LIKE '%/videos/%' THEN 'Video URL'
        ELSE 'Other format'
    END as url_type,
    COUNT(*) as count
FROM posts
GROUP BY url_type
ORDER BY count DESC;

-- 3. Find duplicate URLs (might indicate scraper issue)
SELECT
    post_url,
    COUNT(*) as duplicate_count,
    string_agg(author, ', ') as authors,
    MIN(timestamp) as first_seen,
    MAX(timestamp) as last_seen
FROM posts
WHERE post_url IS NOT NULL AND post_url != ''
GROUP BY post_url
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 4. Check if share_url can be used as fallback
SELECT
    COUNT(*) as posts_with_missing_post_url_but_has_share_url
FROM posts
WHERE (post_url IS NULL OR post_url = '')
  AND share_url IS NOT NULL AND share_url != '';

-- 5. Update missing post_url with share_url (if available)
-- UNCOMMENT TO RUN:
-- UPDATE posts
-- SET post_url = share_url
-- WHERE (post_url IS NULL OR post_url = '')
--   AND share_url IS NOT NULL AND share_url != '';

-- 6. Find posts where author doesn't match URL
SELECT
    id,
    author,
    post_url,
    CASE
        WHEN post_url LIKE '%' || LOWER(REPLACE(author, ' ', '')) || '%' THEN 'Match'
        ELSE 'Mismatch'
    END as author_url_match
FROM posts
WHERE post_url IS NOT NULL
  AND author IS NOT NULL
ORDER BY id DESC
LIMIT 30;
