// --- CONFIGURATION ---
const SUPABASE_URL = 'https://xvdrfkppeonjpxhmboch.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZHJma3BwZW9uanB4aG1ib2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Mzc0NzEsImV4cCI6MjA4MzIxMzQ3MX0.g8yRmeYdttI2Wqj6eu0rap_wOFsM-vJTHlY3DWSgZCU';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL VARIABLES ---
window.userRate = 0;
window.minWithdraw = 1500; 
window.withdrawLimitDays = 7; 

// Smart Timer Variables
window.ytPlayer = null;
window.watchInterval = null;
window.actualSecondsWatched = 0;
window.requiredSeconds = 600; 

// ==========================================
// 1. AUTH & SETTINGS
// ==========================================

window.toggleForm = (form) => {
    document.getElementById('login-box').style.display = (form === 'login') ? 'block' : 'none';
    document.getElementById('reg-box').style.display = (form === 'register') ? 'block' : 'none';
    if(form === 'register') window.fetchAdminSettings();
};

window.fetchAdminSettings = async function() {
    const { data } = await sb.from('admin_settings').select('*').single();
    if(!data) return;

    if(document.getElementById('pay-upi-display')) {
        document.getElementById('pay-upi-display').innerText = data.upi_id;
    }
    if(document.getElementById('pay-qr-img')) {
        document.getElementById('pay-qr-img').src = data.qr_url;
    }

    if(document.getElementById('upgrade-upi-display')) {
        document.getElementById('upgrade-upi-display').innerText = data.upi_id;
    }
    if(document.getElementById('upgrade-qr-img')) {
        document.getElementById('upgrade-qr-img').src = data.qr_url;
    }
    
    if(data.min_withdraw) window.minWithdraw = data.min_withdraw;
    if(data.withdraw_days) window.withdrawLimitDays = data.withdraw_days;

    if(document.getElementById('admin-upi')) {
        document.getElementById('admin-upi').value = data.upi_id;
        document.getElementById('admin-qr').value = data.qr_url;
        document.getElementById('admin-min-withdraw').value = data.min_withdraw;
        document.getElementById('admin-withdraw-days').value = data.withdraw_days;
    }
};

window.togglePay = function() {
    const pkg = document.getElementById('package-select').value;
    const sec = document.getElementById('payment-section');
    if(sec) {
        if (pkg === 'FREE_PLAN' || pkg === "") sec.style.display = 'none';
        else sec.style.display = 'block';
    }
};

window.handleUserLogin = async function() {
    const phone = document.getElementById('login-phone').value;
    const pass = document.getElementById('login-password').value;
    if(!phone || !pass) return alert("Please fill details");

    const { data: user, error } = await sb.from('users').select('*').eq('phone_number', phone).single();
    if(error || !user) { alert("User not found or connection error."); return; }

    if(user && user.password_hash === pass) {
        localStorage.setItem('user_id', user.id);
        window.location.href = 'dashboard.html';
    } else { alert("Invalid Credentials!"); }
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
    const { data: newUser, error } = await sb.from('users').insert([{ 
        full_name: name, phone_number: phone, password_hash: pass, 
        package_id: pkgId, is_approved: isFree, referred_by_id: refUUID 
    }]).select().single();

    if(error) {
        if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; }
        if(error.message.includes('unique constraint') || error.code === '23505') return alert("Phone Number already registered!");
        return alert("Error: " + error.message);
    }

    if(!isFree) {
        if(!trans) { if(btn) { btn.disabled = false; btn.innerText = "REGISTER NOW"; } return alert("UTR Required!"); }
        const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
        await sb.from('transactions').insert([{ user_id: newUser.id, amount: pkg.price, utr_number: trans, package_id: pkgId }]);
        alert("Registration Successful! Wait for Approval.");
    } else { alert("Free Account Created!"); }
    window.location.reload();
};

// ==========================================
// 2. DASHBOARD & UTILS
// ==========================================

window.loadDashboardData = async function() {
    const uid = localStorage.getItem('user_id');
    if(!uid) return window.location.href = 'index.html';
    
    window.fetchAdminSettings();

    const { data: user } = await sb.from('users').select('*').eq('id', uid).single();
    if(!user) return;

    document.getElementById('user-phone').innerText = `ID: ${user.phone_number}`;
    document.getElementById('total-earning').innerText = `₹ ${parseFloat(user.total_earnings).toFixed(2)}`;
    document.getElementById('withdrawable-amount').innerText = `₹ ${parseFloat(user.withdrawable_amount).toFixed(2)}`;
    document.getElementById('plan-name').innerText = user.package_id; 
    
    window.userRate = (parseFloat(user.base_earning_rate) || 0) + (parseFloat(user.extra_earning_rate) || 0);
    document.getElementById('current-rate').innerText = `₹ ${window.userRate.toFixed(4)}`;
    
    const meter = document.querySelector('.speedo-arc');
    if(meter) {
        let rotation = -45 + (window.userRate * 20); if(rotation > 135) rotation = 135; 
        meter.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    }

    const link = `${window.location.origin}/index.html?ref=${user.id}`;
    if(document.getElementById('referral-link')) document.getElementById('referral-link').value = link;
    
    const upgradeBtn = document.getElementById('upgrade-trigger-btn');
    const statusMsg = document.getElementById('upgrade-status-msg');

    if(upgradeBtn && statusMsg) {
        const { data: pendingReq } = await sb.from('upgrade_requests').select('*').eq('user_id', uid).eq('status', 'pending').maybeSingle();
        if (pendingReq) {
            upgradeBtn.style.display = 'none';
            statusMsg.style.display = 'block';
        } else {
            statusMsg.style.display = 'none';
            if(user.package_id === 'FREE_PLAN' || user.package_id === 'PKG_500') upgradeBtn.style.display = 'block';
            else upgradeBtn.style.display = 'none';
        }
    }

    if(user.is_approved) window.fetchVideos();
    else document.getElementById('video-list').innerHTML = "<div style='text-align:center; padding:20px; color:orange;'>Account Pending Approval...</div>";
};

// ==========================================
// 3. DYNAMIC VIDEO LOGIC (ADMIN DURATION)
// ==========================================

window.fetchVideos = async function() {
    const uid = localStorage.getItem('user_id'); 
    const { data: vids } = await sb.from('videos').select('*').eq('is_active', true);
    const runningVidId = localStorage.getItem(`running_vid_${uid}`);
    
    if (runningVidId) {
        const vidData = vids.find(v => v.id == runningVidId);
        if(vidData) window.setupSmartPlayer(vidData.video_link, runningVidId, vidData.duration);
        else { localStorage.removeItem(`running_vid_${uid}`); location.reload(); }
    } else {
        document.getElementById('active-video-container').style.display = 'none';
        document.getElementById('video-list').style.display = 'block';
        const list = document.getElementById('video-list');
        list.innerHTML = vids.map(v => {
            const dur = v.duration || 600; 
            const mins = Math.floor(dur / 60);
            return `
            <div style="background:white; padding:15px; margin-bottom:10px; border-radius:15px; display:flex; justify-content:space-between; align-items:center;">
                <div style="width:65%;">
                    <div style="font-weight:bold; font-size:13px; color:#1e293b;">${v.description}</div>
                    <div style="font-size:10px; color:#64748b;">Duration: ${mins} Mins</div>
                </div>
                <button onclick="window.startVideo(${v.id}, '${v.video_link}', ${dur})" 
                    style="padding:8px 16px; border:none; border-radius:8px; color:white; font-weight:bold; background:#0f172a; cursor:pointer;">
                    WATCH
                </button>
            </div>`;
        }).join('');
    }
};

window.startVideo = function(vid, link, duration) {
    const uid = localStorage.getItem('user_id');
    localStorage.setItem(`running_vid_${uid}`, vid);
    localStorage.setItem(`vid_duration_${uid}`, duration);
    window.setupSmartPlayer(link, vid, duration);
};

function getYouTubeID(url) {
    var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[2].length == 11) ? match[2] : null;
}

window.setupSmartPlayer = function(link, vid, duration) {
    if(!duration) duration = parseInt(localStorage.getItem(`vid_duration_${localStorage.getItem('user_id')}`)) || 600;
    window.requiredSeconds = duration;

    const videoId = getYouTubeID(link);
    if(!videoId) return alert("Invalid YouTube Link");

    document.getElementById('video-list').style.display = 'none';
    const container = document.getElementById('active-video-container');
    container.style.display = 'block';

    const placeholder = document.getElementById('player-placeholder');
    placeholder.innerHTML = `
        <iframe id="my-yt-frame" width="100%" height="250" 
        src="https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=1&rel=0&controls=0" 
        frameborder="0" allow="autoplay; encrypted-media" allowfullscreen 
        style="border-radius: 10px;"></iframe>
    `;
    connectSmartAPI();
};

function connectSmartAPI() {
    if (typeof YT !== 'undefined' && YT.Player) {
        window.ytPlayer = new YT.Player('my-yt-frame', {
            events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
        });
    } else {
        var tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        window.onYouTubeIframeAPIReady = function() { connectSmartAPI(); };
    }
}

function onPlayerReady(event) { startWatchTimer(); }

function onPlayerStateChange(event) {
    const statusText = document.getElementById('video-status');
    if (event.data == YT.PlayerState.PLAYING) {
        statusText.innerText = "Status: Playing (Timer Running...)"; statusText.style.color = "green";
    } else if (event.data == YT.PlayerState.PAUSED) {
        statusText.innerText = "Status: Paused (Timer Stopped)"; statusText.style.color = "red";
    } else if (event.data == YT.PlayerState.ENDED) {
        statusText.innerText = "Status: Video Ended";
        if (window.actualSecondsWatched < window.requiredSeconds) {
            alert("Video ended but required time not met. Replaying...");
            if(window.ytPlayer && window.ytPlayer.playVideo) window.ytPlayer.playVideo();
        }
    }
}

function startWatchTimer() {
    if (window.watchInterval) clearInterval(window.watchInterval);
    window.watchInterval = setInterval(() => {
        let isPlaying = false;
        if (window.ytPlayer && typeof window.ytPlayer.getPlayerState === 'function') {
            if (window.ytPlayer.getPlayerState() === 1) isPlaying = true;
        } else if (document.getElementById('my-yt-frame')) isPlaying = true;

        if (isPlaying) {
            window.actualSecondsWatched++;
            const mins = Math.floor(window.actualSecondsWatched / 60);
            const secs = window.actualSecondsWatched % 60;
            const targetMins = Math.floor(window.requiredSeconds / 60);
            const timerDisplay = document.getElementById('video-timer');
            if(timerDisplay) timerDisplay.innerText = `Watched: ${mins}m ${secs}s / ${targetMins}m 00s`;

            if (window.actualSecondsWatched >= window.requiredSeconds) {
                clearInterval(window.watchInterval);
                if(timerDisplay) { timerDisplay.innerText = "TASK COMPLETED!"; timerDisplay.style.color = "#22c55e"; }
                const btn = document.getElementById('claim-btn');
                if(btn) {
                    btn.disabled = false; btn.innerText = "CLAIM REWARD NOW";
                    btn.style.background = "#22c55e"; btn.style.color = "white";
                    btn.onclick = () => window.claimEarnings();
                }
            }
        }
    }, 1000);
}

// ==========================================
// MONETAG DIRECT LINK TRIGGER (NEW)
// ==========================================
window.claimEarnings = async function() {
    // --- MONETAG DIRECT LINK TRIGGER ---
    // Jab user click karega, pehle ye link naye tab mein khulega
    window.open('https://omg10.com/4/10825577', '_blank');

    const uid = localStorage.getItem('user_id');
    const minsWatched = window.actualSecondsWatched / 60;
    const targetMins = window.requiredSeconds / 60;

    // Security Check: Kya user ne poora video dekha?
    if (window.actualSecondsWatched < (window.requiredSeconds - 5)) {
        return alert(`Timer incomplete! Please watch for ${targetMins} minutes.`);
    }

    const btn = document.getElementById('claim-btn');
    if(btn) {
        btn.innerText = "Verifying..."; 
        btn.disabled = true;
    }

    // Earning Update Logic
    const amount = window.userRate * targetMins; 
    const { error } = await sb.rpc('update_user_earnings', { 
        user_id_input: uid, 
        amount_to_add: amount, 
        minutes_claimed: minsWatched 
    });
    
    if(error) { 
        alert("Error: " + error.message); 
        location.reload(); 
    } else {
        localStorage.removeItem(`running_vid_${uid}`);
        alert(`Success! ₹${amount.toFixed(2)} added.`);
        location.reload();
    }
};

// ==========================================
// 4. WITHDRAWAL SYSTEM (DYNAMIC LIMITS)
// ==========================================

window.openWithdrawModal = function() {
    const cleanForm = `
        <h3 style="margin-top:0; color:#0f172a;">Bank Withdrawal</h3>
        <p style="font-size:12px; color:red; background:#fee2e2; padding:5px; border-radius:5px;">
           Limit: ₹${window.minWithdraw} - ₹3000 per transaction.<br>
           Frequency: Once every ${window.withdrawLimitDays} days.
        </p>
        <label style="font-size:12px; font-weight:bold; color:#64748b;">Amount</label>
        <input type="number" id="withdrawal-amount-input" placeholder="Enter Amount" style="width:100%; margin-bottom:15px;">
        <label style="font-size:12px; font-weight:bold; color:#64748b;">Bank Account Number</label>
        <input type="text" id="withdrawal-acc-input" placeholder="Ex: 1234567890" style="width:100%; margin-bottom:15px;">
        <label style="font-size:12px; font-weight:bold; color:#64748b;">IFSC Code</label>
        <input type="text" id="withdrawal-ifsc-input" placeholder="Ex: SBIN0001234" style="text-transform:uppercase; width:100%;">
        <button onclick="window.handleWithdrawal()" style="width:100%; padding:18px; margin-top:20px; background:#10b981; color:white; border:none; border-radius:16px; font-weight:bold;">SUBMIT REQUEST</button>
    `;
    document.getElementById('sheet-content').innerHTML = cleanForm; openSheet();
};

window.handleWithdrawal = async function() {
    const amt = parseFloat(document.getElementById('withdrawal-amount-input').value);
    const acc = document.getElementById('withdrawal-acc-input').value;
    const ifsc = document.getElementById('withdrawal-ifsc-input').value;
    const uid = localStorage.getItem('user_id');

    if(amt < window.minWithdraw) return alert(`Minimum Withdrawal is ₹${window.minWithdraw}`);
    if(amt > 3000) return alert("Maximum Withdrawal limit is ₹3000 per transaction."); 
    if(!acc || !ifsc) return alert("Please fill Bank Account & IFSC Code");

    const { data: lastW } = await sb.from('withdrawal_history').select('created_at').eq('user_id', uid).order('created_at', {ascending: false}).limit(1);
    if (lastW && lastW.length > 0) {
        const diffDays = Math.ceil(Math.abs(new Date() - new Date(lastW[0].created_at)) / (1000 * 60 * 60 * 24)); 
        if(diffDays < window.withdrawLimitDays) return alert(`You can withdraw again in ${window.withdrawLimitDays - diffDays} days.`);
    }

    const { error } = await sb.rpc('request_withdrawal', { user_id_input: uid, amount_req: amt, acc_num_input: acc, ifsc_input: ifsc });
    if(error) alert("Failed: " + error.message); else { alert("Request Sent!"); location.reload(); }
};

