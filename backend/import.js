#!/usr/bin/env node
/**
 * Import CSV/JSON data from facebook_data folder to PostgreSQL
 * Usage: node database/import.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const csvParser = require('csv-parser');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'fbadmin',
    password: process.env.DB_PASSWORD || 'fbpass123',
    database: process.env.DB_NAME || 'facebook_data',
});

// ✅ Updated: Point to facebook_data folder (mounted as /app/data in Docker)
// In Docker: /app/data, Local: ../facebook_data
const DATA_FOLDER = process.env.NODE_ENV === 'production' || process.env.DOCKER
    ? '/app/data'
    : path.join(__dirname, '..', 'facebook_data');

/**
 * Import Posts from CSV
 */
async function importPostsCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        let imported = 0;
        let skipped = 0;

        console.log(`📄 Reading posts from: ${path.basename(filePath)}`);

        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (row) => {
                results.push(row);
            })
            .on('end', async () => {
                console.log(`   ✅ Parsed ${results.length} posts from CSV`);

                for (const post of results) {
                    try {
                        // Check if post already exists (by post_url)
                        const existing = await pool.query(
                            'SELECT id FROM posts WHERE post_url = $1 OR share_url = $1',
                            [post.post_url || post.share_url]
                        );

                        if (existing.rows.length > 0) {
                            skipped++;
                            continue;
                        }

                        // Insert new post (CSV format)
                        await pool.query(`
                            INSERT INTO posts (
                                author, author_url, author_followers, text, timestamp, timestamp_iso, timestamp_unix,
                                reactions, comments, shares, views,
                                post_url, share_url, image_url, video_url, image_source, video_source,
                                has_image, has_video, query_used, filter_year,
                                location, scraped_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
                        `, [
                            post.author || null,
                            post.author_url || null,
                            parseInt(post.author_followers) || 0,
                            post.text || post.content_text || null,
                            post.timestamp || null,
                            post.timestamp_iso || null,
                            parseInt(post.timestamp_unix) || 0,
                            parseInt(post.reactions || post.reactions_total) || 0,
                            parseInt(post.comments) || 0,
                            parseInt(post.shares) || 0,
                            parseInt(post.views) || 0,
                            post.post_url || null,
                            post.share_url || null,
                            post.image_url || null,
                            post.video_url || null,
                            post.image_source || null,
                            post.video_source || null,
                            post.has_image === 'true' || post.has_image === '1' || post.has_image === true,
                            post.has_video === 'true' || post.has_video === '1' || post.has_video === true,
                            post.query_used || null,
                            post.filter_year || null,
                            post.location || null,
                            post.scraped_at || post.updated_at || new Date(),
                        ]);

                        imported++;
                    } catch (err) {
                        console.error(`   ❌ Error importing post: ${err.message}`);
                    }
                }

                console.log(`   💾 Imported: ${imported} new, ${skipped} skipped (duplicates)`);
                resolve({ imported, skipped });
            })
            .on('error', reject);
    });
}

/**
 * Import Comments from CSV
 */
async function importCommentsCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        let imported = 0;
        let skipped = 0;

        console.log(`📄 Reading comments from: ${path.basename(filePath)}`);

        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (row) => {
                results.push(row);
            })
            .on('end', async () => {
                console.log(`   ✅ Parsed ${results.length} comments from CSV`);

                for (const comment of results) {
                    try {
                        // Check if comment already exists
                        if (comment.comment_id && comment.comment_id !== 'N/A') {
                            const existing = await pool.query(
                                'SELECT id FROM comments WHERE comment_id = $1',
                                [comment.comment_id]
                            );

                            if (existing.rows.length > 0) {
                                skipped++;
                                continue;
                            }
                        }

                        // Insert new comment
                        await pool.query(`
                            INSERT INTO comments (
                                post_author, post_url, comment_id, comment_author,
                                comment_author_url, comment_text, comment_timestamp,
                                comment_timestamp_unix, comment_reactions,
                                comment_replies_count, comment_depth, data_source
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        `, [
                            comment.post_author || null,
                            comment.post_url || null,
                            comment.comment_id || null,
                            comment.comment_author || null,
                            comment.comment_author_url || null,
                            comment.comment_text || null,
                            comment.comment_timestamp || null,
                            parseInt(comment.comment_timestamp_unix) || 0,
                            parseInt(comment.comment_reactions) || 0,
                            parseInt(comment.comment_replies_count) || 0,
                            parseInt(comment.comment_depth) || 0,
                            comment.data_source || 'html',
                        ]);

                        imported++;
                    } catch (err) {
                        console.error(`   ❌ Error importing comment: ${err.message}`);
                    }
                }

                console.log(`   💾 Imported: ${imported} new, ${skipped} skipped (duplicates)`);
                resolve({ imported, skipped });
            })
            .on('error', reject);
    });
}

/**
 * Import Posts from JSON
 */
async function importPostsJSON(filePath) {
    console.log(`📄 Reading posts from: ${path.basename(filePath)}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let imported = 0;
    let skipped = 0;

    console.log(`   ✅ Parsed ${data.length} posts from JSON`);

    for (const post of data) {
        try {
            const existing = await pool.query(
                'SELECT id FROM posts WHERE post_url = $1 OR share_url = $1',
                [post.post_url || post.share_url]
            );

            if (existing.rows.length > 0) {
                skipped++;
                continue;
            }

            await pool.query(`
                INSERT INTO posts (
                    author, author_url, author_followers, text, timestamp, timestamp_iso, timestamp_unix,
                    reactions, comments, shares, views,
                    post_url, share_url, image_url, video_url, image_source, video_source,
                    has_image, has_video, query_used, filter_year,
                    location, scraped_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
            `, [
                post.author || null,
                post.author_url || null,
                post.author_followers || 0,
                post.text || post.content_text || null,
                post.timestamp || null,
                post.timestamp_iso || null,
                post.timestamp_unix || 0,
                post.reactions || post.reactions_total || 0,
                post.comments || 0,
                post.shares || 0,
                post.views || 0,
                post.post_url || null,
                post.share_url || null,
                post.image_url || null,
                post.video_url || null,
                post.image_source || null,
                post.video_source || null,
                post.has_image || false,
                post.has_video || false,
                post.query_used || null,
                post.filter_year || null,
                post.location || null,
                post.scraped_at || post.updated_at || new Date(),
            ]);

            imported++;
        } catch (err) {
            console.error(`   ❌ Error importing post: ${err.message}`);
        }
    }

    console.log(`   💾 Imported: ${imported} new, ${skipped} skipped (duplicates)`);
    return { imported, skipped };
}

/**
 * Import Comments from JSON
 */
async function importCommentsJSON(filePath) {
    console.log(`📄 Reading comments from: ${path.basename(filePath)}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let imported = 0;
    let skipped = 0;

    console.log(`   ✅ Parsed ${data.length} comments from JSON`);

    for (const comment of data) {
        try {
            if (comment.comment_id && comment.comment_id !== 'N/A') {
                const existing = await pool.query(
                    'SELECT id FROM comments WHERE comment_id = $1',
                    [comment.comment_id]
                );

                if (existing.rows.length > 0) {
                    skipped++;
                    continue;
                }
            }

            await pool.query(`
                INSERT INTO comments (
                    post_author, post_url, comment_id, comment_author,
                    comment_author_url, comment_text, comment_timestamp,
                    comment_timestamp_unix, comment_reactions,
                    comment_replies_count, comment_depth, data_source
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [
                comment.post_author || null,
                comment.post_url || null,
                comment.comment_id || null,
                comment.comment_author || null,
                comment.comment_author_url || null,
                comment.comment_text || null,
                comment.comment_timestamp || null,
                comment.comment_timestamp_unix || 0,
                comment.comment_reactions || 0,
                comment.comment_replies_count || 0,
                comment.comment_depth || 0,
                comment.data_source || 'html',
            ]);

            imported++;
        } catch (err) {
            console.error(`   ❌ Error importing comment: ${err.message}`);
        }
    }

    console.log(`   💾 Imported: ${imported} new, ${skipped} skipped (duplicates)`);
    return { imported, skipped };
}

/**
 * Main import function
 */
async function importAllData() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Facebook Data Importer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    try {
        // Test database connection
        await pool.query('SELECT NOW()');
        console.log('✅ Connected to PostgreSQL database\n');

        // Find all CSV/JSON files
        const files = fs.readdirSync(DATA_FOLDER);

        const postCSVFiles = files.filter(f => f.startsWith('posts_') && f.endsWith('.csv'));
        const commentCSVFiles = files.filter(f => f === 'comments.csv');
        const postJSONFiles = files.filter(f => f.startsWith('posts_') && f.endsWith('.json'));
        const commentJSONFiles = files.filter(f => f === 'comments.json');

        let totalStats = {
            posts: { imported: 0, skipped: 0 },
            comments: { imported: 0, skipped: 0 },
        };

        // Import Posts from CSV
        console.log('📊 Importing Posts from CSV...\n');
        for (const file of postCSVFiles) {
            const result = await importPostsCSV(path.join(DATA_FOLDER, file));
            totalStats.posts.imported += result.imported;
            totalStats.posts.skipped += result.skipped;
        }

        // Import Posts from JSON
        console.log('\n📊 Importing Posts from JSON...\n');
        for (const file of postJSONFiles) {
            const result = await importPostsJSON(path.join(DATA_FOLDER, file));
            totalStats.posts.imported += result.imported;
            totalStats.posts.skipped += result.skipped;
        }

        // Import Comments from CSV
        console.log('\n💬 Importing Comments from CSV...\n');
        for (const file of commentCSVFiles) {
            const result = await importCommentsCSV(path.join(DATA_FOLDER, file));
            totalStats.comments.imported += result.imported;
            totalStats.comments.skipped += result.skipped;
        }

        // Import Comments from JSON
        console.log('\n💬 Importing Comments from JSON...\n');
        for (const file of commentJSONFiles) {
            const result = await importCommentsJSON(path.join(DATA_FOLDER, file));
            totalStats.comments.imported += result.imported;
            totalStats.comments.skipped += result.skipped;
        }

        // Summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Import Complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`📊 Posts:    ${totalStats.posts.imported} imported, ${totalStats.posts.skipped} skipped`);
        console.log(`💬 Comments: ${totalStats.comments.imported} imported, ${totalStats.comments.skipped} skipped`);
        console.log('');

        // Show database stats
        const stats = await pool.query('SELECT * FROM get_engagement_summary()');
        console.log('📈 Database Statistics:');
        stats.rows.forEach(row => {
            console.log(`   ${row.metric}: ${row.value.toLocaleString()}`);
        });

    } catch (error) {
        console.error('❌ Import failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run if called directly
if (require.main === module) {
    importAllData();
}

module.exports = { importAllData };
