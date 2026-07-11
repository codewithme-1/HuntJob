/**
 * HuntJob Admin Panel Logic (Fully Connected)
 */

// IMPORTANT: Replace this with your Google Apps Script Web App URL
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUR9lHgatZbhQOpi18ltUL3ohmmj8F6lya4M3E7CAP-flZ34Ec2VUAVrm-BVVR1AxOww/exec";

let adminKey = localStorage.getItem("hj_admin_key") || "";
let currentUsers = []; 
let currentWithdrawals = [];
let currentSubmissions = []; 
let currentJobs = []; 
let currentTickets = []; 
let currentManualPayments = []; 
let currentAgents = []; // NEW: Stores Agent Data

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Auth State on Load
    if (adminKey) {
        verifySession();
    }

    // 2. Navigation Logic
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.page-view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Check if clicking logout
            if(!item.getAttribute('data-view')) return;

            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            
            const target = item.getAttribute('data-view');
            views.forEach(v => {
                v.classList.toggle('d-none', v.id !== `view-${target}`);
            });

            // Trigger specific data fetch based on tab
            if (target === 'dashboard') loadDashboard();
            if (target === 'jobs') loadJobs();
            if (target === 'submissions') loadSubmissions();
            if (target === 'withdrawals') loadWithdrawals();
            if (target === 'users') loadUsers();
            if (target === 'agents') loadAgents(); 
            if (target === 'tickets') loadTickets(); 
            if (target === 'manual-payments') loadManualPayments();
        });
    });
});

/**
 * --- SECURITY & AUTHENTICATION ---
 */
async function loginAdmin() {
    const input = document.getElementById('adminPasskey').value.trim();
    const btn = document.getElementById('loginBtn');
    
    if (!input) return;
    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        // Send a test ping to the backend to verify the key
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ action: "adminVerify", passkey: input })
        });
        const result = await res.json();

        if (result.status === "Success") {
            adminKey = input;
            localStorage.setItem("hj_admin_key", adminKey);
            document.getElementById('loginOverlay').style.display = 'none';
            showToast("Welcome, Commander.", "success");
            loadDashboard(); // Load initial data
        } else {
            document.getElementById('loginError').style.display = 'block';
        }
    } catch (e) {
        showToast("Connection Error", "danger");
    } finally {
        btn.innerText = "Authenticate";
        btn.disabled = false;
    }
}

function verifySession() {
    // Hide overlay optimistically, if subsequent API calls fail with "Unauthorized", we show it again.
    document.getElementById('loginOverlay').style.display = 'none';
    loadDashboard();
}

function logoutAdmin() {
    localStorage.removeItem("hj_admin_key");
    adminKey = "";
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('adminPasskey').value = "";
    showToast("Logged out securely.", "success");
}

/**
 * --- CORE API WRAPPER ---
 * Every request from the admin panel goes through here so the Passkey is always attached.
 */
async function adminApiRequest(payload) {
    if (!adminKey) {
        logoutAdmin();
        return { status: "Error", message: "No Session" };
    }
    
    payload.passkey = adminKey; // Inject Security Key

    try {
        const res = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        // If backend rejects the key, kick them out
        if (result.status === "Error" && result.message === "Unauthorized") {
            logoutAdmin();
        }
        return result;
    } catch (e) {
        console.error(e);
        return { status: "Error", message: "Network Error" };
    }
}

/**
 * --- DASHBOARD FETCHING ---
 */

async function loadDashboard() {
    const result = await adminApiRequest({ action: "adminGetStats" });
    if (result.status === "Success") {
        const d = result.data;
        document.getElementById('statUsers').innerText = d.totalUsers;
        document.getElementById('statJobs').innerText = d.activeJobs;
        document.getElementById('statReviews').innerText = d.pendingReviews;
        document.getElementById('statPayouts').innerText = "KES " + d.pendingPayoutAmt.toLocaleString();

        const logsBody = document.getElementById('logsTableBody');
        if (d.recentLogs.length > 0) {
            logsBody.innerHTML = d.recentLogs.map(l => {
                const isErr = l.type.includes('ERROR') || l.type.includes('FAIL');
                return `<tr>
                    <td>${l.time}</td>
                    <td><span class="badge ${isErr ? 'danger' : 'success'}">${l.type}</span></td>
                    <td>${l.desc}</td>
                </tr>`;
            }).join('');
        } else {
            logsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-dim);">No logs yet.</td></tr>';
        }
    }
}

/* ============================================================
   WITHDRAWAL MANAGEMENT MODULE
   ============================================================ */

async function loadWithdrawals() {
    const tbody = document.getElementById('withdrawalsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetWithdrawals" });
    if (result.status === "Success") {
        currentWithdrawals = result.data;
        filterWithdrawals(); // Use filter logic to render default view
    }
}

function renderWithdrawalsTable(data) {
    const tbody = document.getElementById('withdrawalsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No requests found matching criteria.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(w => {
        let statusClass = w.status.includes('Pending') ? 'pending' : (w.status.includes('Reject') ? 'danger' : 'success');
        
        let actions = `-`;
        if (w.status.includes('Pending')) {
            actions = `<button class="btn-sm btn-success" onclick="openApproveModal(${w.rowId})">Pay</button>
                       <button class="btn-sm btn-danger" onclick="openRejectModal(${w.rowId}, '${w.email}', ${w.amount})">Reject</button>`;
        }
        
        return `<tr>
            <td style="color:var(--text-dim); font-size:0.85rem;">${new Date(w.date).toLocaleDateString()}<br>${new Date(w.date).toLocaleTimeString()}</td>
            <td><strong>${w.email}</strong></td>
            <td style="font-family:monospace; font-size:1rem;">${w.phone}</td>
            <td style="font-weight:bold; color:var(--success);">KES ${w.amount}</td>
            <td><span class="badge ${statusClass}">${w.status}</span></td>
            <td style="display:flex; gap:5px;">${actions}</td>
        </tr>`;
    }).join('');
}

function filterWithdrawals() {
    const search = document.getElementById('searchWithdrawal').value.toLowerCase();
    const status = document.getElementById('filterWithdrawalStatus').value;
    
    const filtered = currentWithdrawals.filter(w => {
        const matchSearch = w.email.toLowerCase().includes(search) || String(w.phone).includes(search);
        const matchStatus = status === "All" || w.status.includes(status);
        return matchSearch && matchStatus;
    });
    
    renderWithdrawalsTable(filtered);
}

