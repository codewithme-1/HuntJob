/**
 * HuntJob - Dashboard Logic
 * Auto-sync Balances, Transaction History, and Self-Healing Session
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUR9lHgatZbhQOpi18ltUL3ohmmj8F6lya4M3E7CAP-flZ34Ec2VUAVrm-BVVR1AxOww/exec";
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 Minutes

// Global state for filtering & Tickets
window.allActiveJobs = [];
window.currentUserData = null;
window.userTickets = []; // NEW

// Helper to safely parse currency strings
function parseSafeNumber(val) {
    if (val === null || val === undefined) return 0;
    const cleaned = String(val).replace(/[^0-9.-]+/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. SELF-HEALING SESSION GUARD ---
    let user;
    try {
        const sessionData = localStorage.getItem('huntJob_session');
        if (!sessionData) throw new Error("No Session");
        
        user = JSON.parse(sessionData);
        if (!user || !user.email || user.email === "undefined" || user.email === undefined) {
            throw new Error("Corrupted Session");
        }
    } catch (e) {
        localStorage.removeItem('huntJob_session');
        window.location.href = "index.html";
        return;
    }

    document.getElementById('userGreeting').innerText = user.username || "Hunter";
    updateUIVisuals(user);
    renderTasks(user); 

    syncAllData(user.email);
    setInterval(() => syncAllData(user.email), 20000); 

    // --- 2. INACTIVITY AUTO-LOGOUT LOGIC ---
    const updateActivity = () => localStorage.setItem('huntJob_lastActivity', Date.now());
    updateActivity(); 

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, updateActivity, { passive: true });
    });

    setInterval(() => {
        const lastActivity = parseInt(localStorage.getItem('huntJob_lastActivity')) || Date.now();
        if (Date.now() - lastActivity > SESSION_TIMEOUT) {
            window.logout();
        }
    }, 30000); 

    // --- 3. SPA NAVIGATION LOGIC ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.page-view');
    const subtitle = document.getElementById('viewSubtitle');

    const switchView = (targetView) => {
        navItems.forEach(nav => {
            const isMatch = nav.getAttribute('data-view') === targetView;
            nav.classList.toggle('active', isMatch);
        });

        views.forEach(view => {
            view.classList.toggle('d-none', view.id !== `view-${targetView}`);
        });

        const subtitles = {
            dashboard: "Ready to secure the bag today?",
            tasks: "Your current progress and active hustles.",
            referrals: "Grow your network, grow your wallet.",
            wallet: "Manage your earnings and withdrawals.",
            settings: "Customize your Hunter profile.",
            upgrade: "Unlock your full potential.",
            copay: "Help a friend unlock their account.", // NEW
            support: "We are here to help." // NEW
        };
        subtitle.innerText = subtitles[targetView] || "";

        const currentSession = JSON.parse(localStorage.getItem('huntJob_session')) || {};
        
        if (targetView === 'wallet') fetchWithdrawals(currentSession.email);
        if (targetView === 'referrals') fetchReferrals(currentSession.uid); 
        if (targetView === 'tasks') fetchMyTasks(currentSession.email); 
        if (targetView === 'support') fetchTickets(currentSession.uid); // NEW
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetView = item.getAttribute('data-view');
            if (!targetView) return; 
            e.preventDefault();
            switchView(targetView);
        });
    });

    window.navigateToView = switchView;

    // --- 4. LOGOUT LOGIC ---
    window.logout = () => {
        localStorage.removeItem('huntJob_session');
        window.location.href = "index.html";
    };
    document.getElementById('logoutBtn').onclick = (e) => {
        e.preventDefault();
        window.logout();
    };

    // --- 5. SETTINGS INNER TABS LOGIC ---
    const settingsTabs = document.querySelectorAll('.settings-tab');
    const settingsSections = document.querySelectorAll('.settings-section');

    settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            settingsTabs.forEach(t => t.classList.remove('active'));
            settingsSections.forEach(s => s.classList.add('d-none'));
            
            tab.classList.add('active');
            document.getElementById(`sec-${tab.dataset.target}`).classList.remove('d-none');
        });
    });
});

/**
 * Manual Refresh Function
 */
window.manualRefresh = async function(btnElement) {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    if (!session || !session.email) return;

    if (btnElement && btnElement.classList) {
        btnElement.classList.add('spinning');
        btnElement.disabled = true;
    }
    showToast("Syncing with hunter ledger...", "success");

    try {
        await syncAllData(session.email);
        if (!document.getElementById('view-wallet').classList.contains('d-none')) {
            await fetchWithdrawals(session.email);
        }
        if (!document.getElementById('view-referrals').classList.contains('d-none')) {
            await fetchReferrals(session.uid);
        }
        if (!document.getElementById('view-tasks').classList.contains('d-none')) {
            await fetchMyTasks(session.email);
        }
        if (!document.getElementById('view-support').classList.contains('d-none')) {
            await fetchTickets(session.uid);
        }
        
        await renderTasks(session);

        showToast("Sync Complete!", "success");
    } catch (err) {
        showToast("Sync failed. Check connection.", "error");
    } finally {
        if (btnElement && btnElement.classList) {
            setTimeout(() => {
                btnElement.classList.remove('spinning');
                btnElement.disabled = false;
            }, 800);
        }
    }
};

/**
 * Update UI Elements across all views (Including Settings)
 */