window.loadWithdrawHistory = async function() {
    const uid = localStorage.getItem('user_id');
    const { data } = await sb.from('withdrawal_history').select('*').eq('user_id', uid).order('created_at', {ascending:false});
    let html = `<h3 style="margin-top:0;">Withdrawal History</h3><div style="max-height:300px; overflow-y:auto;">`;
    if(!data || data.length === 0) html += "<p>No history yet.</p>";
    else data.forEach(w => {
        let color = w.status === 'approved' ? 'green' : (w.status === 'rejected' ? 'red' : 'orange');
        let details = w.account_number ? `<strong>Acc:</strong> ${w.account_number} <br><small>IFSC: ${w.ifsc_code}</small>` : `UPI: ${w.upi_id}`;
        html += `<div style="background:#f1f5f9; padding:10px; margin-bottom:10px; border-radius:10px; font-size:12px;">
            <div style="display:flex; justify-content:space-between;"><strong style="font-size:14px;">₹${w.amount}</strong><span style="color:${color}; font-weight:bold;">${w.status.toUpperCase()}</span></div>
            <div style="color:#475569; margin-top:5px; line-height:1.4;">${details}</div><span style="color:#94a3b8; font-size:10px;">${new Date(w.created_at).toLocaleDateString()}</span></div>`;
    });
    html += `</div><button onclick="closeSheet()" style="width:100%; padding:15px; margin-top:10px; border:none; background:#cbd5e1; border-radius:10px;">Close</button>`;
    document.getElementById('sheet-content').innerHTML = html; openSheet();
};

// ==========================================
// 5. PAYMENT & UPGRADE SYSTEM
// ==========================================

window.payNow = async function() {
    const pkgId = document.getElementById('package-select').value;
    if(!pkgId || pkgId === 'FREE_PLAN') return;
    const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
    const { data: set } = await sb.from('admin_settings').select('upi_id').single();
    // UPI Deep link for mobile apps
    window.location.href = `upi://pay?pa=${set.upi_id}&pn=TaskBoost&am=${pkg.price}&cu=INR`;
};

window.handleUpgradePay = async function() {
    const pkgId = document.getElementById('upgrade-package-select').value;
    if(!pkgId) return alert("Select a Package first!");
    const { data: pkg } = await sb.from('packages').select('price').eq('id', pkgId).single();
    const { data: set } = await sb.from('admin_settings').select('upi_id').single();
    window.location.href = `upi://pay?pa=${set.upi_id}&pn=TaskBoostUpgrade&am=${pkg.price}&cu=INR`;
};

window.submitUpgradeRequest = async function() {
    const uid = localStorage.getItem('user_id');
    const pkgId = document.getElementById('upgrade-package-select').value;
    const utr = document.getElementById('upgrade-utr').value;
    
    if(!utr || utr.length < 12) return alert("Enter valid 12-digit UTR Number");
    
    const { error } = await sb.from('upgrade_requests').insert([
        { user_id: uid, package_id: pkgId, utr_number: utr, status: 'pending' }
    ]);
    
    if(error) alert("Error: " + error.message);
    else { 
        alert("Upgrade Request Sent! Please wait for admin approval."); 
        window.closeUpgradeModal(); 
        location.reload();
    }
};

window.copyRegUPI = function() { 
    navigator.clipboard.writeText(document.getElementById('pay-upi-display').innerText).then(() => alert("UPI ID Copied!")); 
};

window.copyUPI = function() { 
    navigator.clipboard.writeText(document.getElementById('upgrade-upi-display').innerText).then(() => alert("UPI ID Copied!")); 
};

// ==========================================
// 6. ADMIN PANEL LOGIC (COMPLETE)
// ==========================================

