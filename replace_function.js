const fs = require('fs');

// Read the file
let content = fs.readFileSync('facebookkey.js', 'utf8');

// Find the start and end of extractCommentsFromDialog function
const startPattern = /^async function extractCommentsFromDialog\(page, postUrl, postAuthor\) \{$/m;
const match = content.match(startPattern);

if (!match) {
    console.log('❌ Function start not found!');
    process.exit(1);
}

const startIndex = match.index;

// Find the end of the function (next top-level async function)
const afterStart = content.substring(startIndex);
const endPattern = /\n\n\/\*\*[\s\S]*?\*\/\nasync function extractCommentsFromHTML/;
const endMatch = afterStart.match(endPattern);

if (!endMatch) {
    console.log('❌ Function end not found!');
    process.exit(1);
}

const endIndex = startIndex + endMatch.index;

console.log(`✅ Found function from char ${startIndex} to ${endIndex}`);
console.log(`📏 Old function length: ${endIndex - startIndex} characters`);

// The new enhanced function
const newFunction = `async function extractCommentsFromDialog(page, postUrl, postAuthor) {
    const comments = [];
    const globalSeenComments = new Set();

    try {
        console.log(\`      💬 HTML: Extracting from opened dialog...\`);

        // ✅ STEP 1: Find dialog
        const dialog = page.locator('div[role="dialog"]').first();
        if (await dialog.count() === 0) {
            console.log(\`      ⚠️  No dialog found!\`);
            return [];
        }

        // ✅ STEP 1.5: Extract post author dari dialog header
        try {
            console.log(\`         -> Extracting post author from dialog...\`);
            const dialogHeaderSelectors = [
                'div[role="dialog"] h2[dir="auto"]',
                'div[role="dialog"] h2 span[dir="auto"]',
                'div[role="dialog"][aria-label]',
                'div[role="dialog"] span.x193iq5w.xeuugli',
            ];

            for (const selector of dialogHeaderSelectors) {
                const headerEl = page.locator(selector).first();
                if (await headerEl.count() > 0) {
                    let headerText = await headerEl.textContent().catch(() => '');
                    if (!headerText) {
                        headerText = await headerEl.getAttribute('aria-label').catch(() => '');
                    }
                    if (headerText) {
                        let match = headerText.match(/(.+)'s post/i);
                        if (match) {
                            postAuthor = match[1].trim();
                            console.log(\`         ✅ Post author: \${postAuthor}\`);
                            break;
                        }
                        if (headerText.length > 0 && headerText.length < 100) {
                            postAuthor = headerText.trim();
                            console.log(\`         ✅ Post author (alt): \${postAuthor}\`);
                            break;
                        }
                    }
                }
            }
            if (postAuthor === 'Unknown') {
                console.log(\`         ⚠️ Could not extract post author from dialog\`);
            }
        } catch (e) {
            console.log(\`         ⚠️ Error extracting post author: \${e.message.substring(0, 40)}\`);
        }

        // ✅ STEP 2: Wait for dialog to load
        console.log(\`         -> Waiting for dropdown to load...\`);
        await page.waitForTimeout(4000);

        // Check for loading indicators
        let loadingCheckAttempts = 0;
        const maxLoadingChecks = 5;
        while (loadingCheckAttempts < maxLoadingChecks) {
            const isLoading = await page.locator(
                'div[role="dialog"] div[role="progressbar"], ' +
                'div[role="dialog"] div[data-visualcompletion="loading-state"]'
            ).count() > 0;

            if (isLoading) {
                console.log(\`         -> Dialog still loading (check \${loadingCheckAttempts + 1}/\${maxLoadingChecks})...\`);
                await page.waitForTimeout(2000);
                loadingCheckAttempts++;
            } else {
                console.log(\`         -> Dialog fully loaded!\`);
                break;
            }
        }
        await page.waitForTimeout(1500);

        // ✅ STEP 3: Click "Most relevant" dropdown & select "All comments"
        const dropdownSelectors = [
            'div[aria-expanded="false"][aria-haspopup="menu"][role="button"]:has(span:has-text("Most relevant"))',
            'div[aria-haspopup="menu"][role="button"]:has(span:has-text("Most relevant"))',
            'div.x1i10hfl.xjbqb8w[role="button"]:has(span.x193iq5w:has-text("Most relevant"))',
            'div[role="button"]:has(span:has-text("Most relevant"))',
        ];

        let dropdownClicked = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            for (const selector of dropdownSelectors) {
                try {
                    const parentButton = page.locator(selector).first();
                    await parentButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

                    const count = await parentButton.count();
                    if (count === 0) continue;

                    console.log(\`         -> Found dropdown with: \${selector.substring(0, 60)}... (attempt \${attempt}/3)\`);
                    await parentButton.scrollIntoViewIfNeeded().catch(() => {});
                    await page.waitForTimeout(800);

                    let clicked = false;
                    try {
                        await parentButton.click({ timeout: 5000 });
                        clicked = true;
                    } catch (e1) {
                        try {
                            await parentButton.click({ force: true, timeout: 5000 });
                            clicked = true;
                        } catch (e2) {
                            await parentButton.evaluate(el => el.click());
                            clicked = true;
                        }
                    }

                    if (clicked) {
                        await page.waitForTimeout(3000);
                        const menuOpened = await page.locator('div[role="menu"]').count() > 0;
                        if (menuOpened) {
                            console.log(\`         ✅ Dropdown opened successfully!\`);
                            dropdownClicked = true;
                            break;
                        } else {
                            console.log(\`         ⚠️ Menu didn't open, retrying...\`);
                            await page.waitForTimeout(2000);
                        }
                    }
                } catch (e) {
                    console.log(\`         -> Dropdown click failed with selector \${dropdownSelectors.indexOf(selector) + 1}: \${e.message.substring(0, 30)}\`);
                    continue;
                }
            }
            if (dropdownClicked) break;
            if (attempt < 3) {
                console.log(\`         -> Retrying dropdown click (attempt \${attempt + 1}/3)...\`);
                await page.waitForTimeout(2000);
            }
        }

        if (!dropdownClicked) {
            console.log(\`         ⚠️ Could not open dropdown after 3 attempts (continuing with default filter)\`);
        }

        // ✅ STEP 4: Click "All comments"
        if (dropdownClicked) {
            console.log(\`         -> Looking for comment filter options...\`);
            await page.waitForTimeout(1500);

            let allCommentsClicked = false;
            try {
                const allMenuItems = await page.locator('div[role="menuitem"]').all();
                console.log(\`         -> Found \${allMenuItems.length} filter option(s)\`);

                for (let i = 0; i < allMenuItems.length; i++) {
                    const menuItem = allMenuItems[i];
                    try {
                        const itemText = await menuItem.textContent().catch(() => '');
                        console.log(\`         -> Option \${i + 1}: "\${itemText.substring(0, 30)}..."\`);

                        if (itemText.includes('All comments') || itemText.includes('Show all comments')) {
                            console.log(\`         ✅ Found "All comments" (option \${i + 1})! Clicking...\`);
                            await menuItem.scrollIntoViewIfNeeded().catch(() => {});
                            await page.waitForTimeout(500);

                            let clicked = false;
                            try {
                                await menuItem.click({ timeout: 3000 });
                                clicked = true;
                            } catch (e1) {
                                try {
                                    await menuItem.click({ force: true, timeout: 3000 });
                                    clicked = true;
                                } catch (e2) {
                                    const spanInside = menuItem.locator('span:has-text("All comments")').first();
                                    if (await spanInside.count() > 0) {
                                        await spanInside.click({ timeout: 3000 });
                                        clicked = true;
                                    }
                                }
                            }

                            if (clicked) {
                                await page.waitForTimeout(3000);
                                console.log(\`         ✅ "All comments" selected successfully!\`);
                                allCommentsClicked = true;
                                break;
                            } else {
                                console.log(\`         ⚠️ Click failed, trying next option...\`);
                            }
                        }
                    } catch (itemError) {
                        console.log(\`         -> Error checking option \${i + 1}: \${itemError.message.substring(0, 30)}\`);
                        continue;
                    }
                }

                if (!allCommentsClicked) {
                    console.log(\`         ⚠️ "All comments" not found, trying "Newest" as fallback\`);
                    for (const menuItem of allMenuItems) {
                        const itemText = await menuItem.textContent().catch(() => '');
                        if (itemText.includes('Newest') || itemText.includes('newest comments first')) {
                            console.log(\`         -> Clicking "Newest" as fallback...\`);
                            try {
                                await menuItem.scrollIntoViewIfNeeded().catch(() => {});
                                await page.waitForTimeout(500);
                                await menuItem.click({ timeout: 3000 });
                                await page.waitForTimeout(2000);
                                console.log(\`         ✓ "Newest" selected as fallback\`);
                                allCommentsClicked = true;
                                break;
                            } catch (e) {
                                console.log(\`         ⚠️ Newest click failed\`);
                            }
                        }
                    }
                }

                if (!allCommentsClicked) {
                    console.log(\`         ℹ️ Using default filter (Most relevant)\`);
                }
            } catch (error) {
                console.log(\`         ⚠️ Error selecting filter: \${error.message.substring(0, 40)}\`);
                console.log(\`         -> Continuing with default filter...\`);
            }
        }

        // ✅ STEP 5: Find scrollable container (5 STRATEGIES!)
        console.log(\`         -> Finding scrollable comment area...\`);
        let scrollableArea = null;

        // Strategy 1: Exact class
        scrollableArea = page.locator(
            'div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x78zum5.xdt5ytf.x1iyjqo2.x1n2onr6.xqbnct6.xga75y6'
        ).first();
        if (await scrollableArea.count() > 0) {
            console.log(\`         ✓ Strategy 1: Found via exact class\`);
        }

        // Strategy 2: Shorter class
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(\`         -> Strategy 1 failed, trying strategy 2...\`);
            scrollableArea = page.locator('div.x1iyjqo2.x1n2onr6.xqbnct6').first();
            if (await scrollableArea.count() > 0) {
                console.log(\`         ✓ Strategy 2: Found via short class\`);
            }
        }

        // Strategy 3: Any scrollable div in dialog
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(\`         -> Strategy 2 failed, trying strategy 3...\`);
            const allDivs = await page.locator('div[role="dialog"] div').all();
            for (let i = 0; i < Math.min(allDivs.length, 20); i++) {
                const div = allDivs[i];
                const canScroll = await div.evaluate(el => {
                    return el.scrollHeight > el.clientHeight && el.scrollHeight > 500;
                }).catch(() => false);

                if (canScroll) {
                    scrollableArea = div;
                    console.log(\`         ✓ Strategy 3: Found scrollable div (index \${i})\`);
                    break;
                }
            }
        }

        // Strategy 4: Dialog's main content area
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(\`         -> Strategy 3 failed, trying strategy 4...\`);
            scrollableArea = page.locator('div[role="dialog"] > div > div').nth(1);
            if (await scrollableArea.count() > 0) {
                console.log(\`         ✓ Strategy 4: Using nth-child approach\`);
            }
        }

        // Strategy 5: Dialog itself
        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(\`         -> All strategies failed, using dialog as container\`);
            scrollableArea = page.locator('div[role="dialog"]').first();
        }

        if (!scrollableArea || await scrollableArea.count() === 0) {
            console.log(\`         ❌ No container found at all\`);
            return [];
        }

        // ✅ STEP 6: Enhanced scrolling with loading detection & View More buttons
        console.log(\`         -> Scrolling to load comments...\`);
        let previousCount = 0;
        let sameCountTimes = 0;
        const maxSameCount = 8;
        let scrollAttempts = 0;
        const maxScrollAttempts = 100;
        let lastScrollTop = 0;
        let stuckScrollCount = 0;
        const maxStuckCount = 6;
        let lastVisibleCommentEl = null;

        while (sameCountTimes < maxSameCount &&
            scrollAttempts < maxScrollAttempts &&
            comments.length < CONFIG.MAX_COMMENTS_PER_POST) {

            scrollAttempts++;

            // Enhanced loading detection
            let loadingWaitAttempts = 0;
            const maxLoadingWait = 10;
            let loadingDetected = false;

            while (loadingWaitAttempts < maxLoadingWait) {
                const isLoading = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"][aria-label="Loading..."]'
                ).count() > 0;

                if (isLoading) {
                    loadingDetected = true;
                    console.log(\`         ⏳ Loading more comments (\${loadingWaitAttempts + 1}/\${maxLoadingWait})...\`);

                    if (lastVisibleCommentEl) {
                        try {
                            await lastVisibleCommentEl.evaluate(el => {
                                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                            }).catch(() => {});
                            await lastVisibleCommentEl.evaluate(el => {
                                el.style.border = '3px solid #ff9800';
                                el.style.backgroundColor = '#fff8e1';
                            }).catch(() => {});
                        } catch (e) {}
                    }

                    await page.waitForTimeout(5000);
                    loadingWaitAttempts++;
                } else {
                    if (loadingDetected && loadingWaitAttempts > 0) {
                        console.log(\`         ✅ Loading complete after \${loadingWaitAttempts} check(s)!\`);
                    }
                    break;
                }
            }

            if (loadingWaitAttempts >= maxLoadingWait) {
                console.log(\`         ⚠️ Loading didn't stop after \${maxLoadingWait} checks (50s) - continuing anyway...\`);
            }

            if (loadingDetected) {
                await page.waitForTimeout(2000);
            }

            // Scroll with multiple methods
            try {
                await scrollableArea.evaluate(el => {
                    el.scrollTop = el.scrollHeight;
                }).catch(() => {});

                await scrollableArea.evaluate(el => {
                    el.scrollBy(0, 1000);
                }).catch(() => {});

                const lastComment = scrollableArea.locator('div[role="article"]').last();
                if (await lastComment.count() > 0) {
                    await lastComment.scrollIntoViewIfNeeded().catch(() => {});
                    lastVisibleCommentEl = lastComment;
                }
            } catch (e) {
                console.log(\`         -> Scroll error: \${e.message.substring(0, 30)}\`);
            }

            await page.waitForTimeout(CONFIG.COMMENT_SCROLL_DELAY + 2000);

            // Check scroll position
            const currentScrollTop = await scrollableArea.evaluate(el => el.scrollTop).catch(() => -1);

            if (currentScrollTop === lastScrollTop && currentScrollTop !== -1) {
                stuckScrollCount++;
                console.log(\`         -> Scroll position stuck (\${stuckScrollCount}/\${maxStuckCount})\`);

                if (stuckScrollCount >= maxStuckCount) {
                    const viewMoreButton = await scrollableArea.locator(
                        'div[role="button"]:has-text("View more comments"), ' +
                        'span:has-text("View more comments"), ' +
                        'div[role="button"]:has-text("View previous comments")'
                    ).first();

                    if (await viewMoreButton.count() > 0) {
                        console.log(\`         -> Found "View more" button, clicking...\`);
                        try {
                            await viewMoreButton.scrollIntoViewIfNeeded().catch(() => {});
                            await page.waitForTimeout(500);
                            await viewMoreButton.click({ timeout: 3000 });
                            await page.waitForTimeout(3000);
                            stuckScrollCount = 0;
                            console.log(\`         ✅ "View more" clicked, continuing...\`);
                            continue;
                        } catch (e) {
                            console.log(\`         -> Could not click "View more"\`);
                        }
                    }

                    const finalLoadingCheck = await scrollableArea.locator(
                        'div[role="status"][data-visualcompletion="loading-state"]'
                    ).count() > 0;

                    if (!finalLoadingCheck) {
                        console.log(\`         ✅ No loading indicator + scroll stuck = End reached!\`);
                        break;
                    } else {
                        console.log(\`         ⚠️ Still loading detected, waiting more...\`);
                        stuckScrollCount = 0;
                    }
                }
            } else {
                stuckScrollCount = 0;
                lastScrollTop = currentScrollTop;
            }

            // Extract visible comments
            const currentComments = await extractVisibleComments(scrollableArea, postAuthor, page);

            const newCommentsOnly = currentComments.filter(comment => {
                const fingerprint = \`\${comment.comment_author}|\${comment.comment_text.substring(0, 50)}\`;
                if (!globalSeenComments.has(fingerprint)) {
                    globalSeenComments.add(fingerprint);
                    return true;
                }
                return false;
            });

            comments.push(...newCommentsOnly);
            const currentCount = comments.length;

            if (currentCount === previousCount) {
                sameCountTimes++;
                console.log(\`         -> Same count (\${sameCountTimes}/\${maxSameCount}): \${currentCount} comments\`);

                const noLoading = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"]'
                ).count() === 0;

                if (noLoading && sameCountTimes >= 3) {
                    console.log(\`         ✅ No new comments + no loading = Finished!\`);
                    break;
                }
            } else {
                sameCountTimes = 0;
                const newAdded = currentCount - previousCount;
                console.log(\`         -> Loaded: \${currentCount} comments (+\${newAdded} NEW, \${currentComments.length - newAdded} duplicate)\`);
            }

            previousCount = currentCount;

            // Double-check if at end
            if (sameCountTimes >= maxSameCount - 1) {
                console.log(\`         -> Double-checking if truly at end...\`);
                await page.waitForTimeout(5000);

                const finalCheck = await scrollableArea.locator(
                    'div[role="status"][data-visualcompletion="loading-state"]'
                ).count() > 0;

                if (finalCheck) {
                    console.log(\`         -> Still loading, resetting counter...\`);
                    sameCountTimes = 0;
                    continue;
                }

                const recheckComments = await extractVisibleComments(scrollableArea, postAuthor, page);
                let foundMore = false;
                for (const comment of recheckComments) {
                    const fingerprint = \`\${comment.comment_author}|\${comment.comment_text.substring(0, 50)}\`;
                    if (!globalSeenComments.has(fingerprint)) {
                        foundMore = true;
                        break;
                    }
                }

                if (foundMore) {
                    console.log(\`         -> Found more NEW comments!\`);
                    sameCountTimes = 0;
                    continue;
                }

                const viewMoreBtn = await scrollableArea.locator(
                    'div[role="button"]:has-text("View more"), span:has-text("View more")'
                ).first();

                if (await viewMoreBtn.count() > 0) {
                    console.log(\`         -> Final check: "View more" button found!\`);
                    try {
                        await viewMoreBtn.click({ timeout: 3000 });
                        await page.waitForTimeout(3000);
                        sameCountTimes = 0;
                        console.log(\`         -> Clicked, continuing...\`);
                        continue;
                    } catch (e) {
                        console.log(\`         -> Could not click final "View more"\`);
                    }
                }
            }
        }

        // Clear highlight
        if (lastVisibleCommentEl) {
            try {
                await lastVisibleCommentEl.evaluate(el => {
                    el.style.border = '';
                    el.style.backgroundColor = '';
                }).catch(() => {});
            } catch (e) {}
        }

        console.log(\`         ✓ Scroll complete after \${scrollAttempts} attempts\`);
        console.log(\`         ✅ Extracted \${comments.length} comments\`);

        // Set post_url for all comments
        for (const comment of comments) {
            comment.post_url = postUrl;
        }

        return comments;

    } catch (error) {
        console.warn(\`      ⚠️ Dialog extraction error: \${error.message.substring(0, 50)}\`);
        return [];
    }
}`;

// Replace
const before = content.substring(0, startIndex);
const after = content.substring(endIndex);
const newContent = before + newFunction + after;

// Write back
fs.writeFileSync('facebookkey.js', newContent, 'utf8');

console.log('✅ Function replaced successfully!');
console.log(`📏 New function length: ${newFunction.length} characters`);
console.log('🎉 Done! File saved.');