function updateUIVisuals(data) {
    if (!data) return;

    if (data.username && data.username !== "undefined") {
        document.getElementById('userGreeting').innerText = data.username;
        const headerUsername = document.getElementById('headerUsername');
        if (headerUsername) headerUsername.innerText = data.username;
        
        const avatarLetter = document.getElementById('avatarLetter');
        if (avatarLetter) avatarLetter.innerText = data.username.charAt(0).toUpperCase();
        
        const userInp = document.getElementById('settingUsername');
        if (userInp && !userInp.value) userInp.value = data.username;
    }

    if (data.email) {
        const headerEmail = document.getElementById('headerEmail');
        if (headerEmail) headerEmail.innerText = data.email;
        
        const settingEmail = document.getElementById('settingEmail');
        if (settingEmail) settingEmail.value = data.email;
    }

    if (data.phone) {
        const phoneInp = document.getElementById('settingPhone');
        if (phoneInp && !phoneInp.value) phoneInp.value = data.phone;
    }

    if (data.uid) {
        const statusUid = document.getElementById('statusUid');
        if (statusUid) statusUid.value = data.uid;
    }

    const formattedBalance = parseSafeNumber(data.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedRefEarned = parseSafeNumber(data.refEarned).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedPending = parseSafeNumber(data.pendingReview).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const dashBal = document.getElementById('userBalance');
    if (dashBal) dashBal.innerText = formattedBalance;

    const walletBal = document.getElementById('walletBalanceDisplay');
    if (walletBal) walletBal.innerText = formattedBalance;

    const refEarnedEl = document.getElementById('refEarned');
    if (refEarnedEl) refEarnedEl.innerText = formattedRefEarned;

    const pendingEl = document.getElementById('pendingAmt');
    if (pendingEl) pendingEl.innerText = formattedPending;
    
    const tokenDisplay = document.getElementById('tokenBalanceDisplay');
    if (tokenDisplay) tokenDisplay.innerText = parseSafeNumber(data.tokens);

    const tierText = (data.tier && data.tier !== "Unpaid") ? `${data.tier.toUpperCase()} HUNTER` : "UNPAID ACCOUNT";
    const tierBadge = document.getElementById('userTier');
    if (tierBadge) tierBadge.innerText = tierText;
    
    const statusTierDisplay = document.getElementById('statusTierDisplay');
    if (statusTierDisplay) statusTierDisplay.innerText = tierText;

    const refLinkEl = document.getElementById('refLinkText');
    if (refLinkEl && data.uid) {
        let baseUrl = window.location.origin + window.location.pathname.replace('dashboard.html', '');
        if (!baseUrl.endsWith('/')) baseUrl += '/';
        refLinkEl.innerText = `${baseUrl}index.html?ref=${data.uid}`;
    }
}

/**
 * Sync fresh user stats from Google Sheet
 */
async function syncAllData(email) {
    if (!email || email === "undefined") return;
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getUserStats&email=${encodeURIComponent(email)}&t=${Date.now()}`);
        const result = await response.json();

        const payload = result.data || result.message;

        if (result.status === "Success" && payload && payload.balance !== undefined) {
            const oldSession = JSON.parse(localStorage.getItem('huntJob_session')) || {};
            localStorage.setItem('huntJob_session', JSON.stringify({...oldSession, ...payload}));
            updateUIVisuals(payload);
            
            if (oldSession.tier !== payload.tier) {
                renderTasks(payload);
            }
        }
    } catch (err) {
        console.error("Auto-sync Error:", err);
    }
}

/**
 * SETTINGS API: Update Personal Info
 */
window.savePersonalInfo = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('saveInfoBtn');
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    
    const newUsername = document.getElementById('settingUsername').value.trim();
    const newPhone = document.getElementById('settingPhone').value.trim();

    if (!newUsername || !newPhone) {
        showToast("Fields cannot be empty.", "error");
        return;
    }

    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "updateProfile",
                email: session.email,
                username: newUsername,
                phone: newPhone
            })
        });
        const result = await response.json();
        const payload = result.data || result.message;

        if (result.status === "Success") {
            showToast("Profile updated successfully!", "success");
            localStorage.setItem('huntJob_session', JSON.stringify({...session, ...payload}));
            updateUIVisuals(payload);
            
            document.getElementById('userGreeting').innerText = newUsername;
        } else {
            showToast(payload, "error");
        }
    } catch(err) {
        showToast("Network error. Could not save.", "error");
    } finally {
        btn.innerText = "Save Changes";
        btn.disabled = false;
    }
};

/**
 * SETTINGS API: Update Password
 */
window.updatePassword = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('updatePassBtn');
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    
    const currentPass = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmNewPass').value;

    if (newPass.length < 12) {
        showToast("New password must be at least 12 characters.", "error");
        return;
    }
    if (newPass !== confirmPass) {
        showToast("New passwords do not match.", "error");
        return;
    }

    btn.innerText = "Updating...";
    btn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "updatePassword",
                email: session.email,
                currentPass: currentPass,
                newPass: newPass
            })
        });
        const result = await response.json();
        const payload = result.data || result.message;

        if (result.status === "Success") {
            showToast(payload, "success");
            document.getElementById('sec-security').reset();
        } else {
            showToast(payload, "error");
        }
    } catch(err) {
        showToast("Network error. Could not update.", "error");
    } finally {
        btn.innerText = "Update Password";
        btn.disabled = false;
    }
};

window.copyUid = function() {
    const uidText = document.getElementById('statusUid').value;
    navigator.clipboard.writeText(uidText).then(() => {
        showToast("Hunter ID Copied!", "success");
    });
};

/**
 * Fetch Withdrawal History
 */
async function fetchWithdrawals(email) {
    const historyBody = document.getElementById('withdrawalHistoryBody');
    if (!historyBody || !email || email === "undefined") return;

    try {
        const response = await fetch(`${SCRIPT_URL}?action=getWithdrawals&email=${encodeURIComponent(email)}&t=${Date.now()}`);
        const result = await response.json();

        const payload = result.data || result.message || [];

        if (result.status === "Success" && Array.isArray(payload)) {
            historyBody.innerHTML = ""; 
            
            if (payload.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">No transactions yet.</td></tr>';
                return;
            }

            payload.reverse().forEach(tx => {
                const statusStyle = tx.status === 'Pending' ? 'color: #f59e0b' : 'color: #10b981';
                historyBody.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--glass-border); font-size: 0.85rem;">
                        <td style="padding: 12px 0;">${new Date(tx.date).toLocaleDateString()}</td>
                        <td style="padding: 12px 0; font-weight: 600;">KES ${parseSafeNumber(tx.amount)}</td>
                        <td style="padding: 12px 0; color: var(--text-dim);">${tx.phone}</td>
                        <td style="padding: 12px 0; font-weight: 600; ${statusStyle}">${tx.status}</td>
                    </tr>
                `;
            });
        }
    } catch (err) {
        console.error("History Fetch Error:", err);
    }
}

