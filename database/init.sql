-- Facebook Data Analytics Database Schema
-- Auto-created on container startup

-- ========================================
-- CREATE DATABASE USER (if not exists)
-- ========================================
-- Note: This is usually created by POSTGRES_USER env var,
-- but we add it here as backup
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'fbadmin') THEN
        CREATE ROLE fbadmin WITH LOGIN PASSWORD 'fbpass123';
        ALTER ROLE fbadmin CREATEDB;
    END IF;
END
$$;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- POSTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,

    -- Post Info
    author VARCHAR(255),
    author_url TEXT,
    author_followers INTEGER DEFAULT 0,
    text TEXT,
    timestamp VARCHAR(255),
    timestamp_iso TIMESTAMP,
    timestamp_unix BIGINT,

    -- Engagement Metrics
    reactions INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,

    -- Media
    post_url TEXT,
    share_url TEXT,
    image_url TEXT,
    video_url TEXT,
    image_source TEXT,
    video_source TEXT,
    has_image BOOLEAN DEFAULT FALSE,
    has_video BOOLEAN DEFAULT FALSE,

    -- Metadata
    query_used VARCHAR(255),
    filter_year VARCHAR(10),
    location VARCHAR(255),
    music_title VARCHAR(500),
    music_artist VARCHAR(255),
    scraped_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Indexes
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- COMMENTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT uuid_generate_v4() UNIQUE,

    -- Post Reference
    post_author VARCHAR(255),
    post_url TEXT,

    -- Comment Info
    comment_id VARCHAR(255),
    comment_author VARCHAR(255),
    comment_author_url TEXT,
    comment_text TEXT,
    comment_timestamp VARCHAR(255),
    comment_timestamp_unix BIGINT,

    -- Engagement
    comment_reactions INTEGER DEFAULT 0,
    comment_replies_count INTEGER DEFAULT 0,
    comment_depth INTEGER DEFAULT 0,

    -- Metadata
    data_source VARCHAR(50) DEFAULT 'html',
    parent_comment_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- ANALYTICS VIEWS
-- ========================================

-- Top Authors by Engagement
CREATE OR REPLACE VIEW v_top_authors AS
SELECT
    author,
    COUNT(*) as total_posts,
    SUM(reactions) as total_reactions,
    SUM(comments) as total_comments,
    SUM(shares) as total_shares,
    ROUND(AVG(reactions), 2) as avg_reactions,
    ROUND(AVG(comments), 2) as avg_comments
FROM posts
WHERE author IS NOT NULL
GROUP BY author
ORDER BY total_reactions DESC;

-- Daily Post Stats
CREATE OR REPLACE VIEW v_daily_stats AS
SELECT
    DATE(scraped_at) as date,
    COUNT(*) as posts_count,
    SUM(reactions) as total_reactions,
    SUM(comments) as total_comments,
    SUM(shares) as total_shares,
    SUM(views) as total_views,
    ROUND(AVG(reactions), 2) as avg_reactions
FROM posts
WHERE scraped_at IS NOT NULL
GROUP BY DATE(scraped_at)
ORDER BY date DESC;

-- Query Performance
CREATE OR REPLACE VIEW v_query_stats AS
SELECT
    query_used,
    filter_year,
    COUNT(*) as posts_found,
    SUM(reactions) as total_reactions,
    SUM(comments) as total_comments,
    ROUND(AVG(reactions), 2) as avg_reactions
FROM posts
WHERE query_used IS NOT NULL
GROUP BY query_used, filter_year
ORDER BY posts_found DESC;

-- Top Posts by Engagement
CREATE OR REPLACE VIEW v_top_posts AS
SELECT
    id,
    author,
    author_url,
    SUBSTRING(text, 1, 200) as text_preview,
    text,
    reactions,
    comments,
    shares,
    views,
    (reactions + comments * 2 + shares * 3) as engagement_score,
    post_url,
    share_url,
    image_url,
    video_url,
    has_image,
    has_video,
    location,
    music_title,
    music_artist,
    timestamp,
    timestamp_iso,
    query_used,
    filter_year
FROM posts
WHERE text IS NOT NULL
ORDER BY engagement_score DESC
LIMIT 100;

-- Comment Activity
CREATE OR REPLACE VIEW v_comment_activity AS
SELECT
    comment_author,
    COUNT(*) as total_comments,
    SUM(comment_reactions) as total_reactions,
    ROUND(AVG(comment_reactions), 2) as avg_reactions,
    MAX(comment_timestamp) as last_comment
FROM comments
WHERE comment_author IS NOT NULL
  AND comment_author != 'Unknown'
GROUP BY comment_author
ORDER BY total_comments DESC;

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================

-- Posts indexes
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS idx_posts_query ON posts(query_used);
CREATE INDEX IF NOT EXISTS idx_posts_year ON posts(filter_year);
CREATE INDEX IF NOT EXISTS idx_posts_scraped ON posts(scraped_at);
CREATE INDEX IF NOT EXISTS idx_posts_reactions ON posts(reactions DESC);
CREATE INDEX IF NOT EXISTS idx_posts_engagement ON posts((reactions + comments + shares) DESC);
CREATE INDEX IF NOT EXISTS idx_posts_url ON posts(post_url);
CREATE INDEX IF NOT EXISTS idx_posts_share_url ON posts(share_url);

-- Comments indexes
CREATE INDEX IF NOT EXISTS idx_comments_post_url ON comments(post_url);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(comment_author);
CREATE INDEX IF NOT EXISTS idx_comments_reactions ON comments(comment_reactions DESC);
CREATE INDEX IF NOT EXISTS idx_comments_id ON comments(comment_id);

-- ========================================
-- FUNCTIONS
-- ========================================

-- Function to get engagement summary
CREATE OR REPLACE FUNCTION get_engagement_summary()
RETURNS TABLE (
    metric VARCHAR,
    value BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'Total Posts'::VARCHAR, COUNT(*)::BIGINT FROM posts
    UNION ALL
    SELECT 'Total Comments'::VARCHAR, COALESCE(SUM(comments), 0)::BIGINT FROM posts
    UNION ALL
    SELECT 'Extracted Comments'::VARCHAR, COUNT(*)::BIGINT FROM comments
    UNION ALL
    SELECT 'Total Reactions'::VARCHAR, COALESCE(SUM(reactions), 0)::BIGINT FROM posts
    UNION ALL
    SELECT 'Total Shares'::VARCHAR, COALESCE(SUM(shares), 0)::BIGINT FROM posts
    UNION ALL
    SELECT 'Total Views'::VARCHAR, COALESCE(SUM(views), 0)::BIGINT FROM posts
    UNION ALL
    SELECT 'Unique Authors'::VARCHAR, COUNT(DISTINCT author)::BIGINT FROM posts WHERE author IS NOT NULL
    UNION ALL
    SELECT 'Posts with Images'::VARCHAR, COUNT(*)::BIGINT FROM posts WHERE has_image = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- GRANT PERMISSIONS
-- ========================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO fbadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fbadmin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO fbadmin;
GRANT ALL PRIVILEGES ON DATABASE facebook_data TO fbadmin;
