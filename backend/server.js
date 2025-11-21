const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const PORT = process.env.API_PORT || 3003;

// Database connection pool
const pool = new Pool({
    host: process.env.DB_HOST || '127.0.0.1',  // ← PAKAI 127.0.0.1, BUKAN localhost
    port: process.env.DB_PORT || 5435,  // ← PORT 5435 (Docker port mapping)
    user: process.env.DB_USER || 'fbadmin',
    password: process.env.DB_PASSWORD || 'fbpass123',
    database: process.env.DB_NAME || 'facebook_data',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'healthy',
            database: 'connected',
            timestamp: result.rows[0].now
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// ========================================
// STATISTICS ENDPOINTS
// ========================================

// Get overall statistics
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM get_engagement_summary()');
        const stats = {};
        result.rows.forEach(row => {
            stats[row.metric.toLowerCase().replace(/\s+/g, '_')] = parseInt(row.value);
        });
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get daily statistics
app.get('/api/stats/daily', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const result = await pool.query(
            'SELECT * FROM v_daily_stats LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get query statistics
app.get('/api/stats/queries', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM v_query_stats');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// POSTS ENDPOINTS
// ========================================

// Get all posts with pagination
app.get('/api/posts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const sortBy = req.query.sort || 'scraped_at';
        const order = req.query.order || 'DESC';

        // Count total
        const countResult = await pool.query('SELECT COUNT(*) FROM posts');
        const total = parseInt(countResult.rows[0].count);

        // Get posts
        const result = await pool.query(
            `SELECT id, author, SUBSTRING(text, 1, 200) as text_preview,
                    reactions, comments, shares, views,
                    post_url, share_url, image_url,
                    location, music_title, music_artist,
                    timestamp, query_used, filter_year, scraped_at
             FROM posts
             ORDER BY ${sortBy} ${order}
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single post by ID
app.get('/api/posts/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM posts WHERE id = $1',
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }

        // Get comments for this post
        const comments = await pool.query(
            'SELECT * FROM comments WHERE post_url = $1 ORDER BY comment_reactions DESC LIMIT 50',
            [result.rows[0].post_url]
        );

        res.json({
            post: result.rows[0],
            comments: comments.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get top posts
app.get('/api/posts/top/engagement', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const result = await pool.query(
            'SELECT * FROM v_top_posts LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search posts
app.get('/api/posts/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;

        const result = await pool.query(
            `SELECT id, author, SUBSTRING(text, 1, 200) as text_preview,
                    reactions, comments, shares, post_url, timestamp,
                    location, music_title, music_artist
             FROM posts
             WHERE text ILIKE $1 OR author ILIKE $1
             ORDER BY reactions DESC
             LIMIT $2`,
            [`%${query}%`, limit]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// COMMENTS ENDPOINTS
// ========================================

// Get all comments with pagination
app.get('/api/comments', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const countResult = await pool.query('SELECT COUNT(*) FROM comments');
        const total = parseInt(countResult.rows[0].count);

        const result = await pool.query(
            `SELECT id, comment_author, SUBSTRING(comment_text, 1, 150) as comment_text,
                    comment_reactions, comment_timestamp, post_author, post_url
             FROM comments
             ORDER BY created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );

        res.json({
            data: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get top commenters
app.get('/api/comments/top/authors', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const result = await pool.query(
            'SELECT * FROM v_comment_activity LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// AUTHORS ENDPOINTS
// ========================================

// Get top authors
app.get('/api/authors/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const result = await pool.query(
            'SELECT * FROM v_top_authors LIMIT $1',
            [limit]
        );
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get author details
app.get('/api/authors/:name', async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name);

        // Get author stats
        const stats = await pool.query(
            'SELECT * FROM v_top_authors WHERE author = $1',
            [name]
        );

        if (stats.rows.length === 0) {
            return res.status(404).json({ error: 'Author not found' });
        }

        // Get recent posts
        const posts = await pool.query(
            `SELECT id, SUBSTRING(text, 1, 200) as text_preview,
                    reactions, comments, shares, timestamp, post_url,
                    location, music_title, music_artist
             FROM posts
             WHERE author = $1
             ORDER BY scraped_at DESC
             LIMIT 20`,
            [name]
        );

        res.json({
            author: stats.rows[0],
            recent_posts: posts.rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// ANALYTICS ENDPOINTS
// ========================================

// Get engagement trends
app.get('/api/analytics/trends', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        const result = await pool.query(
            `SELECT
                DATE(scraped_at) as date,
                COUNT(*) as posts,
                SUM(reactions) as reactions,
                SUM(comments) as comments,
                SUM(shares) as shares
             FROM posts
             WHERE scraped_at >= NOW() - INTERVAL '${days} days'
             GROUP BY DATE(scraped_at)
             ORDER BY date ASC`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get engagement by hour
app.get('/api/analytics/hourly', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                EXTRACT(HOUR FROM scraped_at) as hour,
                COUNT(*) as posts,
                ROUND(AVG(reactions), 2) as avg_reactions
             FROM posts
             WHERE scraped_at IS NOT NULL
             GROUP BY EXTRACT(HOUR FROM scraped_at)
             ORDER BY hour`
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get word cloud data (top words from posts)
app.get('/api/analytics/wordcloud', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;

        const result = await pool.query(
            `SELECT word, COUNT(*) as frequency
             FROM (
                 SELECT LOWER(REGEXP_SPLIT_TO_TABLE(text, E'\\\\s+')) as word
                 FROM posts
                 WHERE text IS NOT NULL
             ) words
             WHERE LENGTH(word) > 3
               AND word NOT IN ('yang', 'untuk', 'dengan', 'dari', 'pada', 'dalam', 'akan', 'adalah', 'tidak', 'this', 'that', 'with', 'have', 'from')
             GROUP BY word
             ORDER BY frequency DESC
             LIMIT $1`,
            [limit]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// DATA MANAGEMENT ENDPOINTS
// ========================================

// Delete sample/test data
app.delete('/api/cleanup/sample', async (req, res) => {
    try {
        const result = await pool.query(
            "DELETE FROM posts WHERE author = 'Sample Author' OR query_used = 'test query'"
        );

        res.json({
            status: 'success',
            message: `Deleted ${result.rowCount} sample posts`,
            deleted: result.rowCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ Delete ALL data (fresh start)
app.delete('/api/cleanup/all', async (req, res) => {
    try {
        console.log('🗑️  Cleaning ALL data from database...');

        // Delete comments first (foreign key constraint)
        const commentsResult = await pool.query('DELETE FROM comments');
        console.log(`   ✓ Deleted ${commentsResult.rowCount} comments`);

        // Delete posts
        const postsResult = await pool.query('DELETE FROM posts');
        console.log(`   ✓ Deleted ${postsResult.rowCount} posts`);

        // Reset sequences (auto-increment IDs)
        await pool.query('ALTER SEQUENCE IF EXISTS posts_id_seq RESTART WITH 1');
        await pool.query('ALTER SEQUENCE IF EXISTS comments_id_seq RESTART WITH 1');
        console.log(`   ✓ Reset ID sequences`);

        res.json({
            status: 'success',
            message: 'All data deleted successfully',
            deleted: {
                posts: postsResult.rowCount,
                comments: commentsResult.rowCount
            }
        });
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// REAL-TIME DATA IMPORT (from facebookkey.js)
// ========================================

// Save single post (real-time from scraper)
app.post('/api/posts/save', async (req, res) => {
    try {
        const post = req.body;

        // Validate required fields
        if (!post.post_url && !post.share_url) {
            return res.status(400).json({
                success: false,
                error: 'post_url or share_url is required'
            });
        }

        // Check if post exists
        const existingQuery = 'SELECT id FROM posts WHERE post_url = $1 OR share_url = $1';
        const existing = await pool.query(existingQuery, [post.post_url || post.share_url]);

        if (existing.rows.length > 0) {
            // Update existing post
            const updateQuery = `
                UPDATE posts SET
                    author = $1, author_url = $2, author_followers = $3,
                    text = $4, timestamp = $5, timestamp_iso = $6, timestamp_unix = $7,
                    reactions = $8, comments = $9, shares = $10, views = $11,
                    image_url = $12, video_url = $13, image_source = $14, video_source = $15,
                    has_image = $16, has_video = $17,
                    query_used = $18, filter_year = $19, location = $20,
                    music_title = $21, music_artist = $22, updated_at = NOW()
                WHERE post_url = $23 OR share_url = $23
                RETURNING id
            `;
            const result = await pool.query(updateQuery, [
                post.author, post.author_url, post.author_followers || 0,
                post.text || post.content_text, post.timestamp, post.timestamp_iso, post.timestamp_unix || 0,
                post.reactions || post.reactions_total || 0, post.comments || 0, post.shares || 0, post.views || 0,
                post.image_url, post.video_url, post.image_source, post.video_source,
                post.has_image || false, post.has_video || false,
                post.query_used, post.filter_year, post.location,
                post.music_title, post.music_artist,
                post.post_url || post.share_url
            ]);

            res.json({
                success: true,
                action: 'updated',
                id: result.rows[0].id
            });
        } else {
            // Insert new post
            const insertQuery = `
                INSERT INTO posts (
                    author, author_url, author_followers,
                    text, timestamp, timestamp_iso, timestamp_unix,
                    reactions, comments, shares, views,
                    post_url, share_url, image_url, video_url, image_source, video_source,
                    has_image, has_video, query_used, filter_year, location,
                    music_title, music_artist, scraped_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                    $18, $19, $20, $21, $22, $23, $24, NOW()
                ) RETURNING id
            `;
            const result = await pool.query(insertQuery, [
                post.author, post.author_url, post.author_followers || 0,
                post.text || post.content_text, post.timestamp, post.timestamp_iso, post.timestamp_unix || 0,
                post.reactions || post.reactions_total || 0, post.comments || 0, post.shares || 0, post.views || 0,
                post.post_url, post.share_url, post.image_url, post.video_url, post.image_source, post.video_source,
                post.has_image || false, post.has_video || false,
                post.query_used, post.filter_year, post.location,
                post.music_title, post.music_artist
            ]);

            res.json({
                success: true,
                action: 'inserted',
                id: result.rows[0].id
            });
        }
    } catch (error) {
        console.error('❌ Error saving post:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Save multiple comments (real-time from scraper)
app.post('/api/comments/save', async (req, res) => {
    try {
        const comments = req.body.comments || [];
        let saved = 0;
        let skipped = 0;

        for (const comment of comments) {
            try {
                // ✅ FIXED: Better duplicate detection
                // If comment_id is "N/A" (HTML extraction), use fingerprint instead
                let existingQuery, queryParams;

                if (comment.comment_id && comment.comment_id !== 'N/A') {
                    // GraphQL comments: Check by comment_id + post_url
                    existingQuery = 'SELECT id FROM comments WHERE comment_id = $1 AND post_url = $2';
                    queryParams = [comment.comment_id, comment.post_url];
                } else {
                    // HTML comments: Check by fingerprint (author + text + timestamp + post_url)
                    existingQuery = `
                        SELECT id FROM comments
                        WHERE post_url = $1
                        AND comment_author = $2
                        AND comment_text = $3
                        AND comment_timestamp = $4
                    `;
                    queryParams = [
                        comment.post_url,
                        comment.comment_author,
                        comment.comment_text,
                        comment.comment_timestamp
                    ];
                }

                const existing = await pool.query(existingQuery, queryParams);

                if (existing.rows.length === 0) {
                    // Insert new comment
                    const insertQuery = `
                        INSERT INTO comments (
                            post_url, post_author, comment_id, comment_author, comment_author_url,
                            comment_text, comment_timestamp, comment_timestamp_unix,
                            comment_reactions, comment_replies_count, comment_depth,
                            parent_comment_id, data_source
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    `;
                    await pool.query(insertQuery, [
                        comment.post_url, comment.post_author, comment.comment_id,
                        comment.comment_author, comment.comment_author_url,
                        comment.comment_text, comment.comment_timestamp, comment.comment_timestamp_unix || 0,
                        comment.comment_reactions || 0, comment.comment_replies_count || 0, comment.comment_depth || 0,
                        comment.parent_comment_id, comment.data_source || 'html'
                    ]);
                    saved++;
                } else {
                    skipped++;
                }
            } catch (err) {
                console.error('❌ Error saving comment:', err.message);
            }
        }

        res.json({
            success: true,
            saved,
            skipped,
            total: comments.length
        });
    } catch (error) {
        console.error('❌ Error saving comments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Trigger data import from CSV/JSON files
app.post('/api/import', async (req, res) => {
    try {
        console.log('📥 Import triggered via API...');

        // Import the import function
        const { importAllData } = require('./import.js');

        // Set response headers for streaming
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Transfer-Encoding', 'chunked');

        // Send initial response
        res.write(JSON.stringify({
            status: 'started',
            message: 'Import process started...',
            timestamp: new Date().toISOString()
        }) + '\n');

        // Run import in background
        importAllData()
            .then(() => {
                res.write(JSON.stringify({
                    status: 'completed',
                    message: 'Import completed successfully!',
                    timestamp: new Date().toISOString()
                }) + '\n');
                res.end();
            })
            .catch((error) => {
                res.write(JSON.stringify({
                    status: 'error',
                    message: error.message,
                    timestamp: new Date().toISOString()
                }) + '\n');
                res.end();
            });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// ========================================
// WORD CLOUD & ANALYTICS
// ========================================

// Get hashtags and keywords for word cloud
app.get('/api/analytics/wordcloud', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;

        // Extract hashtags and keywords from posts text
        const result = await pool.query(`
            SELECT text FROM posts WHERE text IS NOT NULL AND text != ''
        `);

        const wordCount = {};
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'tidak', 'ada', 'adalah', 'akan', 'pada', 'saya', 'kita', 'kami', 'mereka']);

        result.rows.forEach(row => {
            const text = row.text.toLowerCase();

            // Extract hashtags
            const hashtags = text.match(/#[\w]+/g);
            if (hashtags) {
                hashtags.forEach(tag => {
                    const cleanTag = tag.substring(1); // Remove #
                    wordCount[cleanTag] = (wordCount[cleanTag] || 0) + 5; // Weight hashtags higher
                });
            }

            // Extract words (min 4 characters, not stopwords)
            const words = text.match(/\b[\w]{4,}\b/g);
            if (words) {
                words.forEach(word => {
                    if (!stopWords.has(word) && !/^\d+$/.test(word)) {
                        wordCount[word] = (wordCount[word] || 0) + 1;
                    }
                });
            }
        });

        // Sort by count and get top N
        const wordCloudData = Object.entries(wordCount)
            .map(([word, count]) => ({ word, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);

        res.json(wordCloudData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get posts with views data
app.get('/api/posts/views', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        const result = await pool.query(`
            SELECT id, author, SUBSTRING(text, 1, 100) as text_preview,
                   reactions, comments, shares, views, post_url
            FROM posts
            WHERE views > 0
            ORDER BY views DESC
            LIMIT $1
        `, [limit]);

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// INSTAGRAM ENDPOINTS
// ========================================

// Get Instagram overall statistics
app.get('/api/instagram/stats', async (req, res) => {
    try {
        const statsQuery = `
            SELECT
                COUNT(*) as total_posts,
                COUNT(DISTINCT author) as unique_authors,
                COUNT(DISTINCT query_used) as unique_hashtags,
                SUM(likes) as total_likes,
                SUM(comments) as total_comments_count,
                SUM(views) as total_views,
                ROUND(AVG(likes), 2) as avg_likes,
                ROUND(AVG(comments), 2) as avg_comments
            FROM instagram_posts
        `;

        const result = await pool.query(statsQuery);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching Instagram stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Get Instagram posts (paginated)
app.get('/api/instagram/posts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const postsQuery = `
            SELECT * FROM instagram_posts
            ORDER BY timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = 'SELECT COUNT(*) FROM instagram_posts';

        const [postsResult, countResult] = await Promise.all([
            pool.query(postsQuery, [limit, offset]),
            pool.query(countQuery)
        ]);

        res.json({
            posts: postsResult.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit,
            totalPages: Math.ceil(countResult.rows[0].count / limit)
        });
    } catch (error) {
        console.error('Error fetching Instagram posts:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// Get Instagram top posts by engagement
app.get('/api/instagram/posts/top/engagement', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const query = `
            SELECT * FROM instagram_posts
            ORDER BY engagement_score DESC, likes DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [limit]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching top Instagram posts:', error);
        res.status(500).json({ error: 'Failed to fetch top posts' });
    }
});

// Get Instagram comments (paginated)
app.get('/api/instagram/comments', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // JOIN dengan instagram_posts untuk dapat post_url yang benar
        const commentsQuery = `
            SELECT
                c.*,
                COALESCE(c.post_url, p.post_url) as post_url
            FROM instagram_comments c
            LEFT JOIN instagram_posts p ON c.post_pk = p.id::TEXT
            ORDER BY c.comment_timestamp_unix DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = 'SELECT COUNT(*) FROM instagram_comments';

        const [commentsResult, countResult] = await Promise.all([
            pool.query(commentsQuery, [limit, offset]),
            pool.query(countQuery)
        ]);

        res.json({
            comments: commentsResult.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit,
            totalPages: Math.ceil(countResult.rows[0].count / limit)
        });
    } catch (error) {
        console.error('Error fetching Instagram comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// Get top Instagram hashtags
app.get('/api/instagram/hashtags/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const query = `
            SELECT
                query_used as hashtag,
                COUNT(*) as post_count,
                SUM(likes) as total_likes,
                SUM(comments) as total_comments,
                ROUND(AVG(engagement_score), 2) as avg_engagement
            FROM instagram_posts
            WHERE query_used IS NOT NULL
            GROUP BY query_used
            ORDER BY post_count DESC, total_likes DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [limit]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching top Instagram hashtags:', error);
        res.status(500).json({ error: 'Failed to fetch hashtags' });
    }
});

// Get Instagram authors (paginated)
app.get('/api/instagram/authors', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const authorsQuery = `
            SELECT
                author,
                author_profile_link,
                MAX(author_followers) as followers,
                COUNT(*) as post_count,
                SUM(likes) as total_likes,
                SUM(comments) as total_comments,
                ROUND(AVG(engagement_score), 2) as avg_engagement
            FROM instagram_posts
            WHERE author IS NOT NULL
            GROUP BY author, author_profile_link
            ORDER BY post_count DESC, total_likes DESC
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(DISTINCT author) as count
            FROM instagram_posts
            WHERE author IS NOT NULL
        `;

        const [authorsResult, countResult] = await Promise.all([
            pool.query(authorsQuery, [limit, offset]),
            pool.query(countQuery)
        ]);

        res.json({
            authors: authorsResult.rows,
            total: parseInt(countResult.rows[0].count),
            page,
            limit,
            totalPages: Math.ceil(countResult.rows[0].count / limit)
        });
    } catch (error) {
        console.error('Error fetching Instagram authors:', error);
        res.status(500).json({ error: 'Failed to fetch authors' });
    }
});

// Get top Instagram authors (for charts)
app.get('/api/instagram/authors/top', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const query = `
            SELECT
                author,
                author_profile_link,
                MAX(author_followers) as followers,
                COUNT(*) as post_count,
                SUM(likes) as total_likes,
                SUM(comments) as total_comments,
                ROUND(AVG(engagement_score), 2) as avg_engagement
            FROM instagram_posts
            WHERE author IS NOT NULL
            GROUP BY author, author_profile_link
            ORDER BY post_count DESC, total_likes DESC
            LIMIT $1
        `;

        const result = await pool.query(query, [limit]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching top Instagram authors:', error);
        res.status(500).json({ error: 'Failed to fetch authors' });
    }
});

// Get Instagram daily trends
app.get('/api/instagram/trends/daily', async (req, res) => {
    try {
        const query = `
            SELECT
                DATE(timestamp_iso) as date,
                COUNT(*) as post_count,
                SUM(likes) as total_likes,
                SUM(comments) as total_comments,
                ROUND(AVG(engagement_score), 2) as avg_engagement
            FROM instagram_posts
            WHERE timestamp_iso IS NOT NULL
            GROUP BY DATE(timestamp_iso)
            ORDER BY date DESC
            LIMIT 30
        `;

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching Instagram daily trends:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

// Save Instagram post (real-time auto-save from scraper)
app.post('/api/instagram/posts/save', async (req, res) => {
    try {
        const post = req.body;

        // Calculate engagement score
        const engagementScore = (post.likes || 0) + (post.comments || 0) * 2 + (post.views || 0) * 0.01;

        // Upsert post
        const result = await pool.query(`
            INSERT INTO instagram_posts (
                author, author_profile_link, author_followers,
                location, location_short, location_lat, location_lng,
                location_city, location_address, audio_source,
                timestamp, timestamp_iso, timestamp_wib,
                post_url, content_text, image_url, video_url, image_source,
                likes, comments, views, shares,
                hashtags, keywords, keywords_list, hashtags_list,
                engagement_score, query_used, scraped_at, scraped_at_wib,
                update_count, _previous_likes, _previous_comments, _previous_views
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24, $25, $26,
                $27, $28, $29, $30, $31, $32, $33, $34
            )
            ON CONFLICT (post_url) DO UPDATE SET
                likes = EXCLUDED.likes,
                comments = EXCLUDED.comments,
                views = EXCLUDED.views,
                engagement_score = EXCLUDED.engagement_score,
                update_count = instagram_posts.update_count + 1,
                _previous_likes = instagram_posts.likes,
                _previous_comments = instagram_posts.comments,
                _previous_views = instagram_posts.views,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, (xmax = 0) AS inserted
        `, [
            post.author || null,
            post.author_profile_link || null,
            post.author_followers || 0,
            post.location || null,
            post.location_short || null,
            post.location_lat || null,
            post.location_lng || null,
            post.location_city || null,
            post.location_address || null,
            post.audio_source || null,
            post.timestamp || null,
            post.timestamp_iso || null,
            post.timestamp_wib || null,
            post.post_url,
            post.content_text || null,
            post.image_url || null,
            post.video_url || null,
            post.image_source || null,
            post.likes || 0,
            post.comments || 0,
            post.views || 0,
            post.shares || 'N/A',
            post.hashtags || null,
            post.keywords || null,
            post.keywords_list || null,
            post.hashtags_list || null,
            engagementScore,
            post.query_used || null,
            post.scraped_at || null,
            post.scraped_at_wib || null,
            post.update_count || 0,
            post._previous_likes || 0,
            post._previous_comments || 0,
            post._previous_views || 0
        ]);

        const action = result.rows[0].inserted ? 'inserted' : 'updated';
        res.json({
            success: true,
            action,
            id: result.rows[0].id,
            post_url: post.post_url
        });
    } catch (error) {
        console.error('Error saving Instagram post:', error);
        res.status(500).json({ error: 'Failed to save post', details: error.message });
    }
});

// Save Instagram comments (real-time auto-save from scraper)
app.post('/api/instagram/comments/save', async (req, res) => {
    try {
        const comments = Array.isArray(req.body) ? req.body : [req.body];
        let insertedCount = 0;
        let updatedCount = 0;

        for (const comment of comments) {
            const isReply = comment.parent_comment_pk !== null && comment.parent_comment_pk !== undefined;

            const result = await pool.query(`
                INSERT INTO instagram_comments (
                    post_url, post_pk, comment_pk, comment_author,
                    comment_text, comment_likes, comment_timestamp_unix,
                    child_comment_count, parent_comment_pk, is_reply
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (comment_pk) DO UPDATE SET
                    comment_likes = EXCLUDED.comment_likes,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING (xmax = 0) AS inserted
            `, [
                comment.post_url || null,
                comment.post_pk || null,
                comment.comment_pk,
                comment.comment_author || null,
                comment.comment_text || null,
                comment.comment_likes || 0,
                comment.comment_timestamp_unix || null,
                comment.child_comment_count || 0,
                comment.parent_comment_pk || null,
                isReply
            ]);

            if (result.rows[0].inserted) {
                insertedCount++;
            } else {
                updatedCount++;
            }
        }

        res.json({
            success: true,
            inserted: insertedCount,
            updated: updatedCount,
            total: comments.length
        });
    } catch (error) {
        console.error('Error saving Instagram comments:', error);
        res.status(500).json({ error: 'Failed to save comments', details: error.message });
    }
});

// ========================================
// ERROR HANDLING
// ========================================

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Social Media Analytics API Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🗄️  Database: ${process.env.DB_NAME || 'facebook_data'}`);
    console.log(`🌐 Health check: http://localhost:${PORT}/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('📊 Available endpoints:');
    console.log('');
    console.log('   📘 FACEBOOK:');
    console.log('   GET    /api/stats              - Overall statistics');
    console.log('   GET    /api/stats/daily        - Daily statistics');
    console.log('   GET    /api/posts              - All posts (paginated)');
    console.log('   GET    /api/posts/top/engagement - Top posts');
    console.log('   GET    /api/posts/views        - Posts with views (sorted)');
    console.log('   GET    /api/posts/:id          - Single post with comments');
    console.log('   POST   /api/posts/save         - Save single post (real-time)');
    console.log('   POST   /api/comments/save      - Save comments (real-time)');
    console.log('   GET    /api/comments           - All comments (paginated)');
    console.log('   GET    /api/authors/top        - Top authors');
    console.log('   GET    /api/analytics/trends   - Engagement trends');
    console.log('   GET    /api/analytics/wordcloud - Word cloud data (hashtags & keywords)');
    console.log('   POST   /api/import             - Trigger data import (CSV/JSON)');
    console.log('   DELETE /api/cleanup/sample     - Delete sample/test data');
    console.log('   DELETE /api/cleanup/all        - Delete ALL data (fresh start)');
    console.log('');
    console.log('   📷 INSTAGRAM:');
    console.log('   GET    /api/instagram/stats    - Overall Instagram statistics');
    console.log('   GET    /api/instagram/posts    - All Instagram posts (paginated)');
    console.log('   GET    /api/instagram/posts/top/engagement - Top Instagram posts');
    console.log('   POST   /api/instagram/posts/save - Save Instagram post (real-time auto-save)');
    console.log('   GET    /api/instagram/comments - Instagram comments (paginated)');
    console.log('   POST   /api/instagram/comments/save - Save Instagram comments (real-time auto-save)');
    console.log('   GET    /api/instagram/hashtags/top - Top Instagram hashtags');
    console.log('   GET    /api/instagram/authors/top - Top Instagram authors');
    console.log('   GET    /api/instagram/trends/daily - Instagram daily trends');
    console.log('');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing server...');
    await pool.end();
    process.exit(0);
});
