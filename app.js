// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://zdkyadihslputswgmncz.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpka3lhZGloc2xwdXRzd2dtbmN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTUyODUsImV4cCI6MjA4MTEzMTI4NX0.cEi1wKw640hHuiFOxSC-zR6WiAzD8xkRxgEptuzuQGM';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentTimer = null;
window.userRate = 0;

const SETTINGS_TABLE = 'admin_settings'; 
const VIDEOS_TABLE = 'videos'; 
const USERS_TABLE = 'users'; 

// Utility: URL se Referral ID nikalna 
window.getReferralId = function() {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || params.get('REF') || null; 
};

// --- 2. NAVIGATION & PAYMENT LOGIC ---

window.toggleSection = function(id) {
    const ids = ['login-section', 'register-section', 'admin-login-section'];
    ids.forEach(s => {
        const el = document.getElementById(s);
        if(el) el.style.display = (s === id) ? 'block' : 'none';
    });
};

window.showRegister = function() {
    window.toggleSection('register-section');
    window.fetchPackages('package-select');
    window.fetchRegisterUpi();
};

window.showLogin = function() { window.toggleSection('login-section'); };
window.showAdminLogin = function() { window.toggleSection('admin-login-section'); }; 

// FEATURE: Deep Link Payment (PhonePe Style)
window.triggerDirectPayment = async function(isUpgrade = false) {
    let pkgId = isUpgrade ? document.getElementById('upgrade-package-select').value : document.getElementById('package-select').value;
    if(!pkgId || pkgId === "FREE_PLAN") return alert("Please select a premium plan first!");
    
    const { data: pkg } = await sb.from('packages').select('*').eq('id', pkgId).single();
    const { data: settings } = await sb.from(SETTINGS_TABLE).select('upi_id').eq('id', 1).single();
    
    if (settings?.upi_id) {
        const upiUrl = `upi://pay?pa=${settings.upi_id}&pn=TaskBoost&am=${pkg.price}&cu=INR&tn=UserPayment`;
        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            window.location.href = upiUrl;
        } else {
            alert("Please use Mobile for Direct UPI Pay.");
        }
    } else alert("Admin UPI not set!");
};

// FEATURE: Fetch UPI & QR for both Register and Upgrade
window.fetchRegisterUpi = async function() {
    const { data } = await sb.from(SETTINGS_TABLE).select('upi_id, qr_url').eq('id', 1).single();
    const upiIds = ['current-upi-id', 'upgrade-upi-id'];
    const qrImgs = ['upi-qr-code', 'upgrade-qr-code'];

    upiIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = data?.upi_id || 'N/A';
    });
    qrImgs.forEach(id => {
        const img = document.getElementById(id);
        if(img && data?.qr_url) img.src = data.qr_url;
    });
};

// --- 3. AUTHENTICATION ---

window.handleAdminLogin = async function() {
    const id = document.getElementById('admin-id').value;
    const pass = document.getElementById('admin-password').value;
    if(id === "161616" && pass === "Vicky@1616") {
        localStorage.setItem('admin_id', 'admin_active');
        window.location.href = 'admin.html';
    } else { alert("Wrong Admin Details!"); }
};

window.handleUserLogin = async function() {
    const phone = document.getElementById('login-phone').value;
    const pass = document.getElementById('login-password').value;
    const { data: user } = await sb.from(USERS_TABLE).select('*').eq('phone_number', phone).single();
    if(user && user.password_hash === pass) {
        localStorage.setItem('user_id', user.id);
        window.location.href = 'dashboard.html';
    } else { alert("Login Failed!"); }
};

