// --- CONFIGURATION ---
const SUPABASE_URL = 'https://xvdrfkppeonjpxhmboch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZHJma3BwZW9uanB4aG1ib2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Mzc0NzEsImV4cCI6MjA4MzIxMzQ3MX0.g8yRmeYdttI2Wqj6eu0rap_wOFsM-vJTHlY3DWSgZCU';

// Supabase Client Initialize
// Dhyan de: HTML me script tag hona zaroori hai tabhi window.supabase milega
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentTimer = null;
window.userRate = 0;

// ==========================================
// 1. LOGIN & REGISTER
// ==========================================

window.toggleForm = (form) => {
    document.getElementById('login-box').style.display = (form === 'login') ? 'block' : 'none';
    document.getElementById('reg-box').style.display = (form === 'register') ? 'block' : 'none';
    if(form === 'register') window.fetchAdminSettings();
};

window.handleUserLogin = async function() {
    const phone = document.getElementById('login-phone').value;
    const pass = document.getElementById('login-password').value;

    if(!phone || !pass) return alert("Please fill details");

    const { data: user, error } = await sb.from('users').select('*').eq('phone_number', phone).single();
    
    if(error || !user) {
        alert("User not found or connection error.");
        return;
    }

    if(user && user.password_hash === pass) {
        localStorage.setItem('user_id', user.id);
        window.location.href = 'dashboard.html';
    } else {
        alert("Invalid Credentials!");
    }
};

window.handleRegistration = async function() {
    const btn = document.querySelector('button[onclick="window.handleRegistration()"]');
    if(btn) { btn.disabled = true; btn.innerText = "Processing..."; }

    const name = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-password').value;
    const pkgId = document.getElementById('package-select').value;
    const trans = document.getElementById('trans-details').value;
    const refIdInput = document.getElementById('reg-referrer-id').value.trim();

    if(!name || !phone || !pass || !pkgId) {
        if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
        return alert("All fields are required!");
    }

    let refUUID = null;
    if(refIdInput.length > 5) {
        const { data: refUser } = await sb.from('users').select('id').eq('id', refIdInput).single();
        if(refUser) refUUID = refUser.id;
    }

    let isFree = (pkgId === "FREE_PLAN");
    
    // Create User (Allowed via RLS Policy)
    const { data: newUser, error } = await sb.from('users').insert([{ 
        full_name: name,
        phone_number: phone, 
        password_hash: pass, 
        package_id: pkgId,
        is_approved: isFree, 
        referred_by_id: refUUID 
    }]).select().single();

    // Error Handling
    if(error) {
        if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
        if(error.message.includes('unique constraint') || error.code === '23505') {
            return alert("Phone Number already registered! Please Login.");
        }
        return alert("Error: " + error.message);
    }

    // Payment Handling
    if(!isFree) {
        if(!trans) {
             if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
             return alert("UTR Number is required for paid plans!");
        }
        const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
        
        // Transaction Insert (Allowed via RLS Policy)
        await sb.from('transactions').insert([{ 
            user_id: newUser.id, amount: pkg.price, utr_number: trans, package_id: pkgId 
        }]);
        
        alert("Registration Successful! Please wait for Admin Approval.");
    } else {
        alert("Free Account Created! Login Now.");
    }
    
    window.location.reload();
};

// ==========================================
// 2. PAYMENT & UTILS
// ==========================================

window.fetchAdminSettings = async function() {
    const { data } = await sb.from('admin_settings').select('*').single();
    if(!data) return;

    // Register Page Elements
    if(document.getElementById('pay-upi-display')) document.getElementById('pay-upi-display').innerText = data.upi_id;
    if(document.getElementById('pay-qr-img')) document.getElementById('pay-qr-img').src = data.qr_url;
    
    // Dashboard Upgrade Modal Elements
    if(document.getElementById('upgrade-upi-display')) document.getElementById('upgrade-upi-display').innerText = data.upi_id;
    if(document.getElementById('upgrade-qr-img')) document.getElementById('upgrade-qr-img').src = data.qr_url;
};

window.togglePay = function() {
    const pkg = document.getElementById('package-select').value;
    const sec = document.getElementById('payment-section');
    if(sec) sec.style.display = (pkg === 'FREE_PLAN' || pkg === "") ? 'none' : 'block';
};

window.payNow = async function() {
    const pkgId = document.getElementById('package-select') ? document.getElementById('package-select').value : null;
    if(!pkgId || pkgId === 'FREE_PLAN') return; // Free plan needs no payment
    
    const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
    const { data: set } = await sb.from('admin_settings').select('upi_id').single();
    
    window.location.href = `upi://pay?pa=${set.upi_id}&pn=TaskBoost&am=${pkg.price}&cu=INR`;
};

// Helper: Copy UPI for Register Page
window.copyRegUPI = function() {
    const upiText = document.getElementById('pay-upi-display').innerText;
    if(upiText && upiText !== "Loading...") {
        navigator.clipboard.writeText(upiText).then(() => {
            alert("UPI ID Copied: " + upiText);
        }).catch(() => alert("UPI ID Copied!"));
    }
};

// Helper: Copy UPI for Upgrade Modal
window.copyUPI = function() {
    const upiText = document.getElementById('upgrade-upi-display').innerText;
    if(upiText && upiText !== "Loading...") {
        navigator.clipboard.writeText(upiText).then(() => {
            alert("UPI ID Copied: " + upiText);
        }).catch(() => alert("UPI ID Copied!"));
    }
};

// ==========================================
// 3. DASHBOARD LOGIC
// ==========================================

window.loadDashboardData = async function() {
    const uid = localStorage.getItem('user_id');
    if(!uid) return window.location.href = 'index.html';
    
    const { data: user } = await sb.from('users').select('*').eq('id', uid).single();
    if(!user) return;

    document.getElementById('user-phone').innerText = `ID: ${user.phone_number}`;
    document.getElementById('total-earning').innerText = `₹ ${parseFloat(user.total_earnings).toFixed(2)}`;
    document.getElementById('withdrawable-amount').innerText = `₹ ${parseFloat(user.withdrawable_amount).toFixed(2)}`;
    document.getElementById('plan-name').innerText = user.package_id; 
    
    window.userRate = (parseFloat(user.base_earning_rate) || 0) + (parseFloat(user.extra_earning_rate) || 0);
    document.getElementById('current-rate').innerText = `₹ ${window.userRate.toFixed(4)}`;
    
    // Speedometer Logic
    const meter = document.querySelector('.speedo-arc');
    if(meter) {
        let rotation = -45 + (window.userRate * 20); 
        if(rotation > 135) rotation = 135; 
        meter.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    }

    const link = `${window.location.origin}/index.html?ref=${user.id}`;
    if(document.getElementById('referral-link')) document.getElementById('referral-link').value = link;

    // === UPGRADE BUTTON LOGIC ===
    const upgradeBtn = document.getElementById('upgrade-trigger-btn');
    if(user.package_id === 'FREE_PLAN' || user.package_id === 'PKG_500') {
        if(upgradeBtn) upgradeBtn.style.display = 'block'; 
    } else {
        if(upgradeBtn) upgradeBtn.style.display = 'none';  
    }

    if(user.is_approved) window.fetchVideos();
    else document.getElementById('video-list').innerHTML = "<div style='text-align:center; padding:20px; color:orange; background:white; border-radius:10px;'>Account Pending Approval...</div>";
};

// ==========================================
// 4. VIDEO & EARNING LOGIC
// ==========================================

window.fetchVideos = async function() {
    const uid = localStorage.getItem('user_id'); 
    const { data: vids } = await sb.from('videos').select('*').eq('is_active', true);
    const list = document.getElementById('video-list');
    
    const curV = localStorage.getItem(`running_vid_${uid}`);

    list.innerHTML = vids.map(v => {
        const isRunning = (curV == v.id);
        return `
        <div style="background:white; padding:15px; margin-bottom:10px; border-radius:15px; display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:bold; font-size:13px;">${v.description}</div>
            <button onclick="${isRunning ? `window.claimEarnings(${v.id})` : `window.startVideo(${v.id}, '${v.video_link}')`}" 
                style="padding:10px 20px; border:none; border-radius:10px; color:white; font-weight:bold; background:${isRunning?'#22c55e':'#0f172a'}; cursor:pointer;">
                ${isRunning ? 'CLAIM NOW' : 'WATCH'}
            </button>
        </div>`;
    }).join('');

    if(curV) window.checkAutoClaim(curV);
};

window.startVideo = function(vid, link) {
    const uid = localStorage.getItem('user_id');
    localStorage.setItem(`running_vid_${uid}`, vid);
    localStorage.setItem(`start_time_${uid}`, Date.now());
    window.open(link, '_blank');
    location.reload();
};

window.checkAutoClaim = function(vid) {
    const uid = localStorage.getItem('user_id');
    const start = parseInt(localStorage.getItem(`start_time_${uid}`));
    const elapsed = (Date.now() - start) / 60000;
    if(elapsed >= 10) window.claimEarnings(vid, true); 
};

window.claimEarnings = async function(vid, isAuto = false) {
    const uid = localStorage.getItem('user_id');
    const start = parseInt(localStorage.getItem(`start_time_${uid}`));
    
    if(!start) return; 

    let mins = (Date.now() - start) / 60000;
    if(mins > 10) mins = 10; 
    if(mins < 1 && !isAuto) return alert("Watch for at least 1 minute!");

    const amount = window.userRate * mins;

    // Call Secure SQL Function
    const { error } = await sb.rpc('update_user_earnings', { 
        user_id_input: uid, 
        amount_to_add: amount,
        minutes_claimed: mins 
    });
    
    if(error) {
        console.error("DB Error:", error);
        if(error.message.includes('Security Alert')) {
            alert("⚠️ MULTIPLE DEVICE ERROR:\nPlease logout from other devices.");
            localStorage.removeItem(`running_vid_${uid}`);
            localStorage.removeItem(`start_time_${uid}`);
            location.reload();
        } else if (error.message.includes('Daily')) {
            alert("⚠️ " + error.message);
            localStorage.removeItem(`running_vid_${uid}`);
            localStorage.removeItem(`start_time_${uid}`);
            location.reload();
        } else {
            alert("Error: " + error.message);
        }
    } else {
        localStorage.removeItem(`running_vid_${uid}`);
        localStorage.removeItem(`start_time_${uid}`);
        alert(`Success! Claimed ₹${amount.toFixed(2)}`);
        location.reload();
    }
};

// ==========================================
// 5. WITHDRAWAL & HISTORY
// ==========================================

window.openWithdrawModal = function() {
    const cleanForm = `
        <h3 style="margin-top:0;">Request Withdrawal</h3>
        <input type="number" id="withdrawal-amount-input" placeholder="Amount (Min ₹1500)">
        <input type="text" id="withdrawal-upi-input" placeholder="Enter UPI ID">
        <button onclick="window.handleWithdrawal()" style="width:100%; padding:18px; background:#10b981; color:white; border:none; border-radius:16px; font-weight:bold; font-size:16px;">CONFIRM REQUEST</button>
    `;
    document.getElementById('sheet-content').innerHTML = cleanForm;
    openSheet();
};

window.handleWithdrawal = async function() {
    const amt = document.getElementById('withdrawal-amount-input').value;
    const upi = document.getElementById('withdrawal-upi-input').value;
    const uid = localStorage.getItem('user_id');

    if(amt < 1500) return alert("Min Withdrawal ₹1500");
    const { error } = await sb.rpc('request_withdrawal', { user_id_input: uid, amount_req: amt, upi_input: upi });
    
    if(error) alert("Failed: " + error.message);
    else { alert("Request Sent!"); location.reload(); }
};

window.loadWithdrawHistory = async function() {
    const uid = localStorage.getItem('user_id');
    const { data } = await sb.from('withdrawal_history').select('*').eq('user_id', uid).order('created_at', {ascending:false});
    
    let html = `<h3 style="margin-top:0;">Withdrawal History</h3><div style="max-height:300px; overflow-y:auto;">`;
    if(data.length === 0) html += "<p>No history yet.</p>";
    else data.forEach(w => {
        let color = w.status === 'approved' ? 'green' : (w.status === 'rejected' ? 'red' : 'orange');
        html += `<div style="background:#f1f5f9; padding:10px; margin-bottom:10px; border-radius:10px; font-size:12px;">
            <strong>₹${w.amount}</strong> <span style="float:right; color:${color}; font-weight:bold;">${w.status.toUpperCase()}</span><br>
            <span style="color:#64748b;">${new Date(w.created_at).toLocaleDateString()}</span>
        </div>`;
    });
    html += `</div><button onclick="closeSheet()" style="width:100%; padding:15px; margin-top:10px; border:none; background:#cbd5e1; border-radius:10px;">Close</button>`;
    
    document.getElementById('sheet-content').innerHTML = html;
    openSheet();
};

// ==========================================
// 6. UPGRADE SYSTEM (DASHBOARD)
// ==========================================

window.handleUpgradePay = async function() {
    const pkgId = document.getElementById('upgrade-package-select').value;
    if(!pkgId) return alert("Select a package first!");
    const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
    const { data: set } = await sb.from('admin_settings').select('upi_id').single();
    window.location.href = `upi://pay?pa=${set.upi_id}&pn=TaskBoostUpgrade&am=${pkg.price}&cu=INR`;
};

window.submitUpgradeRequest = async function() {
    const uid = localStorage.getItem('user_id');
    const pkgId = document.getElementById('upgrade-package-select').value;
    const utr = document.getElementById('upgrade-utr').value;

    if(!utr || utr.length < 12) return alert("Enter valid 12-digit UTR");

    // Allowed via RLS Policy
    const { error } = await sb.from('upgrade_requests').insert([
        { user_id: uid, package_id: pkgId, utr_number: utr, status: 'pending' }
    ]);

    if(error) alert("Error: " + error.message);
    else {
        alert("Upgrade Request Sent! Please wait for approval.");
        window.closeUpgradeModal();
    }
};

// ==========================================
// 7. ADMIN PANEL
// ==========================================

window.adminLogin = function() {
    const id = document.getElementById('admin-id').value;
    const pass = document.getElementById('admin-pass').value;
    if(id === "9090" && pass === "0909") {
        localStorage.setItem('admin_session', 'true');
        window.location.href = 'admin.html';
    } else alert("Invalid Admin Credentials");
};

window.loadAdminPanel = async function() {
    if(localStorage.getItem('admin_session') !== 'true') return window.location.href = 'index.html';
    
    // Settings
    const { data: set } = await sb.from('admin_settings').select('*').single();
    if(set) {
        document.getElementById('admin-upi').value = set.upi_id;
        document.getElementById('admin-qr').value = set.qr_url;
    }

    // Registrations
    const { data: regs } = await sb.from('transactions').select('*, users(full_name, phone_number)').eq('status', 'pending');
    document.getElementById('pending-regs').innerHTML = regs.map(r => `
        <div class="row">
            <div>
                <strong>${r.users ? r.users.full_name : 'Unknown'}</strong><br>
                <small>📱 ${r.users ? r.users.phone_number : '--'}</small><br>
                <small style="color:#2563eb;">Pay: ₹${r.amount}</small> | <small>UTR: ${r.utr_number}</small>
            </div>
            <div>
                <button onclick="window.approveReg('${r.user_id}', '${r.id}', '${r.package_id}')" style="background:green;">✓</button>
                <button onclick="window.rejectReg('${r.id}')" style="background:red;">✗</button>
            </div>
        </div>`).join('');

    // UPGRADE REQUESTS
    const { data: upgrades } = await sb.from('upgrade_requests').select('*, users(phone_number)').eq('status', 'pending');
    
    const planNames = {
        'PKG_500': 'Basic (₹500)',
        'PKG_1000': 'Bronze (₹1000)',
        'PKG_2000': 'Silver (₹2000)',
        'PKG_3000': 'Gold (₹3000)',
        'PKG_5000': 'Platinum (₹5000)',
        'PKG_10000': 'Diamond (₹10000)'
    };

    if (upgrades && upgrades.length > 0) {
        document.getElementById('pending-upgrades').innerHTML = upgrades.map(u => {
            let displayPlan = planNames[u.package_id] || u.package_id || "Unknown Plan";
            return `
            <div class="row">
                <div>
                    <strong>📱 ${u.users ? u.users.phone_number : 'Unknown'}</strong>
                    <div style="margin-top:5px; margin-bottom:5px;">
                        <span style="background:#22c55e; color:white; padding:4px 8px; border-radius:5px; font-weight:bold; font-size:12px;">
                            ${displayPlan}
                        </span>
                    </div>
                    <div style="font-size:12px; color:#64748b;">
                        UTR: <span style="font-family:monospace; color:#0f172a; font-weight:bold;">${u.utr_number}</span>
                    </div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button onclick="window.approveUpgrade('${u.id}')" style="background:green; padding:8px 12px;">✓</button>
                    <button onclick="window.rejectUpgrade('${u.id}')" style="background:red; padding:8px 12px;">✗</button>
                </div>
            </div>`;
        }).join('');
    } else {
        document.getElementById('pending-upgrades').innerHTML = '<p style="padding:10px; color:#94a3b8; font-size:13px; text-align:center;">No Pending Upgrades</p>';
    }

    // Withdrawals
    const { data: wds } = await sb.from('withdrawal_history').select('*, users(phone_number)').eq('status', 'pending');
    document.getElementById('pending-withdrawals').innerHTML = wds.map(w => `
        <div class="row">
            <div>
                <strong>${w.users ? w.users.phone_number : 'User'}</strong><br>
                <span style="color:#16a34a; font-weight:bold;">₹${w.amount}</span><br>
                <small>UPI: ${w.upi_id}</small>
            </div>
            <div>
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:green;">Pay</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red;">Reject</button>
            </div>
        </div>`).join('');

    // Videos
    const { data: vids } = await sb.from('videos').select('*');
    document.getElementById('admin-videos').innerHTML = vids.map(v => `
        <div class="row">${v.description} <button onclick="window.deleteVideo(${v.id})" style="background:red;">Del</button></div>
    `).join('');
};


// ==========================================
// 8. ADMIN ACTIONS (SECURE & FINAL)
// ==========================================

window.approveReg = async function(uid, tid, pkgId) {
    // 1. Button UI Change
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    // 2. User Approve (Secure Function Call)
    // Note: '0909' wahi password hai jo humne SQL function me set kiya tha
    const { error: userErr } = await sb.rpc('admin_action_approve_user', { 
        target_user_id: uid, 
        pkg_id: pkgId,
        admin_pass: '0909' 
    });

    if(userErr) {
        alert("Action Failed: " + userErr.message);
        btn.innerText = originalText;
        btn.disabled = false;
        return;
    }

    // 3. Transaction Status Update (Secure Function Call)
    const { error: txError } = await sb.rpc('admin_approve_transaction', { trans_id: tid });
    
    if(txError) {
        alert("User Approved but Transaction status update failed: " + txError.message);
    } else {
        alert("✅ User Approved Successfully & Securely!"); 
        window.loadAdminPanel(); 
    }
};

window.rejectReg = async function(tid) {
    if(!confirm("Are you sure you want to Reject this User?")) return;
    
    // Secure Function Call
    const { error } = await sb.rpc('admin_reject_transaction', { trans_id: tid });
    
    if(error) alert("Error: " + error.message);
    else {
        alert("Registration Rejected!"); 
        window.loadAdminPanel();
    }
};

// ==========================================
// 9. UPGRADE APPROVALS (SECURE)
// ==========================================

window.approveUpgrade = async function(reqId) {
    if(!confirm("Approve this upgrade?")) return;

    // Secure Function Call
    const { error } = await sb.rpc('approve_upgrade_request', { request_id: reqId });
    
    if(error) {
        alert("Error: " + error.message);
    } else {
        alert("Upgrade Approved! User plan updated."); 
        window.loadAdminPanel();
    }
};

window.rejectUpgrade = async function(reqId) {
    if(!confirm("Reject this upgrade request?")) return;

    // Secure Function Call
    const { error } = await sb.rpc('admin_reject_upgrade_request', { req_id: reqId });

    if(error) alert("Error: " + error.message);
    else {
        alert("Request Rejected"); 
        window.loadAdminPanel();
    }
};

// ==========================================
// 10. WITHDRAWAL ACTIONS (SECURE)
// ==========================================

window.approveWithdrawal = async function(wid) {
    if(!confirm("Confirm Payment Sent?")) return;

    // Secure Function Call
    const { error } = await sb.rpc('admin_approve_withdrawal', { withdraw_id: wid });
    
    if(error) alert("Error: " + error.message);
    else {
        alert("Marked as Paid"); 
        window.loadAdminPanel();
    }
};

window.rejectWithdrawal = async function(wid) {
    if(!confirm("Reject & Refund money to user wallet?")) return;
    
    // Secure Function Call (Ye user ko paisa wapas dega)
    const { error } = await sb.rpc('reject_withdrawal_refund', { withdrawal_id_input: wid });
    
    if(error) alert(error.message); 
    else { 
        alert("Request Rejected & Amount Refunded to User!"); 
        window.loadAdminPanel(); 
    }
};

// ==========================================
// 11. SETTINGS & VIDEOS (SECURE)
// ==========================================

window.updateSettings = async function() {
    const upi = document.getElementById('admin-upi').value;
    const qr = document.getElementById('admin-qr').value;

    // Secure Function Call
    const { error } = await sb.rpc('admin_update_settings', { new_upi: upi, new_qr: qr });
    
    if(error) alert("Error: " + error.message);
    else alert("Settings Saved Securely!");
};

window.addVideo = async function() {
    const title = document.getElementById('vid-title').value;
    const link = document.getElementById('vid-link').value;

    if(!title || !link) return alert("Enter Title and Link");

    // Secure Function Call
    const { error } = await sb.rpc('admin_add_video', { title: title, link: link });

    if(error) alert("Error: " + error.message);
    else { 
        alert("Video Added"); 
        window.loadAdminPanel();
    }
};

window.deleteVideo = async function(vid) { 
    if(!confirm("Delete this video?")) return;
    
    // Secure Function Call
    const { error } = await sb.rpc('admin_delete_video', { vid_id: vid });
    
    if(error) alert("Error: " + error.message);
    else window.loadAdminPanel(); 
};

// ==========================================
// 12. UTILS & STARTUP
// ==========================================

window.copyReferralLink = function() {
    const el = document.getElementById("referral-link");
    if(el) {
        el.select(); 
        navigator.clipboard.writeText(el.value);
        alert("Copied!");
    }
};

window.logoutUser = () => { 
    localStorage.clear(); 
    window.location.href = 'index.html'; 
};

// Auto-Fill Referral Code on Load
document.addEventListener('DOMContentLoaded', () => {
    // URL se ?ref=CODE padho
    const params = new URLSearchParams(window.location.search);
    if(params.get('ref') && document.getElementById('reg-referrer-id')) {
        document.getElementById('reg-referrer-id').value = params.get('ref');
        // Seedha Register form dikhao
        if(window.toggleForm) window.toggleForm('register');
    }
});
