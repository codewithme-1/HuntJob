/**
 * HuntJob - Partner / Agent Portal Logic
 * Analytics, CRM, and Gamified Affiliate Engine
 */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUR9lHgatZbhQOpi18ltUL3ohmmj8F6lya4M3E7CAP-flZ34Ec2VUAVrm-BVVR1AxOww/exec";

let currentAgent = null;
let revenueChartInstance = null;
let funnelChartInstance = null;

// Helper to safely parse currency strings
function parseSafeNumber(val) {
    if (val === null || val === undefined) return 0;
    const cleaned = String(val).replace(/[^0-9.-]+/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Session on Load
    const sessionData = localStorage.getItem('huntJob_agent_session');
    if (sessionData) {
        try {
            currentAgent = JSON.parse(sessionData);
            if (currentAgent && currentAgent.agentId) {
                document.getElementById('authOverlay').style.display = 'none';
                fetchAgentData(false);
            }
        } catch (e) {
            localStorage.removeItem('huntJob_agent_session');
        }
    }
});

/**
 * --- AUTHENTICATION ---
 */
async function registerAgent(e) {
    e.preventDefault();
    const btn = document.getElementById('regBtn');
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const pass = document.getElementById('regPass').value;

    btn.innerText = "Creating Account..."; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "registerAgent", name: name, email: email, phone: phone, password: pass })
        });
        const result = await res.json();

        if (result.status === "Success") {
            showToast(result.message);
            switchAuth('login');
            document.getElementById('loginEmail').value = email;
            document.getElementById('agentRegForm').reset();
        } else {
            showToast(result.message, true);
        }
    } catch (err) {
        showToast("Network Error", true);
    } finally {
        btn.innerText = "Create Partner Account"; btn.disabled = false;
    }
}

async function loginAgent(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;

    btn.innerHTML = `Authenticating...`; btn.disabled = true;

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "loginAgent", email: email, password: pass })
        });
        const result = await res.json();

        if (result.status === "Success") {
            currentAgent = result.data;
            localStorage.setItem('huntJob_agent_session', JSON.stringify(currentAgent));
            document.getElementById('authOverlay').style.display = 'none';
            showToast("Welcome to the Partner Portal!");
            fetchAgentData(false);
        } else {
            showToast(result.message, true);
        }
    } catch (err) {
        showToast("Network Error", true);
    } finally {
        btn.innerHTML = `Access Dashboard <i data-lucide="arrow-right" size="18"></i>`; btn.disabled = false;
        lucide.createIcons();
    }
}

window.logout = function() {
    localStorage.removeItem('huntJob_agent_session');
    currentAgent = null;
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('agentLoginForm').reset();
    showToast("Logged out successfully.");
};

/**
 * --- DASHBOARD & DATA SYNC ---
 */
window.fetchAgentData = async function(isManualRefresh = false) {
    if (!currentAgent) return;

    if (isManualRefresh) showToast("Syncing database...");

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "getAgentStats", agentId: currentAgent.agentId })
        });
        const result = await res.json();

        if (result.status === "Success") {
            // Update local session storage with fresh data
            currentAgent = { ...currentAgent, ...result.data.stats };
            localStorage.setItem('huntJob_agent_session', JSON.stringify(currentAgent));
            
            updateDashboardUI(result.data.stats, result.data.leads);
            if(isManualRefresh) showToast("Sync Complete!");
        }
    } catch (e) {
        console.error(e);
        if(isManualRefresh) showToast("Sync Failed. Check connection.", true);
    }
};

function updateDashboardUI(stats, leads) {
    // 1. Base Info
    document.getElementById('agentNameDisplay').innerText = stats.name.split(" ")[0];
    document.getElementById('setAgentId').value = stats.agentId;
    document.getElementById('setAgentName').value = stats.name;
    document.getElementById('setAgentEmail').value = currentAgent.email;

    // 2. Metrics
    document.getElementById('statSignups').innerText = stats.signups;
    document.getElementById('statConversions').innerText = stats.conversions;
    document.getElementById('statTotalEarned').innerText = parseSafeNumber(stats.totalEarned).toLocaleString();
    document.getElementById('walletBalDisplay').innerText = parseSafeNumber(stats.balance).toLocaleString();
    
    // Conversion Rate Math
    let rate = 0;
    if (stats.signups > 0) rate = ((stats.conversions / stats.signups) * 100).toFixed(1);
    document.getElementById('statRate').innerText = rate;

    // 3. Gamification (Tier Math)
    let tierName = "Bronze";
    let commission = "15%";
    let target = 11;
    let progress = 0;

    if (stats.conversions >= 50) {
        tierName = "Gold"; commission = "25%"; target = stats.conversions; progress = 100;
        document.getElementById('nextTierTarget').innerText = "Max Tier Reached!";
    } else if (stats.conversions >= 11) {
        tierName = "Silver"; commission = "20%"; target = 50;
        progress = (stats.conversions / target) * 100;
        document.getElementById('nextTierTarget').innerText = `${50 - stats.conversions} Sales for Gold (25%)`;
    } else {
        tierName = "Bronze"; commission = "15%"; target = 11;
        progress = (stats.conversions / target) * 100;
        document.getElementById('nextTierTarget').innerText = `${11 - stats.conversions} Sales for Silver (20%)`;
    }

    document.getElementById('tierNameDisplay').innerText = tierName;
    document.getElementById('tierCommissionDisplay').innerText = commission;
    document.getElementById('currentSalesProgress').innerText = `${stats.conversions} Upgrades`;
    
    setTimeout(() => {
        document.getElementById('tierProgressFill').style.width = `${progress}%`;
    }, 500); // Slight delay for smooth animation on load

    // 4. Marketing Links (CHANGED from ?agent= to ?ref=)
    const affiliateLink = `https://www.huntjobs.co.ke/?ref=${stats.agentId}`;
    document.getElementById('agentLinkDisplay').innerText = affiliateLink;
    window.currentAffiliateLink = affiliateLink;

    // 5. Build CRM Table
    renderLeads(leads);

    // 6. Draw Charts
    renderCharts(stats);
}

