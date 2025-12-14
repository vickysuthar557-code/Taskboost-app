// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://zdkyadihslputswgmncz.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpka3lhZGloc2xwdXRzd2dtbmN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1NTUyODUsImV4cCI6MjA4MTEzMTI4NX0.cEi1wKw640hHuiFOxSC-zR6WiAzD8xkRxgEptuzuQGM';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.currentTimer = null;
window.userRate = 0;

// FINAL & CORRECT TABLE NAMES
const SETTINGS_TABLE = 'admin_settings'; 
const VIDEOS_TABLE = 'videos'; 
const USERS_TABLE = 'users'; 

// Utility: URL se Referral ID nikalna 
window.getReferralId = function() {
    const params = new URLSearchParams(window.location.search);
    let refId = params.get('ref');
    if (!refId) {
        refId = params.get('REF');
    }
    return refId || null; 
};


// --- 2. NAVIGATION & REGISTER UPI FIXES ---

window.toggleSection = function(id) {
    const ids = ['login-section', 'register-section', 'admin-login-section'];
    ids.forEach(s => {
        const el = document.getElementById(s);
        if(el) el.style.display = (s === id) ? 'block' : 'none';
    });
};

window.showRegister = function() {
    window.toggleSection('register-section');
    window.fetchPackages();
    window.fetchRegisterUpi();
};

window.showLogin = function() { window.toggleSection('login-section'); };
window.showAdminLogin = function() { window.toggleSection('admin-login-section'); }; 

// UPI ID fetch karke register page par dikhayega (Uses 'upi_id' and 'qr_url')
window.fetchRegisterUpi = async function() {
    const { data } = await sb.from(SETTINGS_TABLE).select('upi_id, qr_url').eq('id', 1).single();
    const upiEl = document.getElementById('current-upi-id'); 
    const qrImg = document.getElementById('upi-qr-code');
    const qrLoad = document.getElementById('qr-loading');

    if(upiEl) upiEl.textContent = (data && data.upi_id) ? data.upi_id : 'N/A';
    if(qrImg && qrLoad) {
        if (data && data.qr_url) {
            qrImg.src = data.qr_url;
            qrLoad.style.display = 'none';
        } else {
             qrLoad.textContent = 'QR Not Set';
        }
    }
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

// FINAL CORRECTED handleRegistration (Input Box logic)
window.handleRegistration = async function() {
    const phone = document.getElementById('reg-phone').value;
    const pass = document.getElementById('reg-password').value;
    const pkgId = document.getElementById('package-select').value;
    const trans = document.getElementById('trans-details').value;
    
    // FINAL FIX: Input Box ID 'reg-referrer-id' से value निकालो
    const refIdInput = document.getElementById('reg-referrer-id');
    const refId = refIdInput ? refIdInput.value.trim() : null; 
    
    // Value check (null/empty string)
    const isValidRefId = refId && refId.length > 5; 

    if(!phone || !pass || !pkgId || !trans) return alert("Fill all required details (including Transaction ID)!");

    const { data: pkg } = await sb.from('packages').select('*').eq('id', pkgId).single();
    if(!pkg) return alert("Selected package not found.");
    
    const userData = {
        phone_number: phone, 
        password_hash: pass, 
        package_id: pkgId,
        base_earning_rate: pkg.base_rate_per_min, 
        is_approved: false,
        extra_earning_rate: 0 // Default starting rate
    };
    
    if (isValidRefId) {
        userData.referred_by_id = refId; // Store the referrer's ID
    }

    const { data: newUser, error: userError } = await sb.from(USERS_TABLE).insert([userData]).select();

    if(userError) {
         console.error("Supabase Insert Error:", userError);
         return alert("Registration Error: " + userError.message + ". Check if the Referral ID is a valid UUID.");
    }

    await sb.from('transactions').insert([{ 
        user_id: newUser[0].id, amount: pkg.price, user_payment_details: trans, status: 'pending' 
    }]);
    alert("Registered! Wait for admin approval.");
    window.toggleSection('login-section');
};


window.fetchPackages = async function() {
    const { data } = await sb.from('packages').select('*').order('price');
    const sel = document.getElementById('package-select');
    if(sel && data) {
        sel.innerHTML = '<option value="">Select Package</option>';
        data.forEach(p => { sel.innerHTML += `<option value="${p.id}">${p.package_name} - ₹${p.price}</option>`; });
    }
};

// --- 4. DASHBOARD & TIMER LOGIC (10 MIN LIMIT) ---

window.loadDashboardData = async function() {
    const uid = localStorage.getItem('user_id');
    if(!uid) return;
    
    const { data: user } = await sb.from(USERS_TABLE).select('*').eq('id', uid).single();
    
    if(user) {
        document.getElementById('user-phone').textContent = user.phone_number;
        
        // FIX: Display Total Earnings
        document.getElementById('total-earning').textContent = `₹ ${parseFloat(user.total_earnings || 0).toFixed(2)}`;
        
        // FIX: Display Withdrawable Amount
        const withdrawAmtEl = document.getElementById('withdrawable-amount');
        if(withdrawAmtEl) {
            withdrawAmtEl.textContent = `₹ ${parseFloat(user.withdrawable_amount || 0).toFixed(2)}`;
        }
        
        // Calculate Combined Rate (Base + Referral Rate Increase)
        window.userRate = (parseFloat(user.base_earning_rate) || 0) + (parseFloat(user.extra_earning_rate) || 0);
        document.getElementById('current-rate').textContent = `₹ ${window.userRate.toFixed(4)} per minute`;

        // Display Referral Link
        const referralLinkEl = document.getElementById('referral-link');
        if(referralLinkEl) {
             referralLinkEl.value = `${window.location.origin}/index.html?ref=${user.id}`;
        }
        
        if(user.is_approved) { window.fetchAndRenderVideos(); }
    }
};

// FIX: Hiding real-time data and changing button text to Claim
window.fetchAndRenderVideos = async function() {
    const { data: vids } = await sb.from(VIDEOS_TABLE).select('*').eq('is_active', true);
    const list = document.getElementById('video-list');
    if(!list) return;

    if(!vids || vids.length === 0) {
        list.innerHTML = "<p style='text-align:center; color:gray;'>No active videos found. Ask admin to add videos.</p>";
        return;
    }
    
    const curV = localStorage.getItem('running_vid');
    const startBtnStyle = 'background:#007bff; color:white; width:100%; padding:10px; border:none; border-radius:5px;';
    const stopBtnStyle = 'background:#ff4747; color:white; width:100%; padding:10px; border:none; border-radius:5px;';
    
    list.innerHTML = vids.map(v => {
        const active = (curV == v.id);
        return `
            <div style="border:1px solid #ddd; padding:15px; margin-bottom:10px; border-radius:10px;">
                <strong>${v.description}</strong>
                <p id="timer-${v.id}" style="display:none;">Time: 0s</p> 
                <p id="earning-${v.id}" style="display:none; color:green;">Earned: ₹0.00</p>
                <button id="start-btn-${v.id}" style="display:${active?'none':'block'}; ${startBtnStyle}" onclick="window.startEarningTimer(${v.id}, '${v.video_link}')">Watch Video</button>
                <button id="stop-btn-${v.id}" style="display:${active?'block':'none'}; ${stopBtnStyle}" onclick="window.stopEarningTimer(${v.id})">Claim</button>
            </div>`;
    }).join('');
    if(curV) window.resumeTimer(curV, localStorage.getItem('start_time'));
};

window.startEarningTimer = function(vid, link) {
    if(window.currentTimer) return alert("Stop previous video!");
    const start = Date.now();
    localStorage.setItem('running_vid', vid);
    localStorage.setItem('start_time', start);
    window.open(link, '_blank');
    window.resumeTimer(vid, start);
};

// FIX: Removing hidden element update logic from the timer
window.resumeTimer = function(vid, startTime) {
    startTime = parseInt(startTime);
    if(window.currentTimer) clearInterval(window.currentTimer);
    
    window.currentTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        
        if(elapsed >= 600000) {
            clearInterval(window.currentTimer);
            alert("10 minutes complete! Saving earnings...");
            window.stopEarningTimer(vid);
            return;
        }

    }, 1000);
};

window.stopEarningTimer = async function(vid) {
    clearInterval(window.currentTimer);
    const start = localStorage.getItem('start_time');
    if(!start) return;
    
    let mins = (Date.now() - parseInt(start)) / 60000;
    if(mins > 10) mins = 10; 

    const total = window.userRate * mins;
    localStorage.removeItem('running_vid');
    localStorage.removeItem('start_time');
    window.currentTimer = null;

    if(total > 0.001) {
        await sb.rpc('update_user_earnings', { user_id_input: localStorage.getItem('user_id'), amount_to_add: total });
    }
    location.reload();
};


// FINAL Withdrawal Logic (Limit 999 and request_amount fix)
window.handleWithdrawal = async function() {
    
    const uid = localStorage.getItem('user_id');
    if(!uid) return alert("CRITICAL ERROR: User not logged in (UID missing).");

    const amountInput = document.getElementById('withdrawal-amount-input');
    const upiInput = document.getElementById('withdrawal-upi-input');
    
    if (!amountInput || !upiInput) {
        return alert("CRITICAL ERROR: Withdrawal form IDs missing. Check dashboard.html IDs.");
    }

    const amount = parseFloat(amountInput.value);
    const upiId = upiInput.value.trim();
    
    if (amount <= 0 || !upiId) {
        return alert("CHECK 3: Please enter a valid amount and UPI ID.");
    }
    
    // 1. Check current withdrawable balance
    const { data: user, error: fetchError } = await sb.from(USERS_TABLE).select('withdrawable_amount').eq('id', uid).single();
    if(fetchError || !user) return alert("ERROR 5A: Could not fetch user data for withdrawal check. Supabase Fetch Error.");

    const currentBalance = parseFloat(user.withdrawable_amount || 0);

    // Minimum withdrawal limit check (FIXED: ₹999)
    if (amount < 999) { 
        return alert("CHECK 5B: Minimum withdrawal amount is ₹999.");
    }
    
    if (amount > currentBalance) {
        return alert(`CHECK 5C: Insufficient balance. Your current withdrawable amount is ₹${currentBalance.toFixed(2)}.`);
    }

    // 2. Insert withdrawal request (FIXED: 'request_amount' column name)
    const { error: insertError } = await sb.from('withdrawals').insert([
        { user_id: uid, request_amount: amount, upi_id: upiId, status: 'pending' } 
    ]);

    if (insertError) {
        console.error("Withdrawal Insert Error:", insertError);
        return alert("ERROR 7A: Withdrawal request failed to insert into 'withdrawals' table.");
    }
    
    // 3. Deduct amount from user's balance using RPC
    const { error: deductError } = await sb.rpc('deduct_withdrawable_amount', {
        user_id_input: uid,
        amount_to_deduct: amount
    });
    
    if (deductError) {
        console.error("Deduction RPC Error:", deductError);
        return alert("ERROR 9A: Balance deduction failed! Check Supabase logs and SQL function.");
    }

    // Success
    alert(`Withdrawal request of ₹${amount.toFixed(2)} sent successfully! It will be processed soon.`);
    amountInput.value = ''; 
    upiInput.value = ''; 
    window.loadDashboardData(); 
};


// --- 5. ADMIN PANEL FIXES (Using admin_settings table) ---

window.loadAdminData = async function() {
    // 1. Pending Approvals (ID: pending-transactions)
    const list = document.getElementById('pending-transactions');
    const { data: trans } = await sb.from('transactions').select('*, users(phone_number)').eq('status', 'pending');
    
    if(list && trans && trans.length > 0) {
        list.innerHTML = trans.map(t => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
                User Phone: **${t.users ? t.users.phone_number : 'New User'}** | Amount: ₹${t.amount}
                <p style="margin:5px 0;">**Transaction Details:** ${t.user_payment_details || 'N/A'}</p> 
                <button onclick="window.approveUser('${t.user_id}', '${t.id}')" style="background:green;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 10px;">Approve</button>
            </div>`).join('');
    } else if (list) {
         list.innerHTML = `<p style="color: green;">No pending registrations found.</p>`;
    }
    
    // 2. Load Pending Withdrawals (ID: pending-withdrawals)
    const withdrawList = document.getElementById('pending-withdrawals');
    // FIX: Using select('*') for better compatibility, and using || 0 to prevent 'undefined'
    const { data: wds, error: fetchError } = await sb.from('withdrawals').select('*, users(phone_number)').eq('status', 'pending');
    
    if(withdrawList && wds && wds.length > 0) {
        withdrawList.innerHTML = wds.map(w => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
                User: ${w.users ? w.users.phone_number : 'User'} | UPI: ${w.upi_id || 'N/A'} | **₹${w.request_amount || 0}**
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:orange;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 10px;">Mark Paid</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 5px;">Reject & Refund</button>
            </div>`).join('');
    } else if (withdrawList) {
         withdrawList.innerHTML = `<p style="color: green;">No pending withdrawals found.</p>`;
    }


    // 3. Load Current UPI & QR (Uses 'admin_settings' table)
    const { data: conf } = await sb.from(SETTINGS_TABLE).select('upi_id, qr_url').eq('id', 1).single();
    
    if(conf) {
        if(document.getElementById('admin-upi-input')) { document.getElementById('admin-upi-input').value = conf.upi_id || ''; }
        if(document.getElementById('admin-qr-input')) { document.getElementById('admin-qr-input').value = conf.qr_url || ''; }
        if(document.getElementById('display-upi-id')) { document.getElementById('display-upi-id').textContent = conf.upi_id || 'N/A'; }
        if(document.getElementById('display-qr-url')) { document.getElementById('display-qr-url').textContent = conf.qr_url || 'N/A'; }
    } else {
        if(document.getElementById('display-upi-id')) { document.getElementById('display-upi-id').textContent = 'N/A (DB Empty/Error)'; }
        if(document.getElementById('display-qr-url')) { document.getElementById('display-qr-url').textContent = 'N/A (DB Empty/Error)'; }
    }

    // 4. Load Active Videos (ID: current-videos)
    const vidList = document.getElementById('current-videos');
    const { data: vids } = await sb.from(VIDEOS_TABLE).select('*').order('id', { ascending: true });
    
    if(vidList && vids && vids.length > 0) {
         vidList.innerHTML = vids.map(v => `
            <div style="border:1px dashed #999; padding:5px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                <span style="flex-grow:1;">Desc: ${v.description} | Link: ${v.video_link.substring(0, 30)}... </span>
                <button onclick="window.deleteVideo('${v.id}')" style="background:red;color:#fff; padding:3px 8px; border:none; border-radius:3px; margin-left: 10px; font-size:12px;">Remove</button>
            </div>`).join('');
    } else if (vidList) {
         vidList.innerHTML = `<p style="color: gray;">No videos added yet.</p>`;
    }
};

// UPI/QR Update function (Uses 'admin_settings' table)
window.updateUpiSettings = async function() {
    const upiVal = document.getElementById('admin-upi-input').value.trim();
    const qrVal = document.getElementById('admin-qr-input').value.trim();
    
    if(!upiVal && !qrVal) return alert("Fill at least one field (UPI or QR URL)!");
    
    // Upsert: Using 'admin_settings' table
    const { error } = await sb.from(SETTINGS_TABLE).upsert(
        [{ id: 1, upi_id: upiVal, qr_url: qrVal }], 
        { onConflict: 'id' } 
    );
    
    if(error) {
        alert("CRITICAL ERROR: Update/Insert Failed. Check console (F12) for exact Supabase error.");
        console.error("Supabase Upsert Error:", error); 
    } else {
        alert("UPI and QR Settings Updated Successfully! (Row with id=1 created/updated)");
        window.loadAdminData();
        window.fetchRegisterUpi();
    }
};

// Video Add function
window.addVideoLink = async function() {
    const desc = document.getElementById('new-video-desc').value.trim();
    const link = document.getElementById('new-video-link').value.trim();
    
    if(!link || !desc) return alert("Fill both Video Description and Video Link!");

    const { error } = await sb.from(VIDEOS_TABLE).insert([{ video_link: link, description: desc, is_active: true }]);
    if(error) alert("Error: Video Add Failed: " + error.message);
    else { 
        alert("Video Added Successfully!"); 
        document.getElementById('new-video-desc').value = '';
        document.getElementById('new-video-link').value = '';
        window.loadAdminData();
    }
};

// Delete Video Function
window.deleteVideo = async function(vid) {
    if(!confirm("Are you sure you want to remove this video?")) return;
    const { error } = await sb.from(VIDEOS_TABLE).delete().eq('id', vid);

    if(error) {
        alert("Error deleting video: " + error.message);
        console.error("Delete Error:", error);
    } else {
        alert("Video removed successfully!");
        window.loadAdminData();
    }
}

