-- ========================================
-- CHECK URL MISMATCH WITH CONTENT
-- ========================================
-- This investigates if URLs actually match the post content

-- 1. Show posts with their URLs and content for manual verification
SELECT
    id,
    author,
    SUBSTRING(text, 1, 150) as content_preview,
    reactions,
    comments,
    shares,
    share_url,
    post_url,
    timestamp
FROM posts
ORDER BY (reactions + comments * 2 + shares * 3) DESC
LIMIT 20;

-- 2. Check if there are duplicate share_urls (indicating scraper grabbed same URL multiple times)
SELECT
    share_url,
    COUNT(*) as duplicate_count,
    string_agg(DISTINCT author, ' | ') as different_authors,
    string_agg(DISTINCT SUBSTRING(text, 1, 50), ' | ') as different_texts
FROM posts
WHERE share_url IS NOT NULL AND share_url != ''
GROUP BY share_url
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 3. Posts where author in content doesn't match URL pattern
-- (this might help identify URL scraping issues)
SELECT
    id,
    author,
    SUBSTRING(text, 1, 100) as text_sample,
    share_url,
    CASE
        WHEN share_url LIKE '%' || REPLACE(LOWER(author), ' ', '') || '%' THEN 'Likely Match'
        ELSE 'Possible Mismatch'
    END as url_author_alignment
FROM posts
WHERE share_url IS NOT NULL
  AND author IS NOT NULL
ORDER BY id DESC
LIMIT 30;

-- 4. Check if post_url and share_url point to different posts
-- (they should be the same post, just different URL formats)
SELECT
    id,
    author,
    SUBSTRING(text, 1, 80) as text,
    post_url,
    share_url,
    reactions,
    comments
FROM posts
WHERE post_url IS NOT NULL
  AND share_url IS NOT NULL
  AND post_url != share_url
ORDER BY id DESC
LIMIT 20;