// FEATURE: Free Package Registration & Approval
window.handleRegistration = async function() {
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-password').value;
    const pkgId = document.getElementById('package-select').value;
    const trans = document.getElementById('trans-details').value;
    const refId = document.getElementById('reg-referrer-id')?.value.trim();

    if(!phone || !pass || !pkgId) return alert("Fill all details!");

    let baseRate = 0.20; 
    let isApproved = false;
    let price = 0;

    if(pkgId === "FREE_PLAN") {
        isApproved = true; 
    } else {
        const { data: pkg } = await sb.from('packages').select('*').eq('id', pkgId).single();
        if(!pkg) return alert("Package not found");
        baseRate = pkg.base_rate_per_min;
        price = pkg.price;
        if(!trans) return alert("Transaction ID required for Premium!");
    }
    
    const userData = {
        phone_number: phone, password_hash: pass, 
        package_id: (pkgId === "FREE_PLAN" ? null : pkgId),
        base_earning_rate: baseRate, is_approved: isApproved
    };
    if (refId && refId.length > 5) userData.referred_by_id = refId;

    const { data: newUser, error } = await sb.from(USERS_TABLE).insert([userData]).select();
    if(error) return alert("Error: " + error.message);

    if(pkgId !== "FREE_PLAN") {
        await sb.from('transactions').insert([{ 
            user_id: newUser[0].id, amount: price, user_payment_details: trans, status: 'pending' 
        }]);
        alert("Registered! Wait for admin approval.");
    } else {
        alert("Free Account Activated! You can login now.");
    }
    window.location.href = 'index.html';
};

// FEATURE: Packages with Rate/Min display
window.fetchPackages = async function(selectId = 'package-select') {
    const { data } = await sb.from('packages').select('*').order('price');
    const sel = document.getElementById(selectId);
    if(sel && data) {
        sel.innerHTML = '<option value="">Select Package</option>';
        if(selectId === 'package-select') {
            sel.innerHTML += `<option value="FREE_PLAN">Free Plan - ₹0.20/min</option>`;
        }
        data.forEach(p => { 
            sel.innerHTML += `<option value="${p.id}">${p.package_name} (₹${p.price}) - ₹${p.base_rate_per_min}/min</option>`; 
        });
    }
};

// --- 4. DASHBOARD & TIMER (10 MIN LOGIC) ---

window.loadDashboardData = async function() {
    const uid = localStorage.getItem('user_id');
    if(!uid) return;
    
    const { data: user } = await sb.from(USERS_TABLE).select('*').eq('id', uid).single();
    if(!user) return;

    document.getElementById('user-phone').textContent = user.phone_number;
    document.getElementById('total-earning').textContent = `₹ ${parseFloat(user.total_earnings || 0).toFixed(2)}`;
    
    if(document.getElementById('withdrawable-amount')) {
        document.getElementById('withdrawable-amount').textContent = `₹ ${parseFloat(user.withdrawable_amount || 0).toFixed(2)}`;
    }
    
    window.userRate = (parseFloat(user.base_earning_rate) || 0) + (parseFloat(user.extra_earning_rate) || 0);
    document.getElementById('current-rate').textContent = `₹ ${window.userRate.toFixed(4)} per minute`;

    if(document.getElementById('referral-link')) {
        document.getElementById('referral-link').value = `${window.location.origin}/index.html?ref=${user.id}`;
    }
    
    // FEATURE: Upgrade Button for Free Users
    const upBtn = document.getElementById('upgrade-btn');
    if(upBtn) {
        upBtn.style.display = (user.base_earning_rate <= 0.21) ? 'block' : 'none';
    }

    if(user.is_approved) window.fetchAndRenderVideos();
    else document.getElementById('video-list').innerHTML = "<p style='color:orange; text-align:center;'>Pending Admin Approval...</p>";
};

window.fetchAndRenderVideos = async function() {
    const { data: vids } = await sb.from(VIDEOS_TABLE).select('*').eq('is_active', true);
    const list = document.getElementById('video-list');
    if(!list) return;

    const curV = localStorage.getItem('running_vid');
    list.innerHTML = vids.map(v => {
        const active = (curV == v.id);
        return `
            <div style="border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:10px; background:#fff;">
                <strong>${v.description}</strong>
                <button id="start-btn-${v.id}" style="display:${active?'none':'block'}; background:#5f259f; color:white; width:100%; padding:10px; border:none; border-radius:5px; margin-top:5px;" onclick="window.startEarningTimer(${v.id}, '${v.video_link}')">Watch Video</button>
                <button id="stop-btn-${v.id}" style="display:${active?'block':'none'}; background:#2ecc71; color:white; width:100%; padding:10px; border:none; border-radius:5px; margin-top:5px;" onclick="window.stopEarningTimer(${v.id})">Claim</button>
            </div>`;
    }).join('');
    if(curV) window.resumeTimer(curV, localStorage.getItem('start_time'));
};

window.startEarningTimer = function(vid, link) {
    if(window.currentTimer) return;
    const start = Date.now();
    localStorage.setItem('running_vid', vid);
    localStorage.setItem('start_time', start);
    window.open(link, '_blank');
    window.resumeTimer(vid, start);
};

window.resumeTimer = function(vid, startTime) {
    startTime = parseInt(startTime);
    if(window.currentTimer) clearInterval(window.currentTimer);
    window.currentTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        // 10 MINUTE AUTO LOGIC
        if(elapsed >= 600000) { 
            window.stopEarningTimer(vid, true); 
        }
    }, 1000);
};

window.stopEarningTimer = async function(vid, isAuto = false) {
    const start = localStorage.getItem('start_time');
    if(!start) return;
    
    let elapsedMs = Date.now() - parseInt(start);
    
    // FEATURE: 1 Min Check (Unless it's 10min auto stop)
    if(elapsedMs < 60000 && !isAuto) {
        return alert("Watch for at least 1 minute to claim!");
    }

    clearInterval(window.currentTimer);
    let mins = Math.min(elapsedMs / 60000, 10); 
    const total = window.userRate * mins;

    localStorage.removeItem('running_vid');
    localStorage.removeItem('start_time');
    window.currentTimer = null;

    if(total > 0) {
        await sb.rpc('update_user_earnings', { user_id_input: localStorage.getItem('user_id'), amount_to_add: total });
        // No popup as requested, just refresh data
    }
    location.reload();
};

// --- 5. WITHDRAWAL LOGIC ---

window.handleWithdrawal = async function() {
    const uid = localStorage.getItem('user_id');
    const amount = parseFloat(document.getElementById('withdrawal-amount-input').value);
    const upiId = document.getElementById('withdrawal-upi-input').value.trim();
    
    if (amount < 999) return alert("Minimum withdrawal is ₹999.");
    
    const { data: user } = await sb.from(USERS_TABLE).select('withdrawable_amount').eq('id', uid).single();
    if (amount > user.withdrawable_amount) return alert("Insufficient balance!");

    const { error: insertError } = await sb.from('withdrawals').insert([
        { user_id: uid, request_amount: amount, upi_id: upiId, status: 'pending' } 
    ]);

    if (!insertError) {
        await sb.rpc('deduct_withdrawable_amount', { user_id_input: uid, amount_to_deduct: amount });
        alert("Withdrawal request sent!");
        window.loadDashboardData(); 
    }
};

// --- 6. UPGRADE LOGIC (QR & UPI ID SHOW) ---

window.showUpgradeForm = function() {
    document.getElementById('upgrade-section').style.display = 'block';
    window.fetchPackages('upgrade-package-select');
    window.fetchRegisterUpi(); // Fixed: Show UPI/QR in upgrade too
};

window.handleUpgradeSubmit = async function() {
    const pkgId = document.getElementById('upgrade-package-select').value;
    const trans = document.getElementById('upgrade-trans-details').value;
    const uid = localStorage.getItem('user_id');

    if(!pkgId || !trans) return alert("Select Plan and Enter UTR!");

    const { data: pkg } = await sb.from('packages').select('*').eq('id', pkgId).single();
    await sb.from('transactions').insert([{ 
        user_id: uid, amount: pkg.price, user_payment_details: trans, status: 'pending', package_id: pkgId
    }]);
    alert("Upgrade request submitted! Admin will verify.");
    document.getElementById('upgrade-section').style.display = 'none';
};

// --- 7. ADMIN PANEL ---

window.loadAdminData = async function() {
    // UPI & QR Load
    const { data: conf } = await sb.from(SETTINGS_TABLE).select('*').eq('id', 1).single();
    if(conf) {
        if(document.getElementById('admin-upi-input')) document.getElementById('admin-upi-input').value = conf.upi_id;
        if(document.getElementById('admin-qr-input')) document.getElementById('admin-qr-input').value = conf.qr_url;
        if(document.getElementById('display-upi-id')) document.getElementById('display-upi-id').textContent = conf.upi_id;
    }

    // Pending Transactions
    const { data: trans } = await sb.from('transactions').select('*, users(phone_number)').eq('status', 'pending');
    const transList = document.getElementById('pending-transactions');
    if(transList && trans) {
        transList.innerHTML = trans.map(t => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:5px;">
                User: ${t.users?.phone_number} | ₹${t.amount} | UTR: ${t.user_payment_details}
                <button onclick="window.approveUser('${t.user_id}', '${t.id}', '${t.package_id}')" style="background:green; color:white; border:none; padding:5px; border-radius:3px; cursor:pointer;">Approve</button>
            </div>`).join('');
    }

    // Pending Withdrawals
    const { data: wds } = await sb.from('withdrawals').select('*, users(phone_number)').eq('status', 'pending');
    const wdList = document.getElementById('pending-withdrawals');
    if(wdList && wds) {
        wdList.innerHTML = wds.map(w => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:5px;">
                User: ${w.users?.phone_number} | ₹${w.request_amount} | UPI: ${w.upi_id}
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:orange; color:white; border:none; padding:5px; border-radius:3px;">Paid</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red; color:white; border:none; padding:5px; border-radius:3px;">Reject</button>
            </div>`).join('');
    }

    // FEATURE: Current Videos Loading Fix
    const vidList = document.getElementById('current-videos');
    const { data: vids } = await sb.from(VIDEOS_TABLE).select('*');
    if(vidList && vids) {
        vidList.innerHTML = vids.map(v => `
            <div style="padding:10px; border-bottom:1px solid #eee;">
                ${v.description} <button onclick="window.deleteVideo(${v.id})" style="color:red; float:right; border:none; background:none; cursor:pointer;">[Delete]</button>
            </div>`).join('');
    }
};

window.approveUser = async function(uid, tid, pkgId) {
    await sb.from('transactions').update({ status: 'approved' }).eq('id', tid);
    if(pkgId && pkgId !== 'null') {
        const { data: pkg } = await sb.from('packages').select('base_rate_per_min').eq('id', pkgId).single();
        await sb.from(USERS_TABLE).update({ base_earning_rate: pkg.base_rate_per_min, is_approved: true }).eq('id', uid);
    } else {
        await sb.from(USERS_TABLE).update({ is_approved: true }).eq('id', uid);
    }
    await sb.rpc('grant_referral_rewards', { new_user_id: uid });
    alert("Approved!");
    window.loadAdminData();
};

window.approveWithdrawal = async function(wid) {
    await sb.from('withdrawals').update({ status: 'approved' }).eq('id', wid);
    alert("Marked as Paid!");
    window.loadAdminData();
};

window.rejectWithdrawal = async function(wdId) {
    const { data: wd } = await sb.from('withdrawals').select('user_id, request_amount').eq('id', wdId).single();
    await sb.from('withdrawals').update({ status: 'rejected' }).eq('id', wdId);
    await sb.rpc('refund_withdrawable_amount', { user_id_input: wd.user_id, amount_to_refund: wd.request_amount });
    alert("Rejected & Refunded!");
    window.loadAdminData();
};

window.updateUpiSettings = async function() {
    const upi = document.getElementById('admin-upi-input').value;
    const qr = document.getElementById('admin-qr-input').value;
    await sb.from(SETTINGS_TABLE).upsert([{ id: 1, upi_id: upi, qr_url: qr }]);
    alert("Settings Updated!");
};

window.addVideoLink = async function() {
    const d = document.getElementById('new-video-desc').value;
    const l = document.getElementById('new-video-link').value;
    await sb.from(VIDEOS_TABLE).insert([{ description: d, video_link: l, is_active: true }]);
    alert("Video Added!"); 
    window.loadAdminData();
};

window.deleteVideo = async function(vid) {
    await sb.from(VIDEOS_TABLE).delete().eq('id', vid);
    window.loadAdminData();
};

// --- 8. UTILITIES ---
window.copyReferralLink = function() {
    const link = document.getElementById('referral-link');
    link.select();
    navigator.clipboard.writeText(link.value);
    alert("Link Copied!");
};

window.logoutUser = () => { localStorage.clear(); window.location.href = 'index.html'; };

document.addEventListener('DOMContentLoaded', () => {
    const p = window.location.pathname;
    if(p.includes('admin.html')) window.loadAdminData();
    else if(p.includes('dashboard.html')) window.loadDashboardData();
    else {
        window.fetchPackages('package-select');
        window.fetchRegisterUpi();
    }
});
        
