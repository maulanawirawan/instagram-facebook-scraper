const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'fbadmin',
    password: process.env.DB_PASSWORD || 'fbpass123',
    database: process.env.DB_NAME || 'facebook_data',
});

// Instagram data folder (adjust path as needed)
const INSTAGRAM_DATA_FOLDER = process.env.INSTAGRAM_DATA_FOLDER || '../instagram_hashtag_data';

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📷 Instagram Data Import Script');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function importInstagramData() {
    try {
        console.log(`\n📂 Looking for Instagram data in: ${INSTAGRAM_DATA_FOLDER}`);

        // Check if folder exists
        if (!fs.existsSync(INSTAGRAM_DATA_FOLDER)) {
            console.log('❌ Instagram data folder not found!');
            console.log('   Please set INSTAGRAM_DATA_FOLDER environment variable');
            console.log('   or ensure data exists in default location');
            process.exit(1);
        }

        // Find all JSON files (posts and comments)
        const files = fs.readdirSync(INSTAGRAM_DATA_FOLDER);
        const postFiles = files.filter(f => f.includes('posts') && f.endsWith('.json'));
        const commentFiles = files.filter(f => f.includes('comments') && f.endsWith('.json'));

        console.log(`\n✅ Found ${postFiles.length} post files and ${commentFiles.length} comment files`);

        let totalPosts = 0;
        let totalComments = 0;
        let insertedPosts = 0;
        let updatedPosts = 0;
        let insertedComments = 0;

        // Import Posts
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📝 Importing Posts...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const file of postFiles) {
            const filePath = path.join(INSTAGRAM_DATA_FOLDER, file);
            console.log(`\n   Processing: ${file}`);

            const content = fs.readFileSync(filePath, 'utf8');
            const posts = JSON.parse(content);

            console.log(`   📊 Found ${posts.length} posts in file`);
            totalPosts += posts.length;

            for (const post of posts) {
                try {
                    // Calculate engagement score
                    const engagementScore = (post.likes || 0) + (post.comments || 0) * 2 + (post.views || 0) * 0.01;

                    // Upsert post (insert or update)
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
                        RETURNING (xmax = 0) AS inserted
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

                    if (result.rows[0].inserted) {
                        insertedPosts++;
                    } else {
                        updatedPosts++;
                    }
                } catch (error) {
                    console.error(`      ❌ Error importing post ${post.post_url}: ${error.message}`);
                }
            }

            console.log(`   ✅ Processed ${posts.length} posts from ${file}`);
        }

        // Import Comments
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💬 Importing Comments...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const file of commentFiles) {
            const filePath = path.join(INSTAGRAM_DATA_FOLDER, file);
            console.log(`\n   Processing: ${file}`);

            const content = fs.readFileSync(filePath, 'utf8');
            const comments = JSON.parse(content);

            console.log(`   📊 Found ${comments.length} comments in file`);
            totalComments += comments.length;

            for (const comment of comments) {
                try {
                    // Determine if it's a reply
                    const isReply = comment.parent_comment_pk !== null && comment.parent_comment_pk !== undefined;

                    // Upsert comment
                    await pool.query(`
                        INSERT INTO instagram_comments (
                            post_url, post_pk, comment_pk, comment_author,
                            comment_text, comment_likes, comment_timestamp_unix,
                            child_comment_count, parent_comment_pk, is_reply
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                        ON CONFLICT (comment_pk) DO UPDATE SET
                            comment_likes = EXCLUDED.comment_likes,
                            updated_at = CURRENT_TIMESTAMP
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

                    insertedComments++;
                } catch (error) {
                    console.error(`      ❌ Error importing comment ${comment.comment_pk}: ${error.message}`);
                }
            }

            console.log(`   ✅ Processed ${comments.length} comments from ${file}`);
        }

        // Print summary
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Import Complete!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`\n📊 Summary:`);
        console.log(`   Posts:    ${totalPosts} total`);
        console.log(`             ${insertedPosts} new`);
        console.log(`             ${updatedPosts} updated`);
        console.log(`   Comments: ${insertedComments} imported`);
        console.log('');

    } catch (error) {
        console.error('\n❌ Import failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run import
importInstagramData();
