// --- CONFIGURATION ---
const SUPABASE_URL = 'https://xvdrfkppeonjpxhmboch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZHJma3BwZW9uanB4aG1ib2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Mzc0NzEsImV4cCI6MjA4MzIxMzQ3MX0.g8yRmeYdttI2Wqj6eu0rap_wOFsM-vJTHlY3DWSgZCU';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentTimer = null;
window.userRate = 0;

// --- 1. LOGIN & REGISTER ---

window.toggleForm = (form) => {
    document.getElementById('login-box').style.display = (form === 'login') ? 'block' : 'none';
    document.getElementById('reg-box').style.display = (form === 'register') ? 'block' : 'none';
    if(form === 'register') window.fetchAdminSettings();
};

window.handleUserLogin = async function() {
    const phone = document.getElementById('login-phone').value;
    const pass = document.getElementById('login-password').value;
    const { data: user } = await sb.from('users').select('*').eq('phone_number', phone).single();
    if(user && user.password_hash === pass) {
        localStorage.setItem('user_id', user.id);
        window.location.href = 'dashboard.html';
    } else alert("Invalid Credentials!");
};

window.handleRegistration = async function() {
    // 1. Button Disable (Safety against Double Click)
    const btn = document.querySelector('button[onclick="window.handleRegistration()"]');
    if(btn) { btn.disabled = true; btn.innerText = "Processing..."; }

    const name = document.getElementById('reg-name').value;
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-password').value;
    const pkgId = document.getElementById('package-select').value;
    const trans = document.getElementById('trans-details').value;
    const refIdInput = document.getElementById('reg-referrer-id').value.trim();

    // Validation Fail hone par button wapas chalu karo
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
    
    // Create User
    const { data: newUser, error } = await sb.from('users').insert([{ 
        full_name: name,
        phone_number: phone, 
        password_hash: pass, 
        package_id: pkgId,
        is_approved: isFree, 
        referred_by_id: refUUID 
    }]).select().single();

    // Error Handling (Duplicate Check included)
    if(error) {
        if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
        if(error.message.includes('unique constraint') || error.code === '23505') {
            return alert("This Phone Number is already registered! Please Login.");
        }
        return alert("Error: " + error.message);
    }

    // Payment Handling
    if(!isFree) {
        if(!trans) {
             if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
             return alert("UTR Number is required!");
        }
        const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
        await sb.from('transactions').insert([{ 
            user_id: newUser.id, amount: pkg.price, utr_number: trans, package_id: pkgId 
        }]);
        alert("Registration Successful! Please wait for Admin Approval.");
    } else {
        alert("Free Account Created! Login Now.");
    }
    window.location.reload();
};

// --- 2. PAYMENT LOGIC ---

window.fetchAdminSettings = async function() {
    const { data } = await sb.from('admin_settings').select('*').single();
    if(document.getElementById('pay-upi-display')) document.getElementById('pay-upi-display').innerText = data.upi_id;
    if(document.getElementById('pay-qr-img')) document.getElementById('pay-qr-img').src = data.qr_url;
};

window.togglePay = function() {
    const pkg = document.getElementById('package-select').value;
    const sec = document.getElementById('payment-section');
    if(sec) sec.style.display = (pkg === 'FREE_PLAN' || pkg === "") ? 'none' : 'block';
};

window.payNow = async function() {
    const pkgId = document.getElementById('package-select').value;
    if(!pkgId || pkgId === 'FREE_PLAN') return;
    const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
    const { data: set } = await sb.from('admin_settings').select('upi_id').single();
    window.location.href = `upi://pay?pa=${set.upi_id}&pn=TaskBoost&am=${pkg.price}&cu=INR`;
};

// --- 3. DASHBOARD LOGIC ---

window.loadDashboardData = async function() {
    const uid = localStorage.getItem('user_id');
    if(!uid) return window.location.href = 'index.html';
    
    const { data: user } = await sb.from('users').select('*').eq('id', uid).single();
    if(!user) return;

    document.getElementById('user-phone').innerText = `ID: ${user.phone_number}`;
    document.getElementById('total-earning').innerText = `₹ ${parseFloat(user.total_earnings).toFixed(2)}`;
    document.getElementById('withdrawable-amount').innerText = `₹ ${parseFloat(user.withdrawable_amount).toFixed(2)}`;
    
    window.userRate = (parseFloat(user.base_earning_rate) || 0) + (parseFloat(user.extra_earning_rate) || 0);
    document.getElementById('current-rate').innerText = `₹ ${window.userRate.toFixed(4)}`;
    
    const meter = document.querySelector('.speedo-arc');
    if(meter) {
        let rotation = -45 + (window.userRate * 20); 
        if(rotation > 135) rotation = 135; 
        meter.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    }

    const link = `${window.location.origin}/index.html?ref=${user.id}`;
    if(document.getElementById('referral-link')) document.getElementById('referral-link').value = link;

    if(user.is_approved) window.fetchVideos();
    else document.getElementById('video-list').innerHTML = "<div style='text-align:center; padding:20px; color:orange; background:white; border-radius:10px;'>Account Pending Approval...</div>";
};

// --- 4. VIDEO & TIMER (FIXED: USER SPECIFIC & ANTI-CHEAT) ---

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

// --- CRITICAL UPDATE: ANTI-CHEAT PARAMETER ADDED ---
window.claimEarnings = async function(vid, isAuto = false) {
    const uid = localStorage.getItem('user_id');
    const start = parseInt(localStorage.getItem(`start_time_${uid}`));
    
    if(!start) return; 

    let mins = (Date.now() - start) / 60000;
    if(mins > 10) mins = 10; 
    if(mins < 1 && !isAuto) return alert("Watch for at least 1 minute!");

    const amount = window.userRate * mins;

    // Database Call (Added 'minutes_claimed' for Anti-Cheat)
    const { error } = await sb.rpc('update_user_earnings', { 
        user_id_input: uid, 
        amount_to_add: amount,
        minutes_claimed: mins 
    });
    
    if(error) {
        console.error("DB Error:", error);
        // Special message for Cheaters
        if(error.message.includes('Security Alert')) {
            alert("⚠️ MULTIPLE DEVICE ERROR:\nDouble earning detected from another device.\nPlease wait before claiming again.");
            // Clear local storage to reset state
            localStorage.removeItem(`running_vid_${uid}`);
            localStorage.removeItem(`start_time_${uid}`);
            location.reload();
        } else {
            alert("Error saving earning: " + error.message);
        }
    } else {
        localStorage.removeItem(`running_vid_${uid}`);
        localStorage.removeItem(`start_time_${uid}`);
        alert(`Success! Claimed ₹${amount.toFixed(2)}`);
        location.reload();
    }
};

// --- 5. WITHDRAWAL & HISTORY ---

window.openWithdrawModal = function() {
    const cleanForm = `
        <h3 style="margin-top:0;">Request Withdrawal</h3>
        <input type="number" id="withdrawal-amount-input" placeholder="Amount (Min ₹999)">
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

    if(amt < 999) return alert("Min Withdrawal ₹999");
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

// --- 6. ADMIN PANEL ---

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
    document.getElementById('admin-upi').value = set.upi_id;
    document.getElementById('admin-qr').value = set.qr_url;

    // Registrations
    const { data: regs } = await sb.from('transactions').select('*, users(full_name, phone_number)').eq('status', 'pending');
    document.getElementById('pending-regs').innerHTML = regs.map(r => `
        <div class="row">
            <div>${r.users.full_name}<br><small>${r.users.phone_number} | ₹${r.amount} | ${r.utr_number}</small></div>
            <div>
                <button onclick="window.approveReg('${r.user_id}', '${r.id}', '${r.package_id}')" style="background:green;">✓</button>
                <button onclick="window.rejectReg('${r.id}')" style="background:red;">✗</button>
            </div>
        </div>`).join('');

    // Withdrawals
    const { data: wds } = await sb.from('withdrawal_history').select('*, users(phone_number)').eq('status', 'pending');
    document.getElementById('pending-withdrawals').innerHTML = wds.map(w => `
        <div class="row">
            <div>${w.users.phone_number}<br>₹${w.amount} | ${w.upi_id}</div>
            <div>
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:green;">Pay</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red;">Refund</button>
            </div>
        </div>`).join('');

    // Videos
    const { data: vids } = await sb.from('videos').select('*');
    document.getElementById('admin-videos').innerHTML = vids.map(v => `
        <div class="row">${v.description} <button onclick="window.deleteVideo(${v.id})" style="background:red;">Del</button></div>
    `).join('');
};

window.approveReg = async function(uid, tid, pkgId) {
    const { data: pkg } = await sb.from('packages').select('*').eq('id', pkgId).single();
    await sb.from('users').update({ is_approved: true, base_earning_rate: pkg.base_rate_per_min }).eq('id', uid);
    await sb.from('transactions').update({ status: 'approved' }).eq('id', tid);
    alert("Approved!"); window.loadAdminPanel();
};

window.rejectReg = async function(tid) {
    if(!confirm("Reject this User?")) return;
    await sb.from('transactions').update({ status: 'rejected' }).eq('id', tid);
    alert("Rejected!"); window.loadAdminPanel();
};

window.rejectWithdrawal = async function(wid) {
    if(!confirm("Reject & Refund money to user?")) return;
    const { error } = await sb.rpc('reject_withdrawal_refund', { withdrawal_id_input: wid });
    if(error) alert(error.message); else { alert("Refunded!"); window.loadAdminPanel(); }
};

window.approveWithdrawal = async function(wid) {
    await sb.from('withdrawal_history').update({ status: 'approved' }).eq('id', wid);
    alert("Marked as Paid"); window.loadAdminPanel();
};

window.updateSettings = async function() {
    await sb.from('admin_settings').update({ upi_id: document.getElementById('admin-upi').value, qr_url: document.getElementById('admin-qr').value }).eq('id', 1);
    alert("Saved!");
};

window.addVideo = async function() {
    await sb.from('videos').insert([{ description: document.getElementById('vid-title').value, video_link: document.getElementById('vid-link').value }]);
    alert("Added"); window.loadAdminPanel();
};

window.deleteVideo = async function(vid) { await sb.from('videos').delete().eq('id', vid); window.loadAdminPanel(); };

window.copyReferralLink = function() {
    const el = document.getElementById("referral-link");
    el.select(); navigator.clipboard.writeText(el.value);
    alert("Copied!");
};
window.logoutUser = () => { localStorage.clear(); window.location.href = 'index.html'; };

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if(params.get('ref') && document.getElementById('reg-referrer-id')) {
        document.getElementById('reg-referrer-id').value = params.get('ref');
        window.toggleForm('register');
    }
});
                                 