window.adminLogin = function() {
    const id = document.getElementById('admin-id').value;
    const pass = document.getElementById('admin-pass').value;
    // Hardcoded Admin Credentials as per your request
    if(id === "7014" && pass === "5845") { 
        localStorage.setItem('admin_session', 'true'); 
        window.location.href = 'admin.html'; 
    } 
    else alert("Invalid Admin Credentials");
};

window.loadAdminPanel = async function() {
    if(localStorage.getItem('admin_session') !== 'true') return window.location.href = 'index.html';
    
    // Load Settings
    const { data: set } = await sb.from('admin_settings').select('*').single();
    if(set) {
        document.getElementById('admin-upi').value = set.upi_id;
        document.getElementById('admin-qr').value = set.qr_url;
        if(document.getElementById('admin-min-withdraw')) document.getElementById('admin-min-withdraw').value = set.min_withdraw;
        if(document.getElementById('admin-withdraw-days')) document.getElementById('admin-withdraw-days').value = set.withdraw_days;
    }

    // Load Pending Registrations (New Users who paid)
    const { data: regs } = await sb.from('transactions').select('*, users(full_name, phone_number)').eq('status', 'pending');
    document.getElementById('pending-regs').innerHTML = regs.map(r => `
        <div class="row">
            <div>
                <strong>${r.users ? r.users.full_name : 'User'}</strong><br>
                <small>📱 ${r.users ? r.users.phone_number : '--'}</small><br>
                <small style="color:blue;">Plan: ${r.package_id}</small> | <small>₹${r.amount}</small><br>
                <small>UTR: ${r.utr_number}</small>
            </div>
            <div>
                <button onclick="window.approveReg('${r.user_id}', '${r.id}', '${r.package_id}')" style="background:green; color:white;">Approve</button>
                <button onclick="window.rejectReg('${r.id}')" style="background:red; color:white;">Reject</button>
            </div>
        </div>`).join('');

    // Load Upgrade Requests
    const { data: ups } = await sb.from('upgrade_requests').select('*, users(phone_number)').eq('status', 'pending');
    document.getElementById('pending-upgrades').innerHTML = ups.map(u => `
        <div class="row">
            <div>
                <strong>📱 ${u.users ? u.users.phone_number : 'Unknown'}</strong><br>
                <span style="background:#22c55e; color:white; padding:2px 5px; font-size:10px; border-radius:4px;">Request: ${u.package_id}</span><br>
                <small>UTR: ${u.utr_number}</small>
            </div>
            <div>
                <button onclick="window.approveUpgrade('${u.id}')" style="background:green; color:white;">Approve</button>
                <button onclick="window.rejectUpgrade('${u.id}')" style="background:red; color:white;">Reject</button>
            </div>
        </div>`).join('');

    // Load Withdrawal Requests
    const { data: wds } = await sb.from('withdrawal_history').select('*, users(phone_number)').eq('status', 'pending');
    document.getElementById('pending-withdrawals').innerHTML = wds.map(w => {
        let details = w.account_number ? `Ac: ${w.account_number} | IFSC: ${w.ifsc_code}` : `UPI: ${w.upi_id}`;
        return `
        <div class="row">
            <div><strong>${w.users ? w.users.phone_number : 'User'}</strong><br><span style="color:green; font-weight:bold;">₹${w.amount}</span><br><small>${details}</small></div>
            <div>
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:green; color:white;">Mark Paid</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red; color:white;">Reject</button>
            </div>
        </div>`;
    }).join('');

    // Load Active Videos
    const { data: vids } = await sb.from('videos').select('*');
    document.getElementById('admin-videos').innerHTML = vids.map(v => {
        const mins = Math.floor((v.duration || 600) / 60);
        return `<div class="row"><div style="width:70%;"><strong>${v.description}</strong><br><small>Duration: ${mins} Mins</small></div><button onclick="window.deleteVideo(${v.id})" style="background:red; color:white;">Del</button></div>`;
    }).join('');
};