function exportWithdrawalsCSV() {
    const status = document.getElementById('filterWithdrawalStatus').value;
    const search = document.getElementById('searchWithdrawal').value.toLowerCase();
    
    const filtered = currentWithdrawals.filter(w => {
        const matchSearch = w.email.toLowerCase().includes(search) || String(w.phone).includes(search);
        const matchStatus = status === "All" || w.status.includes(status);
        return matchSearch && matchStatus;
    });

    if(filtered.length === 0) {
        showToast("No records to export.", "warning"); return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Date,Time,Email,Phone,Amount,Status\n";
    filtered.forEach(w => {
        let d = new Date(w.date);
        csvContent += `${d.toLocaleDateString()},${d.toLocaleTimeString()},${w.email},${w.phone},${w.amount},${w.status}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HuntJob_Payouts_${status}_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function openApproveModal(rowId) {
    document.getElementById('approveRowId').value = rowId;
    document.getElementById('approveWithdrawalModal').classList.remove('d-none');
}

async function executeApproveWithdrawal() {
    const rowId = document.getElementById('approveRowId').value;
    closeModal('approveWithdrawalModal');
    
    showToast("Approving payout...", "pending");
    const res = await adminApiRequest({ action: "adminApproveWithdrawal", rowId: rowId });
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadWithdrawals(); 
}

function openRejectModal(rowId, email, amount) {
    document.getElementById('rejectRowId').value = rowId;
    document.getElementById('rejectEmail').value = email;
    document.getElementById('rejectAmount').value = amount;
    document.getElementById('rejectWithdrawalModal').classList.remove('d-none');
}

async function executeRejectWithdrawal() {
    const rowId = document.getElementById('rejectRowId').value;
    const email = document.getElementById('rejectEmail').value;
    const amount = document.getElementById('rejectAmount').value;
    
    const reasonBase = document.getElementById('rejectReason').value;
    const reasonOther = document.getElementById('rejectReasonOther').value;
    const finalReason = (reasonBase === 'Other' && reasonOther) ? reasonOther : reasonBase;

    closeModal('rejectWithdrawalModal');
    showToast("Rejecting and refunding user...", "pending");
    
    const res = await adminApiRequest({ 
        action: "adminRejectWithdrawal", 
        rowId: rowId, email: email, amount: Number(amount), reason: finalReason 
    });
    
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadWithdrawals(); 
}

/* ============================================================
   USER MANAGEMENT MODULE
   ============================================================ */

async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    const result = await adminApiRequest({ action: "adminGetUsers" });
    if (result.status === "Success") {
        currentUsers = result.data; 
        renderUsersTable(currentUsers);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    if (users.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim);">No users found.</td></tr>'; 
        return; 
    }
    
    tbody.innerHTML = users.map((u) => {
        let tc = u.tier === 'Pro' ? 'success' : (u.tier === 'Starter' ? 'pending' : 'danger');
        let sc = u.status === 'Active' ? 'success' : 'danger';
        return `<tr>
            <td style="font-size:0.75rem; color:var(--text-dim);">${u.uid}</td>
            <td><strong>${u.name}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${u.email}<br>${u.phone}</span></td>
            <td><span class="badge ${tc}">${u.tier}</span></td>
            <td>${u.tokens}</td>
            <td style="color:var(--success); font-weight:bold;">KES ${parseFloat(u.bal).toLocaleString()}</td>
            <td><span class="badge ${sc}">${u.status}</span></td>
            <td style="display:flex; gap:5px; flex-direction:column;">
                <button class="btn-sm btn-primary" onclick="openEditUserModal('${u.uid}')"><i data-lucide="edit" size="14"></i> Edit</button>
                <button class="btn-sm btn-warning" onclick="viewUserActivity('${u.uid}', '${u.email}')"><i data-lucide="eye" size="14"></i> Activity</button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterUsers() {
    const search = document.getElementById('searchUser').value.toLowerCase();
    const tier = document.getElementById('filterTier').value;
    
    const filtered = currentUsers.filter(u => {
        const matchSearch = u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search) || u.uid.toLowerCase().includes(search) || String(u.phone).includes(search);
        const matchTier = tier === "All" || u.tier === tier;
        return matchSearch && matchTier;
    });
    
    renderUsersTable(filtered);
}

function openEditUserModal(uid) {
    const user = currentUsers.find(u => u.uid === uid);
    if(!user) return;
    
    document.getElementById('editRowId').value = user.rowId;
    document.getElementById('editUserEmail').value = user.email; 
    document.getElementById('editUserDisplay').value = `${user.name} (${user.email})`;
    document.getElementById('editUserTier').value = user.tier;
    document.getElementById('editUserTokens').value = user.tokens;
    document.getElementById('editUserBalance').value = user.bal;
    document.getElementById('editUserVerified').value = user.verified.toString();
    document.getElementById('editUserStatus').value = user.status;
    
    document.getElementById('editUserModal').classList.remove('d-none');
}

function closeModal(id) { 
    document.getElementById(id).classList.add('d-none'); 
}

async function saveUserEdit() {
    const payload = {
        action: "adminEditUser",
        rowId: document.getElementById('editRowId').value,
        tier: document.getElementById('editUserTier').value,
        tokens: Number(document.getElementById('editUserTokens').value),
        balance: Number(document.getElementById('editUserBalance').value),
        verified: document.getElementById('editUserVerified').value === "true",
        status: document.getElementById('editUserStatus').value
    };
    
    showToast("Saving...", "pending");
    closeModal('editUserModal');
    
    const res = await adminApiRequest(payload);
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadUsers(); 
}

function resetUserPassword() {
    closeModal('editUserModal');
    document.getElementById('resetPasswordModal').classList.remove('d-none');
}

async function executePasswordReset() {
    const email = document.getElementById('editUserEmail').value;
    closeModal('resetPasswordModal');
    
    showToast("Sending reset link...", "pending");
    const res = await adminApiRequest({ action: "adminResetPassword", email: email });
    showToast(res.message, res.status === "Success" ? "success" : "danger");
}

async function viewUserActivity(uid, email) {
    document.getElementById('activityTitle').innerText = `Activity: ${email}`;
    const box = document.getElementById('activityContent');
    box.innerHTML = "Fetching records...";
    document.getElementById('userActivityModal').classList.remove('d-none');

    const res = await adminApiRequest({ action: "adminGetUserActivity", uid: uid, email: email });
    
    if(res.status === "Success") {
        const d = res.data;
        box.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h4 style="color:var(--primary);">Job Submissions (${d.subs.length})</h4>
                <div style="font-size:0.85rem; color:var(--text-dim); max-height: 150px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-top:5px;">
                    ${d.subs.length === 0 ? 'No submissions.' : d.subs.map(s => `[${new Date(s.date).toLocaleDateString()}] Job ID: ${s.jobId} | Bid: KES ${s.bid} | Status: <b>${s.status}</b>`).join('<br>')}
                </div>
            </div>
            <div style="margin-bottom: 20px;">
                <h4 style="color:var(--success);">Withdrawals (${d.withs.length})</h4>
                <div style="font-size:0.85rem; color:var(--text-dim); max-height: 150px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-top:5px;">
                    ${d.withs.length === 0 ? 'No withdrawals.' : d.withs.map(w => `[${new Date(w.date).toLocaleDateString()}] KES ${w.amount} | Status: <b>${w.status}</b>`).join('<br>')}
                </div>
            </div>
            <div>
                <h4 style="color:var(--warning);">Referrals (${d.refs.length})</h4>
                <div style="font-size:0.85rem; color:var(--text-dim); max-height: 150px; overflow-y:auto; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px; margin-top:5px;">
                    ${d.refs.length === 0 ? 'No referrals.' : d.refs.map(r => `[${new Date(r.date).toLocaleDateString()}] User: ${r.name} | Earned: KES ${r.earned}`).join('<br>')}
                </div>
            </div>
        `;
    } else { 
        box.innerHTML = "Failed to load activity. " + res.message; 
    }
}

/* ============================================================
   SUBMISSIONS & REVIEW MODULE
   ============================================================ */

async function loadSubmissions() {
    const tbody = document.getElementById('subsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetSubmissions" });
    if (result.status === "Success") {
        currentSubmissions = result.data;
        filterSubmissions(); // Render default view
    }
}

function renderSubmissionsTable(data) {
    const tbody = document.getElementById('subsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dim);">No submissions found.</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => {
        let statusClass = (s.status === 'Under Review' || s.status === 'Pending Proposal') ? 'warning' : (s.status === 'Approved' ? 'success' : 'danger');
        
        let actionBtn = "";
        if (s.status === 'Pending Proposal') {
            actionBtn = `<button class="btn-sm btn-primary" onclick="openReviewModal('${s.subId}', 'Proposal')"><i data-lucide="eye" size="14"></i> View Proposal</button>`;
        } else if (s.status === 'Under Review') {
            actionBtn = `<button class="btn-sm btn-primary" onclick="openReviewModal('${s.subId}', 'Final')"><i data-lucide="check-square" size="14"></i> Review Work</button>`;
        } else if (s.status === 'In Progress') {
            statusClass = 'pending';
            actionBtn = `<button class="btn-sm" style="background:transparent; border:1px solid var(--border); color:var(--warning);" disabled>Working</button>`;
        } else {
            actionBtn = `<button class="btn-sm" style="background:var(--card); border:1px solid var(--border);" disabled>Processed</button>`;
        }

        return `<tr>
            <td style="color:var(--text-dim); font-size:0.85rem;">${new Date(s.date).toLocaleDateString()}</td>
            <td><strong>${s.userName}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${s.userEmail}</span></td>
            <td><strong>${s.jobTitle}</strong><br><span style="color:var(--success); font-weight:bold;">KES ${s.reward}</span></td>
            <td><span class="badge ${statusClass}">${s.status}</span></td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterSubmissions() {
    const search = document.getElementById('searchSubmission').value.toLowerCase();
    const status = document.getElementById('filterSubmissionStatus').value;

    const filtered = currentSubmissions.filter(s => {
        const matchSearch = s.userName.toLowerCase().includes(search) || s.userEmail.toLowerCase().includes(search) || s.jobTitle.toLowerCase().includes(search);
        const matchStatus = status === "All" || s.status === status;
        return matchSearch && matchStatus;
    });

    renderSubmissionsTable(filtered);
}

function openReviewModal(subId, type) {
    const sub = currentSubmissions.find(s => s.subId === subId);
    if (!sub) return;

    document.getElementById('reviewRowId').value = sub.rowId;
    document.getElementById('reviewUid').value = sub.uid;
    document.getElementById('reviewReward').value = sub.reward;
    document.getElementById('reviewType').value = type; // "Proposal" or "Final"

    document.getElementById('reviewUserDisplay').innerText = `${sub.userName} (${sub.userEmail})`;
    document.getElementById('reviewRewardDisplay').innerText = `KES ${sub.reward}`;
    document.getElementById('reviewJobTitle').value = sub.jobTitle;
    document.getElementById('reviewProposal').value = sub.proposal || "No proposal provided.";
    document.getElementById('reviewContent').value = sub.content || "No final work submitted.";
    
    // Hide reject reason box initially
    document.getElementById('rejectReasonContainer').style.display = 'none';
    document.getElementById('reviewRejectReason').value = "";

    // Change button text based on what we are reviewing
    const approveBtn = document.getElementById('reviewApproveBtn');
    if (type === "Proposal") {
        approveBtn.innerHTML = `<i data-lucide="check-circle" size="18"></i> Approve Proposal`;
    } else {
        approveBtn.innerHTML = `<i data-lucide="check-circle" size="18"></i> Approve & Pay`;
    }

    document.getElementById('reviewSubmissionModal').classList.remove('d-none');
    lucide.createIcons();
}

function showRejectReasonInput() {
    document.getElementById('rejectReasonContainer').style.display = 'block';
    showToast("Please enter a reason before rejecting.", "warning");
}

async function executeApproveSubmission() {
    const rowId = document.getElementById('reviewRowId').value;
    const uid = document.getElementById('reviewUid').value;
    const reward = document.getElementById('reviewReward').value;
    const type = document.getElementById('reviewType').value;

    closeModal('reviewSubmissionModal');
    
    const decision = type === "Proposal" ? "In Progress" : "Approved";
    showToast(type === "Proposal" ? "Approving proposal..." : "Approving & Disbursing KES...", "pending");

    const res = await adminApiRequest({ 
        action: "adminProcessSubmission", 
        rowId: rowId, uid: uid, decision: decision, reward: Number(reward), reason: ""
    });

    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadSubmissions();
}

async function executeRejectSubmission() {
    const reasonContainer = document.getElementById('rejectReasonContainer');
    const reasonInput = document.getElementById('reviewRejectReason');

    // If reason box is hidden, show it and stop execution
    if (reasonContainer.style.display === 'none' || reasonContainer.style.display === '') {
        showRejectReasonInput();
        return;
    }

    const reason = reasonInput.value.trim();
    if (!reason || reason.length < 5) {
        showToast("Please provide a valid reason for rejection.", "danger");
        return;
    }

    const rowId = document.getElementById('reviewRowId').value;
    const uid = document.getElementById('reviewUid').value;

    closeModal('reviewSubmissionModal');
    showToast("Rejecting submission...", "pending");

    const res = await adminApiRequest({ 
        action: "adminProcessSubmission", 
        rowId: rowId, uid: uid, decision: "Rejected", reward: 0, reason: reason
    });

    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadSubmissions();
}

/* ============================================================
   JOB MANAGEMENT MODULE
   ============================================================ */

async function loadJobs() {
    const tbody = document.getElementById('jobsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetJobs" });
    if (result.status === "Success") {
        currentJobs = result.data;
        filterJobs(); 
    }
}

function renderJobsTable(data) {
    const tbody = document.getElementById('jobsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim);">No jobs found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(j => {
        let sc = j.status === 'Active' ? 'success' : (j.status === 'Draft' ? 'warning' : 'danger');
        return `<tr>
            <td style="font-size:0.8rem; color:var(--text-dim);">${j.id}</td>
            <td><strong>${j.title}</strong></td>
            <td>${j.cat}</td>
            <td><span class="badge">${j.tier}</span></td>
            <td style="color:var(--success); font-weight:bold;">KES ${j.reward}</td>
            <td><span class="badge ${sc}">${j.status}</span></td>
            <td>
                <button class="btn-sm btn-primary" onclick="openEditJobModal('${j.id}')"><i data-lucide="edit" size="14"></i> Edit</button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterJobs() {
    const search = document.getElementById('searchJob').value.toLowerCase();
    const status = document.getElementById('filterJobStatus').value;
    
    const filtered = currentJobs.filter(j => {
        const matchSearch = j.title.toLowerCase().includes(search) || j.id.toLowerCase().includes(search);
        const matchStatus = status === "All" || j.status === status;
        return matchSearch && matchStatus;
    });
    
    renderJobsTable(filtered);
}

function openPostJobModal() {
    document.getElementById('jobRowId').value = "";
    document.getElementById('jobTitle').value = "";
    document.getElementById('jobDesc').value = "";
    document.getElementById('jobReward').value = "";
    document.getElementById('jobTokens').value = "2";
    document.getElementById('jobStatus').value = "Draft";
    
    // Uncheck by default
    if(document.getElementById('jobSendAlert')) {
        document.getElementById('jobSendAlert').checked = false;
    }

    document.getElementById('jobModalTitle').innerText = "Post New Task";
    document.getElementById('jobModal').classList.remove('d-none');
}

function openEditJobModal(jobId) {
    const job = currentJobs.find(j => j.id === jobId);
    if (!job) return;
    
    document.getElementById('jobRowId').value = job.rowId;
    document.getElementById('jobTitle').value = job.title;
    document.getElementById('jobCategory').value = job.cat;
    document.getElementById('jobTier').value = job.tier;
    document.getElementById('jobReward').value = job.reward;
    document.getElementById('jobTokens').value = job.tokens;
    document.getElementById('jobDesc').value = job.desc;
    document.getElementById('jobStatus').value = job.status;

    // Uncheck by default
    if(document.getElementById('jobSendAlert')) {
        document.getElementById('jobSendAlert').checked = false;
    }
    
    document.getElementById('jobModalTitle').innerText = "Edit Task";
    document.getElementById('jobModal').classList.remove('d-none');
}

async function saveJob() {
    let sendAlertVal = false;
    const alertCheckbox = document.getElementById('jobSendAlert');
    if (alertCheckbox) sendAlertVal = alertCheckbox.checked;

    const payload = {
        action: "adminSaveJob",
        rowId: document.getElementById('jobRowId').value, 
        title: document.getElementById('jobTitle').value,
        cat: document.getElementById('jobCategory').value,
        tier: document.getElementById('jobTier').value,
        reward: Number(document.getElementById('jobReward').value),
        tokens: Number(document.getElementById('jobTokens').value),
        desc: document.getElementById('jobDesc').value,
        status: document.getElementById('jobStatus').value,
        sendAlert: sendAlertVal // Add the boolean
    };

    if(!payload.title || !payload.reward) { showToast("Title and Reward are required", "danger"); return; }

    showToast(sendAlertVal ? "Saving & Sending Alerts..." : "Saving task...", "pending");
    closeModal('jobModal');
    
    const res = await adminApiRequest(payload);
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadJobs();
}

/* ============================================================
   TICKET MANAGEMENT MODULE
   ============================================================ */

async function loadTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetTickets" });
    if (result.status === "Success") {
        currentTickets = result.data;
        filterTickets(); 
    }
}

function renderTicketsTable(data) {
    const tbody = document.getElementById('ticketsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No tickets found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(t => {
        let sc = t.status === 'Closed' ? 'danger' : (t.status === 'Admin Replied' ? 'success' : 'warning');
        return `<tr>
            <td style="font-size:0.8rem; color:var(--text-dim);">${t.id}</td>
            <td><strong>${t.name}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${t.email}</span></td>
            <td>${t.subject}</td>
            <td><span class="badge ${sc}">${t.status}</span></td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${new Date(t.updated).toLocaleDateString()}</td>
            <td>
                <button class="btn-sm btn-primary" onclick="openAdminTicketChat('${t.id}')"><i data-lucide="message-square" size="14"></i> Reply</button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterTickets() {
    const search = document.getElementById('searchTicket').value.toLowerCase();
    const status = document.getElementById('filterTicketStatus').value;
    
    const filtered = currentTickets.filter(t => {
        const matchSearch = t.subject.toLowerCase().includes(search) || t.id.toLowerCase().includes(search) || t.email.toLowerCase().includes(search) || t.name.toLowerCase().includes(search);
        const matchStatus = status === "All" || t.status === status;
        return matchSearch && matchStatus;
    });
    
    renderTicketsTable(filtered);
}

function openAdminTicketChat(ticketId) {
    const ticket = currentTickets.find(t => t.id === ticketId);
    if (!ticket) return;

    document.getElementById('adminChatTicketId').value = ticket.id;
    document.getElementById('adminChatSubject').innerText = ticket.subject;
    document.getElementById('adminChatUser').innerText = `${ticket.name} (${ticket.email})`;
    
    const replyArea = document.getElementById('adminChatReplyArea');
    const closeBtn = document.getElementById('adminCloseTicketBtn');
    
    if (ticket.status === "Closed") {
        replyArea.style.display = 'none';
        closeBtn.style.display = 'none';
    } else {
        replyArea.style.display = 'flex';
        closeBtn.style.display = 'block';
    }

    const box = document.getElementById('adminChatBox');
    box.innerHTML = ticket.history.map(msg => {
        const isAdmin = msg.sender === "Admin";
        const dateStr = new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        return `
            <div class="chat-bubble ${isAdmin ? 'chat-admin' : 'chat-user'}">
                ${msg.text}
                <span class="chat-time">${isAdmin ? 'You' : 'User'} • ${dateStr}</span>
            </div>
        `;
    }).join('');

    document.getElementById('adminChatModal').classList.remove('d-none');
    setTimeout(() => { box.scrollTop = box.scrollHeight; }, 100);
}

async function adminSendTicketReply() {
    const ticketId = document.getElementById('adminChatTicketId').value;
    const input = document.getElementById('adminChatInput');
    const msg = input.value.trim();
    const btn = document.getElementById('adminSendReplyBtn');

    if (!msg) return;

    btn.innerHTML = `<i data-lucide="loader" class="spinning"></i>`; btn.disabled = true;

    const res = await adminApiRequest({ action: "adminReplyTicket", ticketId: ticketId, message: msg });
    
    if (res.status === "Success") {
        input.value = "";
        await loadTickets(); 
        openAdminTicketChat(ticketId); // Re-render chat
    } else {
        showToast(res.message || "Failed to send.", "danger");
    }
    
    btn.innerHTML = `<i data-lucide="send" size="16"></i>`; btn.disabled = false;
    lucide.createIcons();
}

async function adminCloseActiveTicket() {
    const ticketId = document.getElementById('adminChatTicketId').value;
    const btn = document.getElementById('adminCloseTicketBtn');

    btn.innerText = "Closing..."; btn.disabled = true;

    const res = await adminApiRequest({ action: "adminCloseTicket", ticketId: ticketId });
    
    if (res.status === "Success") {
        showToast("Ticket closed.", "success");
        closeModal('adminChatModal');
        loadTickets();
    } else {
        showToast(res.message, "danger");
    }
    btn.innerText = "Force Close Ticket"; btn.disabled = false;
}

/* ============================================================
   MANUAL PAYMENTS MODULE
   ============================================================ */

async function loadManualPayments() {
    const tbody = document.getElementById('manualPaymentsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetManualPayments" });
    if (result.status === "Success") {
        currentManualPayments = result.data;
        filterManualPayments(); 
    }
}

function renderManualPaymentsTable(data) {
    const tbody = document.getElementById('manualPaymentsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-dim);">No manual payments found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(p => {
        let statusClass = p.status === 'Pending' ? 'warning' : (p.status === 'Approved' ? 'success' : 'danger');
        
        let actionBtn = p.status === 'Pending' 
            ? `<button class="btn-sm btn-primary" onclick="openVerifyManualModal(${p.rowId})"><i data-lucide="eye" size="14"></i> Verify</button>`
            : `<button class="btn-sm" style="background:var(--card); border:1px solid var(--border);" disabled>Processed</button>`;

        return `<tr>
            <td style="color:var(--text-dim); font-size:0.85rem;">${new Date(p.date).toLocaleDateString()}</td>
            <td><strong>${p.email}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${p.uid}</span></td>
            <td><strong style="color:var(--primary);">${p.type}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${p.value}</span></td>
            <td style="color:var(--success); font-weight:bold;">KES ${p.amount}</td>
            <td><span class="badge ${statusClass}">${p.status}</span></td>
            <td>${actionBtn}</td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterManualPayments() {
    const search = document.getElementById('searchManualPayment').value.toLowerCase();
    const status = document.getElementById('filterManualPaymentStatus').value;
    
    const filtered = currentManualPayments.filter(p => {
        const matchSearch = p.email.toLowerCase().includes(search) || p.uid.toLowerCase().includes(search) || p.message.toLowerCase().includes(search);
        const matchStatus = status === "All" || p.status === status;
        return matchSearch && matchStatus;
    });
    
    renderManualPaymentsTable(filtered);
}

function openVerifyManualModal(rowId) {
    const payment = currentManualPayments.find(p => p.rowId === rowId);
    if (!payment) return;

    document.getElementById('verifyManualRowId').value = payment.rowId;
    document.getElementById('verifyManualUser').innerText = `${payment.email} (${payment.uid})`;
    document.getElementById('verifyManualDetails').innerText = `${payment.type} - ${payment.value} (KES ${payment.amount})`;
    document.getElementById('verifyManualMessage').value = payment.message;

    document.getElementById('verifyManualPaymentModal').classList.remove('d-none');
}

async function executeApproveManualPayment() {
    const rowId = document.getElementById('verifyManualRowId').value;
    closeModal('verifyManualPaymentModal');
    
    showToast("Approving payment and fulfilling order...", "pending");
    const res = await adminApiRequest({ action: "adminApproveManualPayment", rowId: rowId });
    
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadManualPayments();
}

async function executeRejectManualPayment() {
    const rowId = document.getElementById('verifyManualRowId').value;
    closeModal('verifyManualPaymentModal');
    
    showToast("Rejecting payment...", "pending");
    const res = await adminApiRequest({ action: "adminRejectManualPayment", rowId: rowId });
    
    showToast(res.message, res.status === "Success" ? "success" : "danger");
    if(res.status === "Success") loadManualPayments();
}

/* ============================================================
   AGENT / PARTNER MANAGEMENT MODULE
   ============================================================ */

async function loadAgents() {
    const tbody = document.getElementById('agentsTableBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Loading Agents...</td></tr>';
    
    const result = await adminApiRequest({ action: "adminGetAgents" });
    if (result.status === "Success") {
        currentAgents = result.data;
        filterAgents(); 
    } else {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger);">${result.message}</td></tr>`;
    }
}

function renderAgentsTable(data) {
    const tbody = document.getElementById('agentsTableBody');
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:var(--text-dim);">No agents found.</td></tr>';
        return;
    }
    
    tbody.innerHTML = data.map(a => {
        let tc = a.tier === 'Gold' ? 'success' : (a.tier === 'Silver' ? 'primary' : 'warning');
        
        return `<tr>
            <td style="font-size:0.8rem; color:var(--text-dim); font-family:monospace;">${a.agentId}</td>
            <td><strong>${a.name}</strong><br><span style="font-size:0.8rem; color:var(--text-dim);">${a.email}<br>${a.phone}</span></td>
            <td><span class="badge ${tc}">${a.tier}</span></td>
            <td style="text-align:center; font-weight:bold;">${a.signups}</td>
            <td style="text-align:center; font-weight:bold; color:var(--primary);">${a.conversions}</td>
            <td style="color:var(--success); font-weight:bold;">KES ${parseFloat(a.balance).toLocaleString()}</td>
            <td style="color:var(--text-main); font-weight:bold;">KES ${parseFloat(a.totalEarned).toLocaleString()}</td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

function filterAgents() {
    const search = document.getElementById('searchAgent').value.toLowerCase();
    const tier = document.getElementById('filterAgentTier').value;
    
    const filtered = currentAgents.filter(a => {
        const matchSearch = a.name.toLowerCase().includes(search) || a.email.toLowerCase().includes(search) || a.agentId.toLowerCase().includes(search);
        const matchTier = tier === "All" || a.tier === tier;
        return matchSearch && matchTier;
    });
    
    renderAgentsTable(filtered);
}

/* ============================================================
   NEW: EMAIL BROADCAST MODULE
   ============================================================ */

async function sendBroadcast() {
    const target = document.getElementById('broadcastTarget').value;
    const subject = document.getElementById('broadcastSubject').value.trim();
    const message = document.getElementById('broadcastMessage').value.trim();
    const btn = document.getElementById('broadcastBtn');

    if (!subject || !message) {
        showToast("Please fill in both the subject and message.", "danger");
        return;
    }

    if (!confirm(`Are you sure you want to send this email to: ${target}?`)) return;

    btn.innerHTML = `<i data-lucide="loader" class="spinning"></i> Sending...`;
    btn.disabled = true;

    showToast("Preparing and batching emails...", "pending");

    const payload = {
        action: "adminSendBroadcast",
        target: target,
        subject: subject,
        message: message
    };

    const res = await adminApiRequest(payload);
    
    if (res.status === "Success") {
        showToast(`Broadcast sent successfully to ${res.data.sentCount} users!`, "success");
        document.getElementById('broadcastSubject').value = "";
        document.getElementById('broadcastMessage').value = "";
    } else {
        showToast(res.message || "Failed to send broadcast.", "danger");
    }

    btn.innerHTML = `<i data-lucide="send" size="18"></i> Send Broadcast`;
    btn.disabled = false;
    lucide.createIcons();
}

window.refreshData = function() {
    const activeTab = document.querySelector('.nav-item.active').getAttribute('data-view');
    if (activeTab === 'dashboard') loadDashboard();
    if (activeTab === 'jobs') loadJobs();
    if (activeTab === 'submissions') loadSubmissions();
    if (activeTab === 'withdrawals') loadWithdrawals();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'agents') loadAgents();
    if (activeTab === 'tickets') loadTickets();
    if (activeTab === 'manual-payments') loadManualPayments();
    showToast("Data refreshed.", "success");
};

/**
 * --- UI UTILITIES ---
 */
function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast`;
    toast.style.background = type === 'success' ? '#10b981' : (type === 'warning' || type === 'pending' ? '#f59e0b' : '#ef4444');
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3000);
}

async function triggerResetCycle() {
    const btn = document.getElementById('resetCycleBtn');
    
    // Disable and show loading state immediately (No pop-up)
    btn.disabled = true;
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="spin" size="16"></i> Resetting...`;
    if(window.lucide) lucide.createIcons();

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: "adminResetCycle",
                passkey: localStorage.getItem('admin_passkey') // Using stored passkey
            })
        });
        const result = await response.json();

        if (result.status === "Success") {
            btn.style.background = "var(--success)";
            btn.innerHTML = `<i data-lucide="check" size="16"></i> Cycle Reset!`;
            
            // Auto-refresh the page after 1.5 seconds so you see the "Active" status
            setTimeout(() => {
                location.reload();
            }, 1500);
            
        } else {
            btn.style.background = "var(--danger)";
            btn.innerHTML = `Error: ${result.message}`;
            setTimeout(() => {
                btn.disabled = false;
                btn.style.background = "";
                btn.innerHTML = originalContent;
                if(window.lucide) lucide.createIcons();
            }, 3000);
        }
    } catch (err) {
        btn.style.background = "var(--danger)";
        btn.innerHTML = "Server Timeout";
        console.error("Reset Failed:", err);
        setTimeout(() => {
            btn.disabled = false;
            btn.style.background = "";
            btn.innerHTML = originalContent;
            if(window.lucide) lucide.createIcons();
        }, 3000);
    }
}
