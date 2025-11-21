# 🎨 Dashboard Enhancement Guide

## ✅ Backend Ready!

New API endpoints sudah tersedia:
- `GET /api/analytics/wordcloud` - Word cloud data (hashtags & keywords)
- `GET /api/posts/views` - Posts dengan views metrics

---

## 🎯 Frontend Enhancements Checklist

### 1. ✅ Add WordCloud.js Library

**Tambahkan di `<head>` section (after Chart.js):**

```html
<script src="https://cdn.jsdelivr.net/npm/wordcloud@1.2.2/src/wordcloud2.min.js"></script>
```

---

### 2. ✅ Improve Chart Colors (More Contrast)

**Update color palette di JavaScript:**

```javascript
// Enhanced color palette - more vibrant and contrasting
const enhancedColors = [
    '#FF6B6B', // Bright Red
    '#4ECDC4', // Turquoise
    '#45B7D1', // Sky Blue
    '#FFA07A', // Light Salmon
    '#98D8C8', // Mint
    '#F7DC6F', // Yellow
    '#BB8FCE', // Purple
    '#85C1E2', // Light Blue
    '#F8B739', // Orange
    '#52BE80', // Green
    '#EC7063', // Coral
    '#5DADE2', // Blue
];
```

---

### 3. ✅ Add Total Posts in Donut Chart Center

**Update Donut Chart config:**

```javascript
// In createEngagementDonutChart function
const config = {
    type: 'doughnut',
    data: data,
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    font: { size: 14 },
                    color: '#333'
                }
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value.toLocaleString()} (${percentage}%)`;
                    }
                }
            },
            // ✅ CENTER TEXT PLUGIN
            centerText: {
                display: true,
                text: stats.total_posts.toLocaleString() + ' Posts'
            }
        }
    },
    // ✅ ADD CENTER TEXT PLUGIN
    plugins: [{
        id: 'centerText',
        afterDatasetDraw(chart) {
            const { ctx, chartArea: { width, height } } = chart;
            ctx.save();

            const text = chart.options.plugins.centerText.text;
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const centerX = width / 2;
            const centerY = height / 2;

            ctx.fillText(text, centerX, centerY);
            ctx.restore();
        }
    }]
};
```

---

### 4. ✅ Add Data Labels to Charts

**Add Chart.js datalabels plugin:**

```html
<!-- Add in <head> after Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0"></script>
```

**Enable in chart options:**

```javascript
options: {
    plugins: {
        datalabels: {
            color: '#fff',
            font: {
                weight: 'bold',
                size: 12
            },
            formatter: (value) => {
                return value.toLocaleString();
            }
        }
    }
}
```

---

### 5. ✅ Create Horizontal Bar Chart for Authors

**Add new chart container in HTML:**

```html
<div class="chart-card">
    <h3><i class="fas fa-chart-bar"></i> Top Authors by Engagement</h3>
    <canvas id="authorsHorizontalChart"></canvas>
</div>
```

**JavaScript function:**

```javascript
async function createAuthorsHorizontalChart() {
    try {
        const response = await fetch(`${API_URL}/api/authors/top?limit=10`);
        const authors = await response.json();

        const ctx = document.getElementById('authorsHorizontalChart').getContext('2d');

        if (charts.authorsHorizontal) {
            charts.authorsHorizontal.destroy();
        }

        charts.authorsHorizontal = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: authors.map(a => a.author),
                datasets: [
                    {
                        label: 'Reactions',
                        data: authors.map(a => parseInt(a.total_reactions)),
                        backgroundColor: '#FF6B6B',
                        borderRadius: 5
                    },
                    {
                        label: 'Comments',
                        data: authors.map(a => parseInt(a.total_comments)),
                        backgroundColor: '#4ECDC4',
                        borderRadius: 5
                    },
                    {
                        label: 'Shares',
                        data: authors.map(a => parseInt(a.total_shares)),
                        backgroundColor: '#45B7D1',
                        borderRadius: 5
                    }
                ]
            },
            options: {
                indexAxis: 'y', // ✅ HORIZONTAL!
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.x.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating horizontal authors chart:', error);
    }
}
```

---

### 6. ✅ Create Word Cloud

**Add HTML container:**

```html
<div class="chart-card">
    <h3><i class="fas fa-cloud"></i> Word Cloud - Top Keywords & Hashtags</h3>
    <canvas id="wordcloudCanvas" width="800" height="400"></canvas>
</div>
```

**JavaScript function:**

```javascript
async function createWordCloud() {
    try {
        const response = await fetch(`${API_URL}/api/analytics/wordcloud?limit=100`);
        const wordData = await response.json();

        const canvas = document.getElementById('wordcloudCanvas');

        // Convert to WordCloud2 format
        const list = wordData.map(item => [item.word, item.count]);

        WordCloud(canvas, {
            list: list,
            gridSize: 10,
            weightFactor: function(size) {
                return Math.pow(size, 0.5) * 10; // Adjust size scaling
            },
            fontFamily: 'Arial, sans-serif',
            color: function() {
                // Random vibrant colors
                const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
                return colors[Math.floor(Math.random() * colors.length)];
            },
            rotateRatio: 0.3,
            backgroundColor: '#f5f7fa',
            hover: function(item) {
                if (item) {
                    canvas.style.cursor = 'pointer';
                } else {
                    canvas.style.cursor = 'default';
                }
            },
            click: function(item) {
                if (item) {
                    // Search for this word
                    document.getElementById('searchInput').value = item[0];
                    handleSearch();
                }
            }
        });
    } catch (error) {
        console.error('Error creating word cloud:', error);
    }
}
```

---

### 7. ✅ Add "See More / Hide" for Long Text

**Add CSS:**

```css
.text-preview {
    position: relative;
}

.text-preview.collapsed {
    max-height: 100px;
    overflow: hidden;
}

.text-preview.collapsed::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: linear-gradient(transparent, white);
}

.toggle-text {
    color: #667eea;
    cursor: pointer;
    font-weight: 500;
    margin-top: 5px;
    display: inline-block;
}

.toggle-text:hover {
    text-decoration: underline;
}
```

**JavaScript helper function:**

```javascript
function createTextPreview(text, maxLength = 200) {
    if (!text || text.length <= maxLength) {
        return `<div class="text-preview">${escapeHtml(text)}</div>`;
    }

    const id = 'text-' + Math.random().toString(36).substr(2, 9);
    return `
        <div class="text-preview collapsed" id="${id}">
            ${escapeHtml(text)}
        </div>
        <span class="toggle-text" onclick="toggleText('${id}')">
            See More <i class="fas fa-chevron-down"></i>
        </span>
    `;
}

function toggleText(id) {
    const element = document.getElementById(id);
    const toggle = element.nextElementSibling;

    if (element.classList.contains('collapsed')) {
        element.classList.remove('collapsed');
        toggle.innerHTML = 'Hide <i class="fas fa-chevron-up"></i>';
    } else {
        element.classList.add('collapsed');
        toggle.innerHTML = 'See More <i class="fas fa-chevron-down"></i>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

**Update renderPosts function:**

```javascript
function renderPosts(posts) {
    const postsContainer = document.getElementById('posts');

    if (posts.length === 0) {
        postsContainer.innerHTML = '<div class="no-data">No posts found</div>';
        return;
    }

    const html = posts.map(post => `
        <div class="data-row">
            <div>
                <strong>${escapeHtml(post.author)}</strong>
                ${createTextPreview(post.text_preview, 150)}
                <div class="post-meta">
                    <span><i class="fas fa-heart"></i> ${post.reactions}</span>
                    <span><i class="fas fa-comment"></i> ${post.comments}</span>
                    <span><i class="fas fa-share"></i> ${post.shares}</span>
                    ${post.views ? `<span><i class="fas fa-eye"></i> ${post.views.toLocaleString()}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');

    postsContainer.innerHTML = html;
    document.getElementById('postsCount').textContent = `Showing ${posts.length} posts`;
}
```

---

### 8. ✅ Add Views Count Metrics

**Update fetchStats function:**

```javascript
async function fetchStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);
        const stats = await response.json();

        // Update existing stats
        document.getElementById('totalPosts').textContent = stats.total_posts.toLocaleString();
        document.getElementById('totalComments').textContent = stats.total_comments.toLocaleString();
        document.getElementById('totalReactions').textContent = stats.total_reactions.toLocaleString();
        document.getElementById('totalShares').textContent = stats.total_shares.toLocaleString();
        document.getElementById('uniqueAuthors').textContent = stats.unique_authors.toLocaleString();
        document.getElementById('postsWithImages').textContent = stats.posts_with_images.toLocaleString();

        // ✅ ADD VIEWS COUNT
        // Get total views from posts
        const viewsResponse = await fetch(`${API_URL}/api/posts/views?limit=1000`);
        const viewsPosts = await viewsResponse.json();
        const totalViews = viewsPosts.reduce((sum, post) => sum + (parseInt(post.views) || 0), 0);

        // Add to stats display (create new stat card if needed)
        if (!document.getElementById('totalViews')) {
            const statsGrid = document.querySelector('.stats-grid');
            statsGrid.insertAdjacentHTML('beforeend', `
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-eye"></i></div>
                    <div>
                        <div class="stat-value" id="totalViews">0</div>
                        <div class="stat-label">Total Views</div>
                    </div>
                </div>
            `);
        }
        document.getElementById('totalViews').textContent = totalViews.toLocaleString();

        return stats;
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}
```

---

## 📋 Implementation Steps

1. **Restart API** to load new endpoints:
   ```bash
   docker-compose restart api
   ```

2. **Test new endpoints**:
   ```bash
   curl http://localhost:3002/api/analytics/wordcloud?limit=10
   curl http://localhost:3002/api/posts/views?limit=10
   ```

3. **Backup dashboard**:
   ```bash
   cp frontend/dashboard.html frontend/dashboard.html.backup
   ```

4. **Add enhancements** to `frontend/dashboard.html`:
   - Add libraries in `<head>`
   - Add new chart containers in HTML
   - Add CSS styles
   - Add JavaScript functions
   - Call new functions in `loadData()` or `refreshData()`

5. **Test dashboard**:
   - Open http://localhost:8080
   - Verify all charts load
   - Test interactive features

---

## 🎨 Enhanced Color Scheme

Use these colors for better contrast:

```javascript
const enhancedPalette = {
    primary: '#667eea',
    secondary: '#764ba2',
    red: '#FF6B6B',
    turquoise: '#4ECDC4',
    blue: '#45B7D1',
    salmon: '#FFA07A',
    mint: '#98D8C8',
    yellow: '#F7DC6F',
    purple: '#BB8FCE',
    green: '#52BE80',
    coral: '#EC7063',
    orange: '#F8B739'
};
```

---

## 🔄 Auto-refresh Enhancement

**Improve auto-refresh with better UX:**

```javascript
let autoRefreshInterval = null;
let refreshCountdown = 30;

function startAutoRefresh() {
    const statusText = document.getElementById('statusText');

    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    autoRefreshInterval = setInterval(() => {
        refreshCountdown--;
        statusText.textContent = `Next refresh in ${refreshCountdown}s`;

        if (refreshCountdown <= 0) {
            refreshCountdown = 30;
            refreshData();
        }
    }, 1000);
}
```

---

## 📊 Complete Integration Example

**Add to your loadData() function:**

```javascript
async function loadData() {
    try {
        showToast('Loading data...', 'info');

        const stats = await fetchStats();
        await createEngagementDonutChart(stats);
        await createTopAuthorsChart();
        await createAuthorsHorizontalChart(); // ✅ NEW
        await createDailyTrendsChart();
        await createTopPostsChart();
        await createWordCloud(); // ✅ NEW
        await fetchPosts();
        await fetchComments();
        await fetchAuthors();

        showToast('Data loaded successfully', 'success');
        startAutoRefresh();
    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading data', 'error');
    }
}
```

---

## ✅ Checklist Summary

- ✅ Backend API endpoints (DONE)
- ⏳ Add WordCloud.js library
- ⏳ Add Chart.js DataLabels plugin
- ⏳ Update color palette
- ⏳ Add center text to donut chart
- ⏳ Create horizontal bar chart
- ⏳ Create word cloud visualization
- ⏳ Add see more/hide for text
- ⏳ Add views count metric
- ⏳ Improve chart data labels
- ⏳ Test all features

---

**Ready to implement! Backend is live and waiting for frontend integration.** 🚀