/**
 * Fetch Referral History
 */
async function fetchReferrals(uid) {
    const historyBody = document.getElementById('referralHistoryBody');
    if (!historyBody) return;

    if (!uid || uid === "undefined") {
        historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">No referrals yet. (If you just logged in, refresh the page).</td></tr>';
        return;
    }

    try {
        const response = await fetch(`${SCRIPT_URL}?action=getReferrals&uid=${encodeURIComponent(uid)}&t=${Date.now()}`);
        const textResponse = await response.text();
        let result;
        
        try {
            result = JSON.parse(textResponse);
        } catch (jsonErr) {
            historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Backend Error: Please deploy Code.gs as a <b>New Version</b>.</td></tr>';
            return;
        }

        const payload = result.data || result.message || [];

        if (result.status === "Success" && Array.isArray(payload)) {
            historyBody.innerHTML = ""; 
            
            if (payload.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-dim);">No referrals yet. Share your link!</td></tr>';
                return;
            }

            payload.reverse().forEach(ref => {
                const statusStyle = ref.status === 'Pending' ? 'color: #f59e0b' : 'color: #10b981';
                let dateStr = "Recent";
                if (ref.date) {
                    const d = new Date(ref.date);
                    if (!isNaN(d.getTime())) dateStr = d.toLocaleDateString();
                }

                historyBody.innerHTML += `
                    <tr style="border-bottom: 1px solid var(--glass-border); font-size: 0.85rem;">
                        <td style="padding: 12px 0;">${dateStr}</td>
                        <td style="padding: 12px 0; font-weight: 600;">${ref.username || 'Unknown'}</td>
                        <td style="padding: 12px 0; font-weight: 600; ${statusStyle}">${ref.status}</td>
                        <td style="padding: 12px 0; font-weight: 600; color: #10b981;">KES ${parseSafeNumber(ref.earned)}</td>
                    </tr>
                `;
            });
        } else {
            historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Failed to load: ${result.message}</td></tr>`;
        }
    } catch (err) {
        historyBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#ef4444;">Network Error. Please check your connection.</td></tr>';
    }
}

/**
 * Freelance Grid & Category Rendering
 */
async function renderTasks(userData) {
    window.currentUserData = userData; // Save for filtering
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    if (window.allActiveJobs.length === 0) {
        taskList.innerHTML = '<p style="color:var(--text-dim); padding: 20px; grid-column: 1 / -1;">Hunting for jobs...</p>';
    }

    try {
        const response = await fetch(`${SCRIPT_URL}?action=getTasks&uid=${userData.uid || ''}&t=${new Date().getTime()}`);
        const result = await response.json();

        if (result.status === "Success" && Array.isArray(result.data)) {
            window.allActiveJobs = result.data;
            generateCategoryFilters(window.allActiveJobs);
            displayFilteredJobs(window.allActiveJobs);
        }
    } catch (err) { 
        taskList.innerHTML = '<p style="color:#ef4444; padding: 20px; grid-column: 1 / -1;">Failed to load jobs.</p>'; 
    }
}

function generateCategoryFilters(jobs) {
    const filterContainer = document.getElementById('categoryFilters');
    if (!filterContainer) return;

    const categories = new Set();
    jobs.forEach(job => {
        if (job.category && job.category.trim() !== "") {
            categories.add(job.category.trim());
        }
    });

    let html = `<button class="cat-btn active" onclick="filterTasks('All', this)">All</button>`;
    
    categories.forEach(cat => {
        html += `<button class="cat-btn" onclick="filterTasks('${cat}', this)">${cat}</button>`;
    });
    
    filterContainer.innerHTML = html;
}

window.filterTasks = function(category, btnElement) {
    if (btnElement) {
        document.querySelectorAll('.cat-btn').forEach(btn => btn.classList.remove('active'));
        btnElement.classList.add('active');
    }

    let filteredJobs = window.allActiveJobs;
    if (category !== 'All') {
        filteredJobs = window.allActiveJobs.filter(job => job.category && job.category.trim() === category);
    }
    
    displayFilteredJobs(filteredJobs);
};

// UPDATED: Dynamic Price-Based Tier Access Logic
function displayFilteredJobs(jobsToRender) {
    const taskList = document.getElementById('taskList');
    const userData = window.currentUserData || JSON.parse(localStorage.getItem('huntJob_session'));
    
    taskList.innerHTML = ""; 

    if (jobsToRender.length === 0) { 
        taskList.innerHTML = '<p style="color:var(--text-dim); padding: 20px; grid-column: 1 / -1;">No jobs available in this category.</p>'; 
        return; 
    }
    
    taskList.innerHTML = jobsToRender.map(job => {
        let userTier = userData.tier || "Unpaid";
        let jobRewardAmt = parseSafeNumber(job.reward);
        let isLocked = false;
        
        // Unpaid accounts can ONLY bid on tasks <= 500 KES
        if (userTier === "Unpaid" && jobRewardAmt > 500) isLocked = true;
        // Starter accounts can ONLY bid on tasks <= 4500 KES
        if (userTier === "Starter" && jobRewardAmt > 4500) isLocked = true;
        
        let btnHtml = "";
        if (job.hasApplied) {
            btnHtml = `<button class="btn-hunt" style="background: #3b82f6; width:100%;" disabled>Proposal Submitted</button>`;
        } else if (isLocked) {
            btnHtml = `<button class="btn-hunt" style="width:100%;" onclick="upgradeRedirect()">Upgrade to Bid</button>`;
        } else {
            btnHtml = `<button class="btn-hunt" style="width:100%;" onclick="openBidModal('${job.id}', '${job.title}', '${jobRewardAmt}', ${job.tokenCost})">Bid - ${job.tokenCost} Tokens</button>`;
        }

        return `
        <div class="task-card ${isLocked ? 'locked-task' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <div style="flex: 1; padding-right: 10px;">
                    <span class="tier-tag" style="margin-bottom: 8px; display: inline-block;">${job.category}</span>
                    <h3 style="font-size: 1.1rem; margin-bottom: 8px; line-height: 1.2;">${job.title} ${isLocked ? '<i data-lucide="lock" size="14"></i>' : ''}</h3>
                    <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.4; margin-bottom: 12px;">${job.desc || 'No description provided.'}</p>
                </div>
                <div style="text-align: right; min-width: 80px;">
                    <div style="color: var(--success); font-weight: 800; font-size: 1rem;">KES ${jobRewardAmt}</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">Est. Budget</div>
                </div>
            </div>

            <div style="margin-top: auto;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid var(--glass-border); margin-bottom: 12px;">
                    <div style="text-align: center; border-right: 1px solid var(--glass-border);">
                        <div style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Deadline</div>
                        <div style="font-size: 0.8rem; font-weight: 600;">${job.time}</div>
                    </div>
                    <div style="text-align: center; border-right: 1px solid var(--glass-border);">
                        <div style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Proposals</div>
                        <div style="font-size: 0.8rem; font-weight: 600; color: var(--primary);">${job.applicants || 0}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase;">Cost</div>
                        <div style="font-size: 0.8rem; font-weight: 600; color: #f59e0b;">${job.tokenCost} <i data-lucide="coins" size="12"></i></div>
                    </div>
                </div>
                ${btnHtml}
            </div>
        </div>`;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

/**
 * --- UPGRADE & PAYMENT LOGIC ---
 */
window.upgradeRedirect = function() {
    window.navigateToView('upgrade');
};

let selectedUpgrade = { amount: 0, tier: "" };

window.openPaymentModal = function(amount, tier) {
    selectedUpgrade = { amount: amount, tier: tier };
    document.getElementById('payAmountLabel').innerText = `KES ${amount}`;
    document.getElementById('paymentModal').style.display = 'flex';
};

window.closeModal = function(modalId) {
    document.getElementById(modalId).style.display = 'none';
};

window.processPayment = async function() {
    const phone = document.getElementById('payPhone').value.trim();
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const btn = document.getElementById('paySubmitBtn');

    if (!phone || phone.length < 10) {
        showToast("Enter a valid M-Pesa number.", "error");
        return;
    }

    btn.innerText = "Check your phone...";
    btn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "initiatePayment",
                email: session.email,
                phone: phone,
                amount: selectedUpgrade.amount,
                type: "Tier",
                tier: selectedUpgrade.tier
            })
        });
        const result = await response.json();
        
        if (result.status === "Success") {
            showToast("STK Push sent! Once paid, refresh the page.", "success");
            setTimeout(() => { closeModal('paymentModal'); }, 3000);
        } else {
            showToast(result.message || "Payment rejected.", "error");
        }
    } catch (err) {
        showToast("Payment service busy. Try again.", "error");
    } finally {
        btn.innerText = "Initiate Payment";
        btn.disabled = false;
    }
};

/**
 * TOKEN RECHARGE LOGIC
 */
let selectedToken = { amount: 0, tokens: 0 };
window.openTokenModal = () => document.getElementById('tokenModal').style.display = 'flex';

window.buyTokens = function(kesAmount, tokenCount) {
    selectedToken = { amount: kesAmount, tokens: tokenCount };
    document.getElementById('payTokenBtn').innerText = `Pay KES ${kesAmount} for ${tokenCount} Tokens`;
    document.getElementById('payTokenBtn').style.display = 'block';
};

window.processTokenPayment = async function() {
    const phone = document.getElementById('tokenPhone').value.trim();
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const btn = document.getElementById('payTokenBtn');

    if (!phone || phone.length < 10) return showToast("Enter a valid M-Pesa number.", "error");

    btn.innerText = "Check your phone..."; btn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "initiatePayment",
                email: session.email,
                phone: phone,
                amount: selectedToken.amount,
                type: "Token",
                tokenAmount: selectedToken.tokens 
            })
        });
        const result = await response.json();
        
        if (result.status === "Success") {
            showToast("STK Push sent! Enter PIN, then refresh.", "success");
            setTimeout(() => { closeModal('tokenModal'); }, 3000);
        } else { showToast(result.message || "Payment rejected.", "error"); }
    } catch (err) { showToast("Payment service busy. Try again.", "error"); } 
    finally { btn.innerText = "Pay Now"; btn.disabled = false; }
};

/**
 * BIDDING MODAL LOGIC 
 */
window.openBidModal = function(id, title, budget, cost) {
    const session = window.currentUserData || JSON.parse(localStorage.getItem('huntJob_session'));
    const currentTokens = parseSafeNumber(session.tokens);
    
    // Intercept bid if they don't have enough tokens
    if (currentTokens < cost) {
        showToast(`You need ${cost} tokens to bid. Redirecting to token store...`, "warning");
        openTokenModal();
        return;
    }

    document.getElementById('bidJobId').value = id;
    document.getElementById('bidJobTitle').innerText = title;
    document.getElementById('bidJobBudget').innerText = `Client Budget: KES ${budget}`;
    document.getElementById('bidTokenCost').innerText = `Cost: ${cost} Tokens`;
    document.getElementById('userBidAmount').value = budget; 
    document.getElementById('userProposal').value = ""; 
    document.getElementById('bidModal').style.display = 'flex';
};

window.processBid = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const jobId = document.getElementById('bidJobId').value;
    const amount = parseSafeNumber(document.getElementById('userBidAmount').value);
    const proposal = document.getElementById('userProposal').value;
    const btn = document.getElementById('submitBidBtn');

    if (!amount || amount <= 0) return showToast("Enter a valid bid amount", "error");
    if (!proposal || proposal.length < 10) return showToast("Write a short proposal explaining why you fit.", "error");

    btn.innerText = "Submitting Proposal..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "applyForTask", email: session.email, taskId: jobId, bidAmount: amount, proposal: proposal })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error Response:", text);
            throw new Error("Server Error");
        }
        if (result.status === "Success") {
            showToast("Proposal submitted successfully!", "success");
            closeModal('bidModal');
            syncAllData(session.email); // Sync instantly to deduct tokens visually
            renderTasks(session);
        } else { showToast(result.message || result.data, "error"); }
    } catch (err) { showToast("Network error.", "error"); }
    finally { btn.innerText = "Submit Proposal"; btn.disabled = false; }
};

/**
 * SUBMIT FINAL WORK MODAL LOGIC
 */
window.openSubmitWorkModal = function(subId, title) {
    document.getElementById('submitWorkSubId').value = subId;
    document.getElementById('submitWorkJobTitle').innerText = title;
    document.getElementById('finalWorkContent').value = "";
    document.getElementById('submitWorkModal').style.display = 'flex';
};

window.executeSubmitWork = async function() {
    const subId = document.getElementById('submitWorkSubId').value;
    const content = document.getElementById('finalWorkContent').value.trim();
    const btn = document.getElementById('finalSubmitBtn');
    const session = JSON.parse(localStorage.getItem('huntJob_session'));

    if (!content) return showToast("Please provide the required work or links.", "error");

    btn.innerText = "Sending to Admin..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "submitTaskWork", subId: subId, content: content })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error Response:", text);
            throw new Error("Server Error");
        }
        
        if (result.status === "Success") {
            showToast("Work submitted for review!", "success");
            closeModal('submitWorkModal');
            fetchMyTasks(session.email); // Refresh the task board
        } else {
            showToast(result.message || "Failed to submit.", "error");
        }
    } catch(err) {
        showToast("Network error.", "error");
    } finally {
        btn.innerText = "Submit to Client"; btn.disabled = false;
    }
};

window.fetchMyTasks = async function(email) {
    const list = document.getElementById('appliedTasksList'); 
    if (!list) return;
    list.innerHTML = '<p style="color:var(--text-dim); grid-column: 1 / -1;">Loading your workspace...</p>';
    
    try {
        const res = await fetch(`${SCRIPT_URL}?action=getMyTasks&email=${encodeURIComponent(email)}&t=${Date.now()}`);
        const result = await res.json();
        
        if (result.status === "Success") {
            if(result.data.length === 0) { 
                list.innerHTML = '<p style="color:var(--text-dim); grid-column: 1 / -1;">No active applications yet. Start hunting on the dashboard!</p>'; 
                return; 
            }
            
            list.innerHTML = result.data.reverse().map(task => {
                let actionBtn = "";
                let statusColor = "var(--text-dim)";
                
                if (task.status === "In Progress") {
                    statusColor = "#f59e0b"; // Warning/Yellow
                    actionBtn = `<button class="btn-hunt" style="background: #f59e0b;" onclick="openSubmitWorkModal('${task.subId}', '${task.title.replace(/'/g, "\\'")}')">Submit Work</button>`;
                } else if (task.status === "Under Review") {
                    statusColor = "#3b82f6"; // Blue
                    actionBtn = `<button class="btn-hunt" style="background: transparent; border: 1px solid #3b82f6; color: #3b82f6;" disabled><i data-lucide="loader" size="16"></i> Reviewing</button>`;
                } else if (task.status === "Approved") {
                    statusColor = "#10b981"; // Green
                    actionBtn = `<button class="btn-hunt" style="background: #10b981;" disabled><i data-lucide="check-circle" size="16"></i> Paid</button>`;
                } else if (task.status === "Rejected") {
                    statusColor = "#ef4444"; // Red
                    actionBtn = `<button class="btn-hunt" style="background: transparent; border: 1px solid #ef4444; color: #ef4444;" disabled><i data-lucide="x-circle" size="16"></i> Rejected</button>`;
                }

                return `
                <div class="task-card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div style="flex: 1; padding-right: 10px;">
                            <span class="tier-tag" style="margin-bottom: 8px; display: inline-block;">${task.category || 'Job'}</span>
                            <h3 style="font-size: 1.1rem; margin-bottom: 5px; line-height: 1.2;">${task.title}</h3>
                            <p style="font-size:0.85rem; color:var(--text-dim);">Your Bid: <strong style="color:white;">KES ${parseSafeNumber(task.reward)}</strong></p>
                        </div>
                        <div style="text-align: right;">
                            <span style="display:inline-block; padding:4px 12px; border-radius:20px; font-size:0.7rem; font-weight:700; background:rgba(255,255,255,0.05); color:${statusColor}; border: 1px solid ${statusColor};">${task.status}</span>
                        </div>
                    </div>
                    <div style="margin-top: auto;">
                        ${actionBtn}
                    </div>
                </div>`;
            }).join('');
            if (window.lucide) lucide.createIcons();
        }
    } catch (err) { 
        list.innerHTML = '<p style="color:#ef4444; grid-column: 1 / -1;">Failed to load tasks.</p>'; 
    }
};