function renderLeads(leads) {
    const tbody = document.getElementById('leadsTableBody');
    document.getElementById('crmCount').innerText = leads.length;

    if (leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-dim);">No leads generated yet. Share your link!</td></tr>';
        return;
    }

    tbody.innerHTML = leads.map(lead => {
        let badgeClass = lead.tier === 'Pro' ? 'badge-pro' : (lead.tier === 'Starter' ? 'badge-starter' : 'badge-unpaid');
        return `
            <tr>
                <td style="color: var(--text-dim);">${new Date(lead.date).toLocaleDateString()}</td>
                <td style="font-weight: 600; letter-spacing: 0.5px;">${lead.email}</td>
                <td><span class="badge ${badgeClass}">${lead.tier}</span></td>
            </tr>
        `;
    }).join('');
}

/**
 * --- CHART.JS INTEGRATION ---
 */
function renderCharts(stats) {
    // FUNNEL CHART (Doughnut)
    const funnelCtx = document.getElementById('funnelChart');
    if (funnelChartInstance) funnelChartInstance.destroy();
    
    let unpaid = stats.signups - stats.conversions;
    if (unpaid < 0) unpaid = 0;

    // If completely empty, show placeholder gray ring
    const hasData = stats.signups > 0;
    
    funnelChartInstance = new Chart(funnelCtx, {
        type: 'doughnut',
        data: {
            labels: ['Unpaid Leads', 'Paid Upgrades'],
            datasets: [{
                data: hasData ? [unpaid, stats.conversions] : [1, 0],
                backgroundColor: hasData ? ['#334155', '#10b981'] : ['#1e293b', '#1e293b'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { family: "'Plus Jakarta Sans', sans-serif" } } }
            }
        }
    });

    // REVENUE CHART (Line)
    // Simulating a 7-day growth curve ending in their total earned to make the dashboard look alive
    const revCtx = document.getElementById('revenueChart');
    if (revenueChartInstance) revenueChartInstance.destroy();

    const earned = parseSafeNumber(stats.totalEarned);
    const mockData = [
        earned * 0.1, earned * 0.25, earned * 0.3, 
        earned * 0.5, earned * 0.7, earned * 0.9, earned
    ];

    revenueChartInstance = new Chart(revCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Cumulative Commission (KES)',
                data: hasData ? mockData : [0,0,0,0,0,0,0],
                borderColor: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                borderWidth: 3,
                tension: 0.4, // Smooth curves
                fill: true,
                pointBackgroundColor: '#0f172a',
                pointBorderColor: '#f59e0b',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

/**
 * --- MARKETING TOOLKIT ---
 */
window.copyAgentLink = function() {
    if (!window.currentAffiliateLink) return showToast("Syncing link...", true);
    navigator.clipboard.writeText(window.currentAffiliateLink).then(() => {
        showToast("Affiliate Link Copied!");
    });
};

window.copySwipe = function(elementId) {
    if (!window.currentAffiliateLink) return showToast("Please wait for link to load.", true);
    
    let text = document.getElementById(elementId).innerText;
    // Replace the [LINK] placeholder with the actual agent link
    text = text.replace('[LINK]', window.currentAffiliateLink);
    
    navigator.clipboard.writeText(text).then(() => {
        showToast("Marketing script copied! Go paste it.");
    });
};

/**
 * --- WITHDRAWAL LOGIC ---
 */
window.requestWithdrawal = async function() {
    if (!currentAgent) return;
    
    const amountInput = document.getElementById('withdrawAmount');
    const phoneInput = document.getElementById('withdrawPhone');
    const amount = parseSafeNumber(amountInput.value);
    const phone = phoneInput.value.trim();

    if (!amount || amount < 500) return showToast("Minimum withdrawal is KES 500", true);
    if (!phone || phone.length < 10) return showToast("Enter a valid M-Pesa number.", true);
    if (amount > parseSafeNumber(currentAgent.balance)) return showToast("Insufficient balance.", true);

    showToast("Submitting request...");

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: "agentWithdrawal", // Calls new backend endpoint
                agentId: currentAgent.agentId, 
                amount: amount, 
                phone: phone 
            })
        });
        const result = await response.json();

        if (result.status === "Success") {
            showToast("Payout requested successfully!");
            amountInput.value = "";
            fetchAgentData(false); // Sync to drop balance instantly
        } else { 
            showToast(result.message || "Failed to process.", true); 
        }
    } catch (error) { 
        showToast("Service unavailable.", true); 
    }
};