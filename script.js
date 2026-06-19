const FIREBASE_DB_URL = "https://ea-systam-default-rtdb.firebaseio.com/";

let records = [];
let currentAdminUsername = localStorage.getItem('active_session_username') || 'admin';

// NEW: Generates a unique digital fingerprint for each device/browser
function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillText("EA_SYSTAM_SECURE", 2, 2);
    const canvasData = canvas.toDataURL();
    
    const rawString = navigator.userAgent + navigator.platform + screen.width + screen.height + canvasData;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        const char = rawString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return 'DEV_' + Math.abs(hash);
}

const styleFix = document.createElement('style');
styleFix.innerHTML = `
    body.logged-out-state > *:not(#login-screen):not(#register-screen):not(#forgot-screen):not(script) {
        display: none !important;
    }
    .responsive-table-wrapper { width: 100%; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background-color: #f8fafc; color: #334155; font-weight: 600; }
    .mobile-label { display: none; }
    .badge { padding: 4px 8px; border-radius: 6px; font-weight: 600; font-size: 13px; }
    .badge-present { background-color: #dcfce7; color: #166534; }
    .badge-absent { background-color: #fef2f2; color: #991b1b; }
    .badge-halfday { background-color: #dbeafe; color: #1e40af; }
    .badge-leave { background-color: #f1f5f9; color: #334155; }
    #threedot-dropdown-container button:hover { background-color: #f1f5f9 !important; color: #4f46e5 !important; }
    #btn-present, #btn-absent, #btn-halfday, #btn-leave, #send-otp-btn { position: relative !important; z-index: 9999 !important; pointer-events: auto !important; cursor: pointer !important; }
    @media (min-width: 769px) { .kpi-container { grid-template-columns: repeat(4, 1fr) !important; } }
    @media (max-width: 768px) {
        .ledger-table-master, .ledger-table-master thead, .ledger-table-master tbody, .ledger-table-master th, .ledger-table-master td, .ledger-table-master tr,
        .history-table-master, .history-table-master thead, .history-table-master tbody, .history-table-master th, .history-table-master td, .history-table-master tr { display: block !important; }
        .ledger-table-master thead, .history-table-master thead { display: none !important; }
        .ledger-table-master tr, .history-table-master tr { background: #ffffff !important; border: 1px solid #e2e8f0 !important; border-radius: 12px !important; padding: 12px !important; margin-bottom: 15px !important; box-shadow: 0 2px 5px rgba(0,0,0,0.02) !important; }
        .ledger-table-master td, .history-table-master td { display: flex !important; justify-content: space-between !important; align-items: center !important; border: none !important; border-bottom: 1px dashed #f1f5f9 !important; padding: 8px 0 !important; }
        .ledger-table-master td:last-child, .history-table-master td:last-child { border-bottom: none !important; }
        .mobile-label { display: inline-block !important; font-weight: 700 !important; color: #475569 !important; font-size: 13px !important; }
        .row-data { text-align: right !important; font-size: 14px !important; font-weight: 600 !important; }
    }
`;
document.head.appendChild(styleFix);

const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const forgotScreen = document.getElementById('forgot-screen');
const mainDashboard = document.getElementById('main-dashboard');
const welcomeUserText = document.getElementById('welcome-user');
const dropdownContainer = document.getElementById('threedot-dropdown-container');

const dateInput = document.getElementById('input-date');
const salaryInput = document.getElementById('input-salary');
const borrowingInput = document.getElementById('input-borrowing');
const overtimeInput = document.getElementById('input-overtime');
const editIndexInput = document.getElementById('edit-index');

const absentModal = document.getElementById('absent-modal');
const absentReasonInput = document.getElementById('absent-reason-input');
const modalBtnSkip = document.getElementById('modal-btn-skip');
const modalBtnSave = document.getElementById('modal-btn-save');

const dToday = new Date();
if (dateInput) {
    dateInput.value = `${dToday.getFullYear()}-${String(dToday.getMonth() + 1).padStart(2, '0')}-${String(dToday.getDate()).padStart(2, '0')}`;
}

window.initDashboard = function() {
    currentAdminUsername = localStorage.getItem('active_session_username') || 'admin';
    loadOnlineData();
};

window.renderLedger = function() { render(); };

let localOTPSession = { generatedOTP: null, targetEmail: null };

// SECURE LOGIN WITH DEVICE LOCK FINGERPRINT
window.requestLoginOTP = function() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    const statusMsg = document.getElementById('auth-status-msg');
    
    if (!email || !password) { alert("Email aur Password dono bharna zaroori hai."); return; }

    statusMsg.style.color = "#f59e0b";
    statusMsg.innerText = "Verifying device hardware and security keys...";

    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");
    const currentDeviceCode = getDeviceFingerprint();

    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`)
    .then(response => response.json())
    .then(data => {
        if (data === null) {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Access Denied: This email is not registered!";
            return;
        }

        if (String(data.password) !== String(password)) {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Access Denied: Incorrect Password!";
            return;
        }

        // CRITICAL CHECK: Check if current device fingerprint is approved on cloud
        if (data.devices && !data.devices.includes(currentDeviceCode)) {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Security Alert: This hardware device is not approved by Admin!";
            alert("🔒 Access Blocked: Yeh device aapki approved list mein nahi hai! Same ID teesre ke phone mein nahi chal sakti.");
            return;
        }

        // Send OTP if everything is correct
        const realOTP = Math.floor(100000 + Math.random() * 900000);
        localOTPSession.generatedOTP = String(realOTP);
        localOTPSession.targetEmail = email;

        emailjs.send("service_f7w012p", "template_mpcvwoa", {
            to_email: email,
            otp_code: realOTP
        })
        .then(() => {
            statusMsg.style.color = "#10b981";
            statusMsg.innerText = "Password & Device Approved! OTP sent successfully.";
            document.getElementById('otp-entry-section').style.display = 'block';
        })
        .catch(() => {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Email delivery failed.";
        });
    });
};

window.verifyLoginOTP = function() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const otp = document.getElementById('login-otp').value.trim();
    const statusMsg = document.getElementById('auth-status-msg');

    if (email === localOTPSession.targetEmail && otp === localOTPSession.generatedOTP) {
        localStorage.setItem('active_session_username', email);
        statusMsg.style.color = "#10b981";
        statusMsg.innerText = "Login successful!";
        forceOpenDashboard();
    } else {
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Galat OTP code!";
    }
};

// LIVE CLOUD REGISTRATION WITH AUTOMATIC DEVICE WHITELISTING
window.handleRealRegistration = function(event) {
    event.preventDefault();
    const username = document.getElementById('reg-user').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-pass').value.trim();
    const confirmPassword = document.getElementById('reg-confirm-pass').value.trim();
    
    if(!username || !email || !password || !confirmPassword) { alert("Saari details dalna zaroori hai!"); return; }
    if(password !== confirmPassword) { alert("Passwords match nahi ho rahe!"); return; }
    
    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");
    const primaryDevice = getDeviceFingerprint();

    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`)
    .then(res => res.json())
    .then(existingData => {
        if (existingData !== null) {
            alert("⚠️ Account already exists with this Email.");
            return;
        }

        // Whitelist the current phone during registration automatically
        fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`, { 
            method: 'PUT', 
            body: JSON.stringify({ 
                registered: true, 
                name: username, 
                password: password,
                devices: [primaryDevice],
                timestamp: Date.now() 
            }) 
        })
        .then(() => {
            toggleAuthScreens('login');
            alert("✅ Account Registered! Aapka yeh phone automatic approve ho gaya hai.");
        });
    });
};

// Baaki saare function (render, delete, sync) pehle jaise hi kaam karenge.
function forceOpenDashboard() {
    document.body.classList.remove('logged-out-state');
    if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
    if (mainDashboard) mainDashboard.style.setProperty('display', 'block', 'important');
    let rawUserEmail = localStorage.getItem('active_session_username') || 'admin';
    currentAdminUsername = rawUserEmail.replace(/[^a-zA-Z0-9]/g, "_");
    loadOnlineData();
}

document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('active_session_username')) { forceOpenDashboard(); }
    else { document.body.classList.add('logged-out-state'); if (loginScreen) loginScreen.style.setProperty('display', 'flex', 'important'); }
});

async function loadOnlineData() {
    if (!currentAdminUsername || currentAdminUsername === 'admin') return;
    try {
        const response = await fetch(`${FIREBASE_DB_URL}records/${currentAdminUsername}.json`);
        const data = await response.json();
        if(data) { records = Array.isArray(data) ? data.filter(Boolean) : Object.values(data); }
        render();
    } catch (e) { records = []; render(); }
}