/**
 * ==========================================
 * SUPPORT TICKET LOGIC (USER FRONTEND)
 * ==========================================
 */

window.fetchTickets = async function(uid) {
    const list = document.getElementById('ticketList');
    if (!list) return;

    try {
        const res = await fetch(`${SCRIPT_URL}?action=getTickets&uid=${encodeURIComponent(uid)}&t=${Date.now()}`);
        const result = await res.json();
        
        if (result.status === "Success") {
            window.userTickets = result.data;
            renderTickets(window.userTickets);
        }
    } catch (err) {
        list.innerHTML = '<p style="color:#ef4444;">Failed to load tickets.</p>';
    }
};

function renderTickets(tickets) {
    const list = document.getElementById('ticketList');
    if (tickets.length === 0) {
        list.innerHTML = `
            <div class="stat-card" style="text-align:center; padding: 3rem 1rem;">
                <i data-lucide="message-square" size="48" color="#94a3b8" style="opacity:0.5; margin-bottom:1rem;"></i>
                <p style="color:var(--text-dim);">You have no open support tickets.</p>
            </div>
        `;
        if(window.lucide) lucide.createIcons();
        return;
    }

    list.innerHTML = tickets.reverse().map(t => {
        let statusColor = t.status === "Closed" ? "#94a3b8" : (t.status === "Admin Replied" ? "#10b981" : "#f59e0b");
        return `
        <div class="stat-card" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:0.3s; border-left: 4px solid ${statusColor};" onclick="openTicketChat('${t.id}')">
            <div>
                <h4 style="color:white; font-size:1rem; margin-bottom:5px;">${t.subject}</h4>
                <p style="font-size:0.8rem; color:var(--text-dim);">Ticket ID: ${t.id} • ${new Date(t.updated).toLocaleDateString()}</p>
            </div>
            <div style="text-align:right;">
                <span style="font-size:0.75rem; padding:4px 10px; border-radius:12px; background:rgba(255,255,255,0.05); color:${statusColor};">${t.status}</span>
                <i data-lucide="chevron-right" size="18" style="display:block; margin-top:5px; color:var(--text-dim); margin-left:auto;"></i>
            </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

window.openNewTicketModal = () => {
    document.getElementById('ticketSubject').value = "";
    document.getElementById('ticketMessage').value = "";
    document.getElementById('newTicketModal').style.display = 'flex';
};

window.submitNewTicket = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const subject = document.getElementById('ticketSubject').value.trim();
    const msg = document.getElementById('ticketMessage').value.trim();
    const btn = document.getElementById('submitTicketBtn');

    if (!subject || !msg) return showToast("Please fill all fields", "error");

    btn.innerText = "Submitting..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "createTicket", uid: session.uid, subject: subject, message: msg })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error Response:", text);
            throw new Error("Server Error");
        }
        
        if (result.status === "Success") {
            showToast("Ticket opened successfully!", "success");
            closeModal('newTicketModal');
            fetchTickets(session.uid);
        } else {
            showToast(result.message, "error");
        }
    } catch(err) {
        showToast("Network error.", "error");
    } finally {
        btn.innerText = "Submit Ticket"; btn.disabled = false;
    }
};

window.openTicketChat = function(ticketId) {
    const ticket = window.userTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    document.getElementById('activeTicketId').value = ticket.id;
    document.getElementById('chatTicketSubject').innerText = ticket.subject;
    document.getElementById('chatTicketStatus').innerText = ticket.status;
    
    const replyArea = document.getElementById('chatReplyArea');
    const closeBtn = document.getElementById('closeTicketActionBtn');
    
    if (ticket.status === "Closed") {
        replyArea.style.display = 'none';
        closeBtn.style.display = 'none';
    } else {
        replyArea.style.display = 'flex';
        closeBtn.style.display = 'block';
    }

    const box = document.getElementById('chatBox');
    box.innerHTML = ticket.history.map(msg => {
        const isUser = msg.sender === "User";
        const dateStr = new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `
            <div class="chat-bubble ${isUser ? 'chat-user' : 'chat-admin'}">
                ${msg.text}
                <span class="chat-time">${isUser ? 'You' : 'Admin'} • ${dateStr}</span>
            </div>
        `;
    }).join('');

    document.getElementById('ticketChatModal').style.display = 'flex';
    setTimeout(() => { box.scrollTop = box.scrollHeight; }, 100);
};

window.sendTicketReply = async function() {
    const ticketId = document.getElementById('activeTicketId').value;
    const input = document.getElementById('chatReplyInput');
    const msg = input.value.trim();
    const btn = document.getElementById('sendReplyBtn');
    const session = JSON.parse(localStorage.getItem('huntJob_session'));

    if (!msg) return;

    btn.innerHTML = `<i data-lucide="loader" class="spinning"></i>`; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "replyTicket", ticketId: ticketId, message: msg })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error Response:", text);
            throw new Error("Server Error");
        }
        
        if (result.status === "Success") {
            input.value = "";
            await fetchTickets(session.uid); 
            openTicketChat(ticketId); // Re-render chat
        } else {
            showToast("Failed to send.", "error");
        }
    } catch(err) {
        showToast("Network error.", "error");
    } finally {
        btn.innerHTML = `<i data-lucide="send"></i>`; btn.disabled = false;
        if(window.lucide) lucide.createIcons();
    }
};

window.closeActiveTicket = async function() {
    const ticketId = document.getElementById('activeTicketId').value;
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const btn = document.getElementById('closeTicketActionBtn');

    btn.innerText = "Closing..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "closeTicket", ticketId: ticketId })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error Response:", text);
            throw new Error("Server Error");
        }
        if (result.status === "Success") {
            showToast("Ticket resolved.", "success");
            closeModal('ticketChatModal');
            fetchTickets(session.uid);
        }
    } catch(err) {
        showToast("Network error.", "error");
    } finally {
        btn.innerText = "Mark as Resolved"; btn.disabled = false;
    }
};

/* ==========================================
 * PHASE 3 - HELP A FRIEND LOGIC
 * ========================================== */

window.openCreateCoPayModal = function(tierName) {
    document.getElementById('reqTierName').innerText = tierName;
    document.getElementById('reqTierValue').value = tierName;
    document.getElementById('createCoPayModal').style.display = 'flex';
};

window.generateCoPayCode = async function() {
    const tier = document.getElementById('reqTierValue').value;
    const btn = document.getElementById('generateCoPayBtn');
    const session = JSON.parse(localStorage.getItem('huntJob_session'));

    btn.innerText = "Generating..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "createCoPay", uid: session.uid, email: session.email, tier: tier })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error:", text);
            showToast("Server error. Please deploy Code.gs", "error");
            return;
        }
        
        if (result.status === "Success") {
            closeModal('createCoPayModal');
            showToast("Co-Pay Code generated!", "success");
            
            // Open Manage Modal
            document.getElementById('activeCoPayCode').innerText = result.data.copayId;
            document.getElementById('manageCoPayTotal').value = result.data.total;
            document.getElementById('manageCoPayModal').style.display = 'flex';
            
        } else {
            showToast(result.message, "error");
        }
    } catch(err) { showToast("Network Error", "error"); } 
    finally { btn.innerText = "Generate Invite Code"; btn.disabled = false; }
};

window.payHalfMpesa = async function(isSelf) {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const totalCost = parseSafeNumber(document.getElementById('manageCoPayTotal').value);
    const halfAmount = totalCost / 2;
    const code = document.getElementById('activeCoPayCode').innerText;
    
    let targetPhone = session.phone;
    if (!isSelf) {
        targetPhone = document.getElementById('friendPhoneSTK').value.trim();
        if(!targetPhone || targetPhone.length < 10) return showToast("Enter friend's valid M-Pesa number", "error");
    }

    showToast(`Sending STK Push for KES ${halfAmount}...`, "success");

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: "initiatePayment", 
                email: session.email, 
                phone: targetPhone, 
                amount: halfAmount, 
                type: "CoPay", 
                copayCode: code 
            })
        });
        const text = await res.text();
        const result = JSON.parse(text);
        if (result.status === "Success") {
            showToast("STK Push sent successfully!", "success");
        } else {
            showToast(result.message || "Failed to trigger STK.", "error");
        }
    } catch(e) { showToast("Payment service error.", "error"); }
};

window.openEnterCoPayModal = function() {
    document.getElementById('friendCoPayCode').value = "";
    document.getElementById('enterCoPayModal').style.display = 'flex';
};

window.findCoPayRequest = async function() {
    const code = document.getElementById('friendCoPayCode').value.trim();
    const btn = document.getElementById('findCoPayBtn');
    if (!code) return showToast("Enter a valid code", "error");

    btn.innerText = "Searching..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "getCoPay", code: code })
        });
        const text = await res.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch (e) {
            console.error("Backend Error:", text);
            showToast("Server error. Please deploy Code.gs", "error");
            return;
        }
        
        if (result.status === "Success") {
            closeModal('enterCoPayModal');
            const data = result.data;
            
            if (data.status === "Completed") {
                showToast("This request is already fully paid!", "success");
                return;
            }

            const remaining = parseSafeNumber(data.total) - parseSafeNumber(data.paid);
            document.getElementById('fundReqName').innerText = data.reqName;
            document.getElementById('fundReqTier').innerText = data.tier;
            document.getElementById('fundAmountNeeded').innerText = remaining;
            document.getElementById('fundCoPayCodeValue').value = data.code;
            document.getElementById('fundCoPayAmountValue').value = remaining;
            
            document.getElementById('fundCoPayModal').style.display = 'flex';
        } else {
            showToast(result.message, "error");
        }
    } catch(err) { showToast("Network Error", "error"); }
    finally { btn.innerText = "Find Request"; btn.disabled = false; }
};

window.fundWithWallet = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const code = document.getElementById('fundCoPayCodeValue').value;
    const amountStr = document.getElementById('fundCoPayAmountValue').value;
    const btn = document.getElementById('fundWalletBtn');

    // Safe mathematical parsing
    const cleanBal = parseSafeNumber(session.balance);
    const cleanAmt = parseSafeNumber(amountStr);

    if (cleanBal < cleanAmt) return showToast("Insufficient wallet balance.", "error");

    btn.innerText = "Paying..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "fundCoPayWallet", uid: session.uid, code: code, amount: cleanAmt })
        });
        
        const text = await res.text(); 
        let result;
        try {
            result = JSON.parse(text);
        } catch (jsonErr) {
            console.error("Backend Error Response:", text);
            showToast("Backend crash. Please deploy Code.gs as New Version.", "error");
            return;
        }

        if (result.status === "Success") {
            showToast("Successfully paid for your friend!", "success");
            closeModal('fundCoPayModal');
            syncAllData(session.email); // Deduct balance visually
        } else { showToast(result.message, "error"); }
    } catch(e) { showToast("Network Error. Check connection.", "error"); console.error(e); }
    finally { btn.innerHTML = `<i data-lucide="wallet" size="16" style="vertical-align:middle;"></i> Pay from Wallet Balance`; btn.disabled = false; if(window.lucide) lucide.createIcons(); }
};

window.fundWithSTK = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const code = document.getElementById('fundCoPayCodeValue').value;
    const amountStr = document.getElementById('fundCoPayAmountValue').value;
    const phone = document.getElementById('fundMpesaPhone').value.trim();
    
    const cleanAmt = parseSafeNumber(amountStr);

    if (!phone || phone.length < 10) return showToast("Enter a valid phone number", "error");

    showToast(`Sending STK Push for KES ${cleanAmt}...`, "success");

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: "initiatePayment", email: session.email, phone: phone, amount: cleanAmt, 
                type: "CoPay", copayCode: code 
            })
        });
        const text = await res.text();
        const result = JSON.parse(text);
        if (result.status === "Success") {
            showToast("STK Push sent successfully!", "success");
            setTimeout(() => { closeModal('fundCoPayModal'); }, 3000);
        } else { showToast(result.message, "error"); }
    } catch(e) { showToast("Payment service error.", "error"); }
};

window.requestWithdrawal = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const amountInput = document.getElementById('withdrawAmount');
    const phoneInput = document.getElementById('withdrawPhone');

    const amount = parseSafeNumber(amountInput.value);
    const phone = phoneInput.value.trim();

    if (!amount || amount < 500) return showToast("Minimum withdrawal is KES 500", "error");
    if (!phone || phone.length < 10) return showToast("Enter a valid M-Pesa number for payout.", "error");

    showToast("Submitting withdrawal request...", "success");

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "requestWithdrawal", email: session.email, amount: amount, phone: phone })
        });
        const text = await response.text(); 
        const result = JSON.parse(text);
        const payloadMessage = result.data || result.message;

        if (result.status === "Success") {
            showToast(payloadMessage, "success");
            amountInput.value = "";
            await syncAllData(session.email);
            await fetchWithdrawals(session.email);
        } else { showToast(payloadMessage, "error"); }
    } catch (error) { showToast("Withdrawal service unavailable.", "error"); }
};

function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.style.cssText = `position: fixed; bottom: 100px; right: 20px; background: ${type === 'success' ? '#10b981' : (type === 'warning' ? '#f59e0b' : '#ef4444')}; color: white; padding: 12px 24px; border-radius: 12px; z-index: 10000; font-weight: 600; box-shadow: 0 10px 15px rgba(0,0,0,0.3); animation: fadeIn 0.3s ease-out;`;
    toast.innerText = message; document.body.appendChild(toast); setTimeout(() => { toast.remove(); }, 4000);
}

window.copyRef = function() {
    const refLinkElement = document.getElementById('refLinkText');
    if (!refLinkElement) return;
    const refText = refLinkElement.innerText;
    navigator.clipboard.writeText(refText).then(() => { showToast("Referral link copied to clipboard!", "success"); });
};

/* ==========================================
 * MANUAL PAYMENT FALLBACK LOGIC
 * ========================================== */
window.openManualPaymentModal = function(type) {
    let amount = 0, value = "";

    if (type === "Tier") {
        amount = selectedUpgrade.amount;
        value = selectedUpgrade.tier;
        closeModal('paymentModal');
    } else if (type === "Token") {
        amount = selectedToken.amount;
        value = selectedToken.tokens;
        closeModal('tokenModal');
    } else if (type === "CoPay") {
        // Checks if it's the funding modal or the self-pay modal
        const fundInput = document.getElementById('fundCoPayAmountValue');
        amount = fundInput && fundInput.value ? parseSafeNumber(fundInput.value) : parseSafeNumber(document.getElementById('manageCoPayTotal').value) / 2;
        value = document.getElementById('fundCoPayCodeValue').value || document.getElementById('activeCoPayCode').innerText;
        closeModal('fundCoPayModal');
        closeModal('manageCoPayModal');
    }

    document.getElementById('manualPayAmount').innerText = amount;
    document.getElementById('manualPayType').value = type;
    document.getElementById('manualPayValue').value = value;
    document.getElementById('manualMpesaMessage').value = "";
    
    document.getElementById('manualPaymentModal').style.display = 'flex';
};

window.submitManualPayment = async function() {
    const session = JSON.parse(localStorage.getItem('huntJob_session'));
    const type = document.getElementById('manualPayType').value;
    const value = document.getElementById('manualPayValue').value;
    const amount = parseSafeNumber(document.getElementById('manualPayAmount').innerText);
    const message = document.getElementById('manualMpesaMessage').value.trim();
    const btn = document.getElementById('submitManualPayBtn');

    if (!message || message.length < 20) return showToast("Please paste the full M-Pesa SMS message.", "error");

    btn.innerText = "Submitting..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: "submitManualPayment", 
                email: session.email, 
                uid: session.uid,
                type: type, 
                value: value, 
                amount: amount, 
                mpesaMessage: message 
            })
        });
        const result = await res.json();
        if (result.status === "Success") {
            showToast("Payment submitted! Pending Admin approval.", "success");
            closeModal('manualPaymentModal');
        } else {
            showToast(result.message, "error");
        }
    } catch(e) {
        showToast("Network Error.", "error");
    } finally {
        btn.innerText = "Submit for Verification"; btn.disabled = false;
    }
};