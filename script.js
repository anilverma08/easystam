const FIREBASE_DB_URL = "https://ea-systam-default-rtdb.firebaseio.com/";

let records = [];
let currentAdminUsername = localStorage.getItem('active_session_username') || 'admin';

// Generates a unique digital fingerprint for each device/browser
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
const historyOverlay = document.getElementById('history-modal-overlay');
const historyEmptyMessage = document.getElementById('history-empty-message');
const historyList = document.getElementById('history-list');

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

let localOTPSession = { generatedOTP: null, targetEmail: null, deviceToWhitelist: null, updatedDeviceList: [] };
let recoveryOTPSession = { generatedOTP: null, targetEmail: null, databaseUsername: null };

function validatePasswordStrength(password) {
    const minLength = 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_]/.test(password);
    return (password.length >= minLength && hasLetter && hasNumber && hasSpecial);
}

// SECURE LOGIN WITH MASTER LOCK AND DYNAMIC SLOT 2 SHIFT
window.requestLoginOTP = function() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value.trim();
    const statusMsg = document.getElementById('auth-status-msg');
    
    if (!email || !password) { alert("Email aur Password dono bharna zaroori hai."); return; }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) { 
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Error: Kripya ek sahi aur valid Email address daalein!";
        document.getElementById('otp-entry-section').style.display = 'none';
        return; 
    }

    statusMsg.style.color = "#f59e0b";
    statusMsg.innerText = "Verifying credentials and managing secure slots...";

    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");
    const currentDeviceCode = getDeviceFingerprint();

    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`)
    .then(response => response.json())
    .then(data => {
        if (data === null) {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Access Denied: This email is not registered!";
            document.getElementById('otp-entry-section').style.display = 'none';
            return;
        }

        if (String(data.password) !== String(password)) {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Access Denied: Incorrect Password!";
            document.getElementById('otp-entry-section').style.display = 'none';
            return;
        }

        let currentDevices = Array.isArray(data.devices) ? data.devices.filter(Boolean) : [];

        if (!currentDevices.includes(currentDeviceCode)) {
            if (currentDevices.length >= 2) {
                currentDevices[1] = currentDeviceCode;
            } else {
                currentDevices.push(currentDeviceCode);
            }
            localOTPSession.deviceToWhitelist = currentDeviceCode;
            localOTPSession.updatedDeviceList = currentDevices;
        } else {
            localOTPSession.deviceToWhitelist = null;
            localOTPSession.updatedDeviceList = currentDevices;
        }

        const realOTP = Math.floor(100000 + Math.random() * 900000);
        localOTPSession.generatedOTP = String(realOTP);
        localOTPSession.targetEmail = email;

        emailjs.send("service_f7w012p", "template_mpcvwoa", {
            to_email: email,
            otp_code: realOTP
        })
        .then(() => {
            statusMsg.style.color = "#10b981";
            statusMsg.innerText = "Credentials verified! OTP sent successfully.";
            document.getElementById('otp-entry-section').style.display = 'block';
        })
        .catch(() => {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "Email delivery failed.";
        });
    })
    .catch(() => {
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Error: Database connection failed.";
    });
};

window.verifyLoginOTP = function() {
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const otp = document.getElementById('login-otp').value.trim();
    const statusMsg = document.getElementById('auth-status-msg');
    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");

    if (!otp) { alert("Kripya OTP code enter karein."); return; }

    if (email === localOTPSession.targetEmail && otp === localOTPSession.generatedOTP) {
        fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init/devices.json`, {
            method: 'PUT',
            body: JSON.stringify(localOTPSession.updatedDeviceList)
        })
        .then(() => {
            localStorage.setItem('active_session_username', email);
            statusMsg.style.color = "#10b981";
            statusMsg.innerText = "Login successful!";
            forceOpenDashboard();
        });
    } else {
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Galat OTP code!";
    }
};

// LIVE CLOUD REGISTRATION WITH DYNAMIC GREEN TEXT STATUS
window.handleRealRegistration = function(event) {
    event.preventDefault();
    const username = document.getElementById('reg-user').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-pass').value.trim();
    const confirmPassword = document.getElementById('reg-confirm-pass').value.trim();
    
    if(!username || !email || !password || !confirmPassword) { alert("Saari details dalna zaroori hai!"); return; }
    
    if(!validatePasswordStrength(password)) {
        alert("⚠️ Password Strong Nahi Hai:\n\nKam se kam 8 letters lambha hona chahiye, aur usme ek Number (0-9), ek Alphabet Letter (a-z) aur ek Special character (!@#$%) hona jaroori hai!");
        return;
    }
    
    if(password !== confirmPassword) { alert("Passwords match nahi ho rahe!"); return; }
    
    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");
    const primaryDevice = getDeviceFingerprint();

    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`)
    .then(res => res.json())
    .then(existingData => {
        if (existingData !== null) {
            alert("⚠️ Account Already Exists: Yeh Email ID pehle se registered hai!");
            return;
        }

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
            // Pop-up alert ko hatakar niche status text green kar diya gaya hai
            const statusMsg = document.getElementById('auth-status-msg');
            if (statusMsg) {
                statusMsg.style.color = "#10b981";
                statusMsg.innerText = "Account Successfully Created!";
            }
        });
    });
};

// RECOVERY OTP REQUEST
window.requestRecoveryOTP = function() {
    const email = document.getElementById('forgot-email').value.trim().toLowerCase();
    const statusMsg = document.getElementById('recovery-status-msg');
    
    if (!email) { alert("Kripya pehle apni Registered Email daalein!"); return; }

    statusMsg.style.color = "#f59e0b";
    statusMsg.innerText = "Checking email registration...";

    const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");

    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init.json`)
    .then(res => res.json())
    .then(cloudData => {
        if (cloudData !== null) {
            const recoveryOTP = Math.floor(100000 + Math.random() * 900000);
            recoveryOTPSession.generatedOTP = String(recoveryOTP);
            recoveryOTPSession.targetEmail = email;
            recoveryOTPSession.databaseUsername = cloudData.name ? cloudData.name : email.split('@')[0];

            emailjs.send("service_f7w012p", "template_mpcvwoa", {
                to_email: email,
                otp_code: recoveryOTP
            })
            .then(() => {
                statusMsg.style.color = "#10b981";
                statusMsg.innerText = "OTP sent to your recovery email address!";
                document.getElementById('recovery-step-otp').style.display = 'block';
            })
            .catch(() => {
                statusMsg.style.color = "#ef4444";
                statusMsg.innerText = "Failed to send recovery OTP.";
            });
        } else {
            statusMsg.style.color = "#ef4444";
            statusMsg.innerText = "This email is not registered anywhere!";
        }
    });
};

window.verifyRecoveryOTP = function() {
    const inputOtp = document.getElementById('forgot-otp').value.trim();
    const statusMsg = document.getElementById('recovery-status-msg');

    if (!inputOtp) { alert("Kripya OTP enter karein."); return; }

    if (inputOtp === recoveryOTPSession.generatedOTP) {
        statusMsg.style.color = "#10b981";
        statusMsg.innerText = "OTP Verified! Now choose a strong new password.";
        document.getElementById('recovered-username').innerText = recoveryOTPSession.databaseUsername.toUpperCase();
        document.getElementById('recovery-step-fields').style.display = 'block';
    } else {
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Incorrect OTP code.";
    }
};

window.handleRecoverySubmit = function(event) {
    event.preventDefault();
    const email = recoveryOTPSession.targetEmail;
    const newPass = document.getElementById('forgot-new-pass').value.trim();
    const statusMsg = document.getElementById('recovery-status-msg');

    if (!newPass) { alert("New Password bharna mandatory hai!"); return; }

    if(!validatePasswordStrength(newPass)) {
        alert("⚠️ Password Strong Nahi Hai:\n\nKam se kam 8 letters lambha hona chahiye, aur usme ek Number (0-9), ek Alphabet Letter (a-z) aur ek Special character (!@#$%) hona jaroori hai!");
        return;
    }

    const safeKey = email.replace(/[^a-zA-Z0-9]/g, "_");
    
    fetch(`${FIREBASE_DB_URL}records/${safeKey}/init.json`, {
        method: 'PATCH',
        body: JSON.stringify({ password: newPass, registered: true })
    })
    .then(() => {
        toggleAuthScreens('login');
        alert("🔐 Success: Aapka Admin password successfully reset ho gaya hai!");
    })
    .catch(() => {
        statusMsg.style.color = "#ef4444";
        statusMsg.innerText = "Error: Database update failed.";
    });
};

// LOGOUT WITH DYNAMIC DEVICE CLEANUP
function handleLogout() {
    if(confirm("Logout karein?")) {
        const email = localStorage.getItem('active_session_username');
        if (email) {
            const safeEmailKey = email.replace(/[^a-zA-Z0-9]/g, "_");
            const currentDeviceCode = getDeviceFingerprint();

            fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init/devices.json`)
            .then(res => res.json())
            .then(devices => {
                if (Array.isArray(devices)) {
                    let updatedDevices = devices.filter((d, index) => d !== currentDeviceCode || index === 0);
                    fetch(`${FIREBASE_DB_URL}records/${safeEmailKey}/init/devices.json`, {
                        method: 'PUT',
                        body: JSON.stringify(updatedDevices)
                    }).then(() => { completeLogoutAction(); });
                } else { completeLogoutAction(); }
            }).catch(() => { completeLogoutAction(); });
        } else { completeLogoutAction(); }
    }
}

function completeLogoutAction() {
    localStorage.removeItem('active_session_username'); 
    records = []; 
    document.body.classList.add('logged-out-state');
    if (mainDashboard) mainDashboard.style.setProperty('display', 'none', 'important');
    if (loginScreen) loginScreen.style.setProperty('display', 'flex', 'important');
}

function forceOpenDashboard() {
    document.body.classList.remove('logged-out-state');
    if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
    if (registerScreen) registerScreen.style.setProperty('display', 'none', 'important');
    if (forgotScreen) forgotScreen.style.setProperty('display', 'none', 'important');
    if (mainDashboard) mainDashboard.style.setProperty('display', 'block', 'important');
    
    let rawUserEmail = localStorage.getItem('active_session_username') || 'admin';
    currentAdminUsername = rawUserEmail.replace(/[^a-zA-Z0-9]/g, "_");
    
    let finalDisplayName = localStorage.getItem('registered_name_' + currentAdminUsername);
    if (!finalDisplayName) { finalDisplayName = rawUserEmail.split('@')[0]; }
    if (welcomeUserText) { welcomeUserText.innerHTML = `<i class="fa-solid fa-circle-user"></i> Admin: ${finalDisplayName.toUpperCase()}`; }
    loadOnlineData();
}

document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('active_session_username')) { forceOpenDashboard(); } 
    else {
        document.body.classList.add('logged-out-state');
        if (mainDashboard) mainDashboard.style.setProperty('display', 'none', 'important');
        if (loginScreen) loginScreen.style.setProperty('display', 'flex', 'important');
    }
    
    const btnP = document.getElementById('btn-present');
    const btnA = document.getElementById('btn-absent');
    const btnH = document.getElementById('btn-halfday');
    const btnL = document.getElementById('btn-leave');

    if(btnP) btnP.onclick = (e) => { e.preventDefault(); if (!checkIfAlreadyMarked(dateInput.value)) saveAttendanceStatus('Present', ''); };
    if(btnH) btnH.onclick = (e) => { e.preventDefault(); if (!checkIfAlreadyMarked(dateInput.value)) saveAttendanceStatus('Half Day', ''); };
    if(btnL) btnL.onclick = (e) => { e.preventDefault(); if (!checkIfAlreadyMarked(dateInput.value)) saveAttendanceStatus('Paid Leave', ''); };
    if(btnA) btnA.onclick = (e) => { e.preventDefault(); if (!checkIfAlreadyMarked(dateInput.value)) openAbsentModal(); };

    if (dateInput) { dateInput.onchange = () => { render(); }; }
    if (modalBtnSkip) modalBtnSkip.onclick = () => { closeAbsentModal(); saveAttendanceStatus('Absent', ''); };
    if (modalBtnSave) modalBtnSave.onclick = () => { const rText = absentReasonInput.value.trim(); closeAbsentModal(); saveAttendanceStatus('Absent', rText); };
});

function toggleThreeDotMenu(event) {
    event.stopPropagation();
    if (dropdownContainer) {
        if (dropdownContainer.style.display === 'block') { dropdownContainer.style.display = 'none'; }
        else { dropdownContainer.style.display = 'block'; }
    }
}

document.addEventListener('click', () => {
    if (dropdownContainer && dropdownContainer.style.display === 'block') {
        dropdownContainer.style.display = 'none';
    }
});

function openHistoryModal() {
    if (dropdownContainer) { dropdownContainer.style.display = 'none'; }
    if (historyOverlay) historyOverlay.style.display = 'flex';
    render(); 
}

function closeHistoryModal() { if (historyOverlay) historyOverlay.style.display = 'none'; }

function checkIfAlreadyMarked(selectedDate) {
    if ((editIndexInput ? editIndexInput.value : "") === selectedDate) return false;
    if (records.find(r => r && r.date === selectedDate)) { alert("Is date ki attendance ho chuki hai!"); return true; }
    return false;
}

function openAbsentModal() {
    if (!dateInput.value || (parseFloat(salaryInput.value) || 0) <= 0) { alert("Kripya Date aur Base Salary pehle bharein!"); return; }
    const rec = records.find(r => r && r.date === dateInput.value);
    absentReasonInput.value = (rec && rec.reason) ? rec.reason : "";
    if (absentModal) absentModal.style.display = 'flex';
}

function closeAbsentModal() { if (absentModal) absentModal.style.display = 'none'; }

function toggleAuthScreens(screenType) {
    if (loginScreen) loginScreen.style.setProperty('display', 'none', 'important');
    if (registerScreen) registerScreen.style.setProperty('display', 'none', 'important');
    if (forgotScreen) forgotScreen.style.setProperty('display', 'none', 'important');
    
    if (screenType === 'register') { registerScreen.style.setProperty('display', 'flex', 'important'); } 
    else if (screenType === 'forgot') {
        forgotScreen.style.setProperty('display', 'flex', 'important');
        document.getElementById('recovery-step-otp').style.display = 'none';
        document.getElementById('recovery-step-fields').style.display = 'none';
        document.getElementById('recovery-status-msg').innerText = "";
    } else {
        loginScreen.style.setProperty('display', 'flex', 'important');
        document.getElementById('otp-entry-section').style.display = 'none';
        document.getElementById('auth-status-msg').innerText = "";
    }
}

async function loadOnlineData() {
    if (!currentAdminUsername || currentAdminUsername === 'admin') return;
    try {
        const response = await fetch(`${FIREBASE_DB_URL}records/${currentAdminUsername}.json`);
        const data = await response.json();
        if(data) {
            let parsed = Array.isArray(data) ? data.filter(Boolean) : Object.values(data);
            records = parsed.filter(r => r && r.date);
        } else { records = []; }
        render();
    } catch (e) { records = []; render(); }
}

async function syncAndRefresh() {
    if (!currentAdminUsername || currentAdminUsername === 'admin') return;
    try {
        fetch(`${FIREBASE_DB_URL}records/${currentAdminUsername}.json`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(records.filter(i => i && i.date))
        });
    } catch (e) {}
}

function saveAttendanceStatus(statusValue, reasonValue) {
    const selectedDate = dateInput.value;
    const salary = parseFloat(salaryInput.value) || 0;
    const borrowing = parseFloat(borrowingInput.value) || 0;
    const overtime = parseFloat(overtimeInput.value) || 0;
    
    if (!selectedDate || salary <= 0) { alert("Pehle Date aur Base Salary sahi bharein!"); return; }

    records = records.filter(item => item && item.date !== selectedDate);
    records.push({ date: selectedDate, status: statusValue, salary: salary, borrowing: borrowing, overtime: overtime, reason: reasonValue });
    if (borrowingInput) borrowingInput.value = "0";
    if (overtimeInput) overtimeInput.value = "0";
    if (editIndexInput) editIndexInput.value = ""; 
    render(); syncAndRefresh();
}

function editRecord(targetDate) {
    const item = records.find(r => r && r.date === targetDate);
    if (item) {
        dateInput.value = item.date; salaryInput.value = item.salary;
        borrowingInput.value = item.borrowing || 0; overtimeInput.value = item.overtime || 0;
        editIndexInput.value = item.date; window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function deleteRecord(targetDate) { if (confirm("Din delete karein?")) { records = records.filter(r => r && r.date !== targetDate); render(); syncAndRefresh(); } }
function deleteEntireMonth(mKey) { if (confirm("Poora mahina delete karein?")) { records = records.filter(r => r && r.date && r.date.substring(0, 7) !== mKey); render(); syncAndRefresh(); } }

function render() {
    const masterTableElement = document.getElementById('live-ledger-table-id');
    if (!masterTableElement) return;

    if (historyList) historyList.innerHTML = "";
    const activeViewMonthKey = dateInput.value ? dateInput.value.substring(0, 7) : "";

    const kpiMainHeading = document.getElementById('kpi-main-heading');
    if (kpiMainHeading && activeViewMonthKey) {
        kpiMainHeading.innerHTML = `<i class="fa-solid fa-chart-simple" style="color: #4f46e5;"></i> ${formatMonthName(activeViewMonthKey)} Ka Hisab-Kitab`;
    }

    let pCount = 0, aCount = 0, bSalary = 0, totalBorrow = 0, totalOvertime = 0;
    records.forEach(r => {
        if (r && r.date && r.date.substring(0, 7) === activeViewMonthKey) {
            if (r.salary > 0) bSalary = r.salary;
            if (r.status === 'Present' || r.status === 'Paid Leave') pCount += 1.0;
            if (r.status === 'Half Day') pCount += 0.5;   
            if (r.status === 'Absent') aCount += 1.0;
            totalBorrow += parseFloat(r.borrowing) || 0;
            totalOvertime += parseFloat(r.overtime) || 0;
        }
    });

    if (bSalary > 0 && salaryInput && !salaryInput.value) salaryInput.value = bSalary;
    const totalDays = getDaysInMonth(parseInt(activeViewMonthKey.split('-')[0]), parseInt(activeViewMonthKey.split('-')[1]));
    let singleDayRate = totalDays > 0 ? bSalary / totalDays : 0;
    let payable = Math.max(0, Math.round((pCount * singleDayRate) + totalOvertime));

    if (document.getElementById('kpi-present')) document.getElementById('kpi-present').innerText = `${pCount} Din`;
    if (document.getElementById('kpi-absent')) document.getElementById('kpi-absent').innerText = `${aCount} Din`;
    if (document.getElementById('kpi-borrow')) document.getElementById('kpi-borrow').innerText = `₹${totalBorrow}`;
    if (document.getElementById('kpi-payable')) document.getElementById('kpi-payable').innerText = `₹${payable}`;
    if (document.getElementById('kpi-sub-base-salary')) {
        document.getElementById('kpi-sub-base-salary').innerText = `Base Salary: ₹${bSalary} | Overtime: +₹${totalOvertime}`;
    }

    const allSortedRecords = [...records].filter(item => item && item.date && item.date.substring(0, 7) === activeViewMonthKey).sort((a,b) => b.date.localeCompare(a.date));
    const hasAnyAbsentReason = allSortedRecords.some(item => item.status === 'Absent' && item.reason);

    let tableHeaderHtml = `<thead><tr><th>Date</th><th>Status</th>${hasAnyAbsentReason ? `<th>Reason</th>` : ''}<th>Borrowing</th><th>Overtime</th><th>Action</th></tr></thead>`;
    let tableBodyHtml = '<tbody>';

    allSortedRecords.forEach(item => {
        let badgeClass = item.status === 'Absent' ? 'badge-absent' : (item.status === 'Half Day' ? 'badge-halfday' : (item.status === 'Paid Leave' ? 'badge-leave' : 'badge-present'));
        
        let reasonTdHtml = '';
        if (item.reason && item.reason.trim() !== "" && item.reason !== "—") {
            reasonTdHtml = `
                <td class="reason-td-laptop-fixed">
                    <span class="mobile-label">Reason:</span>
                    <span class="row-data" style="font-size: 13px; color: #475569; font-style: italic; font-weight: 500;">${item.reason}</span>
                </td>
            `;
        } else if (hasAnyAbsentReason && window.innerWidth > 768) {
            reasonTdHtml = `<td><span class="mobile-label">Reason:</span><span class="row-data">—</span></td>`;
        }

        tableBodyHtml += `
            <tr class="ledger-row-card">
                <td><span class="mobile-label">Date:</span><span class="row-data">${formatDateHTML(item.date)}</span></td>
                <td><span class="mobile-label">Status:</span><span class="row-data"><span class="badge ${badgeClass}">${item.status}</span></span></td>
                ${reasonTdHtml}
                <td><span class="mobile-label">Borrowing:</span><span class="row-data">₹${item.borrowing || 0}</span></td>
                <td><span class="mobile-label">Overtime:</span><span class="row-data">₹${item.overtime || 0}</span></td>
                <td><span class="mobile-label">Action:</span><span class="row-data">
                    <button type="button" onclick="editRecord('${item.date}')" style="margin-right:8px; background:none; border:none; color:#4f46e5; cursor:pointer;"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button type="button" onclick="deleteRecord('${item.date}')" style="color:#ef4444; background:none; border:none; cursor:pointer;"><i class="fa-solid fa-trash-can"></i></button>
                </span></td>
            </tr>
        `;
    });
    masterTableElement.innerHTML = tableHeaderHtml + tableBodyHtml;

    const monthlyGroups = {};
    records.forEach(r => { 
        if(r && r.date) { 
            const mKey = r.date.substring(0, 7); 
            if (!monthlyGroups[mKey]) monthlyGroups[mKey] = []; 
            monthlyGroups[mKey].push(r); 
        } 
    });

    let hasHistory = false;
    Object.keys(monthlyGroups).sort().reverse().forEach(mKey => {
        if (mKey === activeViewMonthKey) return; 
        hasHistory = true;
        let p = 0, a = 0, bs = 0, tb = 0, totOt = 0;
        
        monthlyGroups[mKey].forEach(r => {
            if (r.status === 'Present' || r.status === 'Paid Leave') p += 1.0;
            if (r.status === 'Half Day') p += 0.5;
            if (r.status === 'Absent') a += 1.0;
            if (r.salary > 0) bs = r.salary;
            tb += parseFloat(r.borrowing) || 0;
            totOt += parseFloat(r.overtime) || 0;
        });
        
        const dCount = getDaysInMonth(parseInt(mKey.split('-')[0]), parseInt(mKey.split('-')[1]));
        let historyDayRate = dCount > 0 ? bs / dCount : 0;
        let finPay = Math.max(0, Math.round((p * historyDayRate) + totOt));

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="mobile-label">Month:</span><span class="row-data">${formatMonthName(mKey)}</span></td>
            <td><span class="mobile-label">Present:</span><span class="row-data">${p} Din</span></td>
            <td><span class="mobile-label">Absent:</span><span class="row-data">${a} Din</span></td>
            <td><span class="mobile-label">Base Salary:</span><span class="row-data">₹${bs}</span></td>
            <td><span class="mobile-label">Total Borrowing:</span><span class="row-data">₹${tb}</span></td>
            <td><span class="mobile-label">Total Overtime:</span><span class="row-data">₹${totOt}</span></td>
            <td><span class="mobile-label">Final Payable:</span><span class="row-data">₹${finPay}</span></td>
            <td><span class="mobile-label">Action:</span><span class="row-data"><button type="button" onclick="deleteEntireMonth('${mKey}')" style="color:#ef4444; background:none; border:none; cursor:pointer;"><i class="fa-solid fa-trash-can"></i></button></span></td>
        `;
        if (historyList) historyList.appendChild(tr);
    });

    if (historyEmptyMessage) historyEmptyMessage.style.display = hasHistory ? 'none' : 'block';
    const hTable = document.querySelector('.history-table-master');
    if (hTable) hTable.style.setProperty('display', hasHistory ? 'table' : 'none', 'important');
}

function getDaysInMonth(y, m) { return isNaN(y) || isNaN(m) ? 30 : new Date(y, m, 0).getDate(); }
function formatMonthName(s) { const p = s.split('-'); return new Date(p[0], p[1]-1, 1).toLocaleString('en-IN', {month:'long', year:'numeric'}); }
function formatDateHTML(s) { const p = s.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }
