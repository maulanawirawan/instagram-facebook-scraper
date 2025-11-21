-- Instagram Posts Table
CREATE TABLE IF NOT EXISTS instagram_posts (
    id SERIAL PRIMARY KEY,
    author VARCHAR(255),
    author_profile_link TEXT,
    author_followers INTEGER DEFAULT 0,
    location TEXT,
    location_short VARCHAR(255),
    location_lat DECIMAL(10, 7),
    location_lng DECIMAL(10, 7),
    location_city VARCHAR(255),
    location_address TEXT,
    audio_source TEXT,
    timestamp BIGINT,
    timestamp_iso TIMESTAMP,
    timestamp_wib VARCHAR(100),
    post_url TEXT UNIQUE NOT NULL,
    content_text TEXT,
    image_url TEXT,
    video_url TEXT,
    image_source TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    shares VARCHAR(50) DEFAULT 'N/A',
    hashtags TEXT,
    keywords TEXT,
    keywords_list TEXT,
    hashtags_list TEXT,
    engagement_score DECIMAL(10, 2) DEFAULT 0,
    query_used VARCHAR(255),
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scraped_at_wib VARCHAR(100),
    update_count INTEGER DEFAULT 0,
    _previous_likes INTEGER DEFAULT 0,
    _previous_comments INTEGER DEFAULT 0,
    _previous_views INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Instagram Comments Table
CREATE TABLE IF NOT EXISTS instagram_comments (
    id SERIAL PRIMARY KEY,
    post_url TEXT REFERENCES instagram_posts(post_url) ON DELETE CASCADE,
    post_pk VARCHAR(50),
    comment_pk VARCHAR(50) UNIQUE NOT NULL,
    comment_author VARCHAR(255),
    comment_text TEXT,
    comment_likes INTEGER DEFAULT 0,
    comment_timestamp_unix BIGINT,
    child_comment_count INTEGER DEFAULT 0,
    parent_comment_pk VARCHAR(50),
    is_reply BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_instagram_posts_author ON instagram_posts(author);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_query ON instagram_posts(query_used);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_timestamp ON instagram_posts(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_engagement ON instagram_posts(engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_likes ON instagram_posts(likes DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_posts_location ON instagram_posts(location_city);

CREATE INDEX IF NOT EXISTS idx_instagram_comments_post_url ON instagram_comments(post_url);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_author ON instagram_comments(comment_author);
CREATE INDEX IF NOT EXISTS idx_instagram_comments_parent ON instagram_comments(parent_comment_pk);
