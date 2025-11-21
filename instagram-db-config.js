// =========================================
// INSTAGRAM AUTO-SAVE TO DATABASE CONFIG
// =========================================
// Add this to your apiscraperkeyword.js to enable real-time database saving

const axios = require('axios');

// API Configuration
const API_CONFIG = {
    BASE_URL: 'http://127.0.0.1:3003',
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000, // 2 seconds
    BATCH_SIZE: 10, // Save in batches to avoid overwhelming the API
    ENABLE_AUTO_SAVE: true, // Set to false to disable auto-save
};

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Save single Instagram post to database
async function saveInstagramPost(postData, retryCount = 0) {
    if (!API_CONFIG.ENABLE_AUTO_SAVE) return { success: true, skipped: true };

    try {
        // Convert apiscraperkeyword.js format to database format
        const dbPost = {
            author: postData.author_username || postData.author,
            author_profile_link: `https://www.instagram.com/${postData.author_username || postData.author}/`,
            author_followers: postData.author_followers || 0,
            location: postData.location || 'N/A',
            location_short: postData.location_short || null,
            location_lat: postData.location_lat || null,
            location_lng: postData.location_lng || null,
            location_city: postData.location_city || null,
            location_address: postData.location_address || null,
            audio_source: postData.audio_source || 'N/A',
            timestamp: postData.timestamp_unix,
            timestamp_iso: postData.timestamp_iso || (postData.timestamp_unix ? new Date(postData.timestamp_unix * 1000).toISOString() : null),
            timestamp_wib: postData.timestamp_wib || null,
            post_url: postData.post_url,
            content_text: postData.caption || '',
            image_url: postData.image_url || null,
            video_url: postData.video_url || null,
            image_source: postData.image_source || null,
            likes: postData.like_count || postData.likes || 0,
            comments: postData.comment_count || postData.comments || 0,
            views: postData.view_count || postData.views || 0,
            shares: postData.share_count || 'N/A',
            hashtags: postData.hashtags || null,
            keywords: postData.keywords || null,
            keywords_list: postData.keywords_list || null,
            hashtags_list: postData.hashtags_list || null,
            query_used: postData.query_used || postData.hashtag_source,
            scraped_at: new Date().toISOString(),
            scraped_at_wib: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
            update_count: postData.update_count || 0,
            _previous_likes: postData._previous_likes || 0,
            _previous_comments: postData._previous_comments || 0,
            _previous_views: postData._previous_views || 0,
        };

        const response = await axios.post(
            `${API_CONFIG.BASE_URL}/api/instagram/posts/save`,
            dbPost,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            }
        );

        if (response.data.success) {
            console.log(`   ✅ DB: Post ${response.data.action} - ${postData.post_url}`);
            return { success: true, action: response.data.action };
        }

        return { success: false, error: 'Invalid response' };

    } catch (error) {
        if (retryCount < API_CONFIG.RETRY_ATTEMPTS) {
            console.log(`   ⚠️  DB: Retry ${retryCount + 1}/${API_CONFIG.RETRY_ATTEMPTS} for post ${postData.post_url}`);
            await sleep(API_CONFIG.RETRY_DELAY * (retryCount + 1));
            return saveInstagramPost(postData, retryCount + 1);
        }

        console.error(`   ❌ DB: Failed to save post ${postData.post_url}: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Save Instagram comments to database (batch)
async function saveInstagramComments(commentsArray, retryCount = 0) {
    if (!API_CONFIG.ENABLE_AUTO_SAVE || !commentsArray || commentsArray.length === 0) {
        return { success: true, skipped: true };
    }

    try {
        // Convert to database format
        const dbComments = commentsArray.map(comment => {
            // Generate post_url dengan fallback yang lebih robust
            let postUrl = comment.post_url;

            // Fallback 1: Generate dari post_code (Instagram short code)
            if (!postUrl && comment.post_code) {
                postUrl = `https://www.instagram.com/p/${comment.post_code}/`;
            }

            // Fallback 2: Generate dari post_pk (tidak ideal, tapi lebih baik dari NULL)
            // NOTE: Ini akan di-update nanti dari database posts table
            if (!postUrl && comment.post_pk) {
                postUrl = `https://www.instagram.com/p/${comment.post_pk}/`;
            }

            return {
                post_url: postUrl || null,
                post_pk: String(comment.post_pk),
                comment_pk: String(comment.comment_pk),
                comment_author: comment.comment_author || null,
                comment_text: comment.comment_text || '',
                comment_likes: comment.comment_likes || 0,
                comment_timestamp_unix: comment.comment_timestamp_unix || null,
                child_comment_count: comment.child_comment_count || 0,
                parent_comment_pk: comment.parent_comment_pk ? String(comment.parent_comment_pk) : null,
            };
        });

        const response = await axios.post(
            `${API_CONFIG.BASE_URL}/api/instagram/comments/save`,
            dbComments,
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );

        if (response.data.success) {
            console.log(`   ✅ DB: Comments saved - ${response.data.inserted} new, ${response.data.updated} updated`);
            return { success: true, ...response.data };
        }

        return { success: false, error: 'Invalid response' };

    } catch (error) {
        if (retryCount < API_CONFIG.RETRY_ATTEMPTS) {
            console.log(`   ⚠️  DB: Retry ${retryCount + 1}/${API_CONFIG.RETRY_ATTEMPTS} for ${commentsArray.length} comments`);
            await sleep(API_CONFIG.RETRY_DELAY * (retryCount + 1));
            return saveInstagramComments(commentsArray, retryCount + 1);
        }

        console.error(`   ❌ DB: Failed to save comments: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Batch save posts (to avoid overwhelming the API)
async function batchSaveInstagramPosts(postsMap) {
    if (!API_CONFIG.ENABLE_AUTO_SAVE) return;

    const posts = Array.from(postsMap.values());
    let savedCount = 0;
    let failedCount = 0;

    console.log(`\n📤 Auto-saving ${posts.length} posts to database...`);

    for (let i = 0; i < posts.length; i += API_CONFIG.BATCH_SIZE) {
        const batch = posts.slice(i, i + API_CONFIG.BATCH_SIZE);

        for (const post of batch) {
            const result = await saveInstagramPost(post);
            if (result.success && !result.skipped) {
                savedCount++;
            } else if (!result.success) {
                failedCount++;
            }
        }

        // Small delay between batches
        if (i + API_CONFIG.BATCH_SIZE < posts.length) {
            await sleep(500);
        }
    }

    console.log(`✅ Auto-save complete: ${savedCount} saved, ${failedCount} failed`);
}

// Batch save comments
async function batchSaveInstagramComments(commentsMap) {
    if (!API_CONFIG.ENABLE_AUTO_SAVE) return;

    const comments = Array.from(commentsMap.values());
    if (comments.length === 0) return;

    console.log(`\n📤 Auto-saving ${comments.length} comments to database...`);

    // Save comments in batches
    for (let i = 0; i < comments.length; i += API_CONFIG.BATCH_SIZE) {
        const batch = comments.slice(i, i + API_CONFIG.BATCH_SIZE);
        await saveInstagramComments(batch);

        // Small delay between batches
        if (i + API_CONFIG.BATCH_SIZE < comments.length) {
            await sleep(500);
        }
    }
}

// Check if API is available
async function checkInstagramAPIHealth() {
    try {
        const response = await axios.get(`${API_CONFIG.BASE_URL}/health`, { timeout: 5000 });
        if (response.data.status === 'ok') {
            console.log('✅ Instagram API connection successful!');
            return true;
        }
    } catch (error) {
        console.warn('⚠️  Instagram API not available. Auto-save disabled.');
        console.warn('   Make sure backend server is running: npm start');
        API_CONFIG.ENABLE_AUTO_SAVE = false;
    }
    return false;
}

module.exports = {
    saveInstagramPost,
    saveInstagramComments,
    batchSaveInstagramPosts,
    batchSaveInstagramComments,
    checkInstagramAPIHealth,
    API_CONFIG
};