// Multi-Level Referral Reward Logic Added (Calls DB RPC: grant_referral_rewards)
window.approveUser = async function(uid, tid) {
    // 1. Transaction status update karna
    const { error: transError } = await sb.from('transactions').update({ status: 'approved' }).eq('id', tid);
    
    // 2. User ko approve karna
    const { error: userError } = await sb.from('users').update({ is_approved: true }).eq('id', uid);
    
    if(transError || userError) {
        alert("Approval Failed! Check console (F12) for database errors.");
        return;
    } 

    // 3. Referral Rewards Granting (Calls the SQL function)
    const { data: rewardData, error: rewardError } = await sb.rpc('grant_referral_rewards', { new_user_id: uid });

    if (rewardError) {
         console.error("Referral Rewards RPC Error:", rewardError);
         alert("User Approved, but Referral Reward granting FAILED. Check console (F12) for details.");
    } else {
         console.log("Referral Rewards Granted Log:", rewardData);
         alert("User Approved! Multi-level referral rewards granted successfully.");
    }
    
    window.loadAdminData();
};

// --- WINDOW LOAD ADMIN DATA (FULL DEFINITION) ---
window.loadAdminData = async function() {
    // 1. Pending Approvals (ID: pending-transactions)
    const list = document.getElementById('pending-transactions');
    const { data: trans } = await sb.from('transactions').select('*, users(phone_number)').eq('status', 'pending');
    
    if(list && trans && trans.length > 0) {
        list.innerHTML = trans.map(t => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
                User Phone: **${t.users ? t.users.phone_number : 'New User'}** | Amount: ₹${t.amount}
                <p style="margin:5px 0;">**Transaction Details:** ${t.user_payment_details || 'N/A'}</p> 
                <button onclick="window.approveUser('${t.user_id}', '${t.id}')" style="background:green;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 10px;">Approve</button>
            </div>`).join('');
    } else if (list) {
         list.innerHTML = `<p style="color: green;">No pending registrations found.</p>`;
    }
    
    // 2. Load Pending Withdrawals (ID: pending-withdrawals)
    const withdrawList = document.getElementById('pending-withdrawals');
    // FIX: Using select('*') for better compatibility, and using || 0 to prevent 'undefined'
    const { data: wds, error: fetchError } = await sb.from('withdrawals').select('*, users(phone_number)').eq('status', 'pending');
    
    if(withdrawList && wds && wds.length > 0) {
        withdrawList.innerHTML = wds.map(w => `
            <div style="border:1px solid #ccc; padding:10px; margin-bottom:10px;">
                User: ${w.users ? w.users.phone_number : 'User'} | UPI: ${w.upi_id || 'N/A'} | **₹${w.request_amount || 0}**
                <button onclick="window.approveWithdrawal('${w.id}')" style="background:orange;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 10px;">Mark Paid</button>
                <button onclick="window.rejectWithdrawal('${w.id}')" style="background:red;color:#fff; padding:5px; border:none; border-radius:3px; margin-left: 5px;">Reject & Refund</button>
            </div>`).join('');
    } else if (withdrawList) {
         withdrawList.innerHTML = `<p style="color: green;">No pending withdrawals found.</p>`;
    }


    // 3. Load Current UPI & QR (Uses 'admin_settings' table)
    const { data: conf } = await sb.from('admin_settings').select('upi_id, qr_url').eq('id', 1).single();
    
    if(conf) {
        if(document.getElementById('admin-upi-input')) { document.getElementById('admin-upi-input').value = conf.upi_id || ''; }
        if(document.getElementById('admin-qr-input')) { document.getElementById('admin-qr-input').value = conf.qr_url || ''; }
        if(document.getElementById('display-upi-id')) { document.getElementById('display-upi-id').textContent = conf.upi_id || 'N/A'; }
        if(document.getElementById('display-qr-url')) { document.getElementById('display-qr-url').textContent = conf.qr_url || 'N/A'; }
    } else {
        if(document.getElementById('display-upi-id')) { document.getElementById('display-upi-id').textContent = 'N/A (DB Empty/Error)'; }
        if(document.getElementById('display-qr-url')) { document.getElementById('display-qr-url').textContent = 'N/A (DB Empty/Error)'; }
    }

    // 4. Load Active Videos (ID: current-videos)
    const vidList = document.getElementById('current-videos');
    const { data: vids } = await sb.from('videos').select('*').order('id', { ascending: true });
    
    if(vidList && vids && vids.length > 0) {
         vidList.innerHTML = vids.map(v => `
            <div style="border:1px dashed #999; padding:5px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;">
                <span style="flex-grow:1;">Desc: ${v.description} | Link: ${v.video_link.substring(0, 30)}... </span>
                <button onclick="window.deleteVideo('${v.id}')" style="background:red;color:#fff; padding:3px 8px; border:none; border-radius:3px; margin-left: 10px; font-size:12px;">Remove</button>
            </div>`).join('');
    } else if (vidList) {
         vidList.innerHTML = `<p style="color: gray;">No videos added yet.</p>`;
    }
};

// UPI/QR Update function (Uses 'admin_settings' table)
window.updateUpiSettings = async function() {
    const upiVal = document.getElementById('admin-upi-input').value.trim();
    const qrVal = document.getElementById('admin-qr-input').value.trim();
    
    if(!upiVal && !qrVal) return alert("Fill at least one field (UPI or QR URL)!");
    
    // Upsert: Using 'admin_settings' table
    const { error } = await sb.from('admin_settings').upsert(
        [{ id: 1, upi_id: upiVal, qr_url: qrVal }], 
        { onConflict: 'id' } 
    );
    
    if(error) {
        alert("CRITICAL ERROR: Update/Insert Failed. Check console (F12) for exact Supabase error.");
        console.error("Supabase Upsert Error:", error); 
    } else {
        alert("UPI and QR Settings Updated Successfully! (Row with id=1 created/updated)");
        window.loadAdminData();
        window.fetchRegisterUpi();
    }
};

// Video Add function
window.addVideoLink = async function() {
    const desc = document.getElementById('new-video-desc').value.trim();
    const link = document.getElementById('new-video-link').value.trim();
    
    if(!link || !desc) return alert("Fill both Video Description and Video Link!");

    const { error } = await sb.from('videos').insert([{ video_link: link, description: desc, is_active: true }]);
    if(error) alert("Error: Video Add Failed: " + error.message);
    else { 
        alert("Video Added Successfully!"); 
        document.getElementById('new-video-desc').value = '';
        document.getElementById('new-video-link').value = '';
        window.loadAdminData();
    }
};

// Delete Video Function
window.deleteVideo = async function(vid) {
    if(!confirm("Are you sure you want to remove this video?")) return;
    const { error } = await sb.from('videos').delete().eq('id', vid);

    if(error) {
        alert("Error deleting video: " + error.message);
        console.error("Delete Error:", error);
    } else {
        alert("Video removed successfully!");
        window.loadAdminData();
    }
}

window.approveWithdrawal = async function(wid) {
    const { error } = await sb.from('withdrawals').update({ status: 'approved' }).eq('id', wid);
    if(error) {
        alert("Withdrawal Approval Failed!");
    } else {
        alert("Withdrawal marked as Paid!");
        window.loadAdminData();
    }
};

window.rejectWithdrawal = async function(wdId) {
    if (!confirm("Are you sure you want to REJECT this withdrawal? The amount will be refunded to the user's account.")) return;

    // 1. Fetch details to get user_id and amount for refund
    const { data: wd, error: fetchError } = await sb.from('withdrawals').select('user_id, request_amount').eq('id', wdId).single();
    
    if (fetchError || !wd) {
        return alert("Error fetching withdrawal details for rejection.");
    }
    
    const userId = wd.user_id;
    const amountToRefund = wd.request_amount;

    // 2. Update status in withdrawals table
    const { error: rejectError } = await sb.from('withdrawals')
        .update({ status: 'rejected' })
        .eq('id', wdId);

    if (rejectError) {
        console.error("Withdrawal Rejection Error:", rejectError);
        return alert("Withdrawal Rejection Failed in Database!");
    }

    // 3. Refund amount using RPC (Requires separate SQL Function in Supabase)
    const { error: refundError } = await sb.rpc('refund_withdrawable_amount', {
        user_id_input: userId,
        amount_to_refund: amountToRefund
    });
    
    if (refundError) {
        console.error("Refund RPC Error:", refundError);
        alert("Rejection successful, BUT refund to user's balance FAILED! Check Supabase logs.");
    } else {
        alert("Withdrawal Rejected and amount Refunded to user's account!");
    }

    window.loadAdminData();
};

// --- 6. UTILITIES ---
window.copyReferralLink = function() {
    const linkInput = document.getElementById('referral-link');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); // For mobile devices
    navigator.clipboard.writeText(linkInput.value); 
    alert("Referral Link copied!");
};

window.logoutUser = function() { localStorage.clear(); window.location.href = 'index.html'; };

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', () => {
    const p = window.location.pathname;
    if(p.includes('admin.html')) window.loadAdminData();
    else if(p.includes('dashboard.html')) window.loadDashboardData();
    else {
        // Index/Login/Register page logic
        if(document.getElementById('package-select')) window.fetchPackages();
        window.fetchRegisterUpi();
    }
});