window.approveReg = async function(uid, tid, pkgId) {
    const { error: userErr } = await sb.rpc('admin_action_approve_user', { target_user_id: uid, pkg_id: pkgId, admin_pass: '5845' });
    if(userErr) return alert("Failed: " + userErr.message);
    await sb.rpc('admin_approve_transaction', { trans_id: tid });
    alert("User Approved Successfully!"); 
    window.loadAdminPanel(); 
};

window.rejectReg = async function(tid) {
    if(!confirm("Are you sure?")) return;
    const { error } = await sb.rpc('admin_reject_transaction', { trans_id: tid });
    if(error) alert(error.message); else { alert("Rejected!"); window.loadAdminPanel(); }
};

window.approveUpgrade = async function(rid) {
    const { error } = await sb.rpc('approve_upgrade_request', { request_id: rid });
    if(error) alert(error.message); else { alert("Upgrade Done!"); window.loadAdminPanel(); }
};

window.rejectUpgrade = async function(rid) {
    const { error } = await sb.rpc('admin_reject_upgrade_request', { req_id: rid });
    if(error) alert(error.message); else { alert("Rejected!"); window.loadAdminPanel(); }
};

window.approveWithdrawal = async function(wid) {
    const { error } = await sb.rpc('admin_approve_withdrawal', { withdraw_id: wid });
    if(error) alert(error.message); else { alert("Marked Paid!"); window.loadAdminPanel(); }
};

window.rejectWithdrawal = async function(wid) {
    const { error } = await sb.rpc('reject_withdrawal_refund', { withdrawal_id_input: wid });
    if(error) alert(error.message); else { alert("Rejected & Refunded to User!"); window.loadAdminPanel(); }
};

window.updateSettings = async function() {
    const upi = document.getElementById('admin-upi').value;
    const qr = document.getElementById('admin-qr').value;
    const minW = parseInt(document.getElementById('admin-min-withdraw').value);
    const wDays = parseInt(document.getElementById('admin-withdraw-days').value);
    
    const { error } = await sb.rpc('admin_update_settings', { 
        new_upi: upi, new_qr: qr, min_w: minW, w_days: wDays 
    });
    
    if(error) alert("Error: " + error.message); 
    else alert("Settings Saved!");
};

window.addVideo = async function() {
    const title = document.getElementById('vid-title').value;
    const link = document.getElementById('vid-link').value;
    const mins = parseInt(document.getElementById('vid-duration').value);
    
    if(!title || !link || !mins) return alert("Please fill all fields!");
    
    const { error } = await sb.rpc('admin_add_video', { 
        title: title, link: link, dur: mins * 60 
    });
    
    if(error) alert("Error: " + error.message); 
    else { alert("Video Added!"); window.loadAdminPanel(); }
};

window.deleteVideo = async function(vid) { 
    if(!confirm("Delete this Video?")) return;
    const { error } = await sb.rpc('admin_delete_video', { vid_id: vid });
    if(error) alert(error.message); 
    else window.loadAdminPanel(); 
};

// --- MISC ---
window.copyReferralLink = function() { 
    const el = document.getElementById("referral-link"); 
    if(el) { 
        el.select(); 
        navigator.clipboard.writeText(el.value); 
        alert("Referral Link Copied!"); 
    } 
};

window.logoutUser = () => { 
    localStorage.clear(); 
    window.location.href = 'index.html'; 
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    // Handle Referral URL
    const params = new URLSearchParams(window.location.search);
    if(params.get('ref') && document.getElementById('reg-referrer-id')) {
        document.getElementById('reg-referrer-id').value = params.get('ref');
        if(window.toggleForm) window.toggleForm('register');
    }
    
    // If on Admin Page, load data
    if(window.location.pathname.includes('admin.html')) {
        window.loadAdminPanel();
    }
});
        
