/**
 * HuntJob - Frontend Logic
 * Handling UI interactions and API calls to Google Apps Script
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. ELEMENTS SELECTION & CONFIG ---
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwUR9lHgatZbhQOpi18ltUL3ohmmj8F6lya4M3E7CAP-flZ34Ec2VUAVrm-BVVR1AxOww/exec";
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    const authModal = document.getElementById('authModal');
    const closeModal = document.getElementById('closeModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const otpSection = document.getElementById('otpSection');
    const authTabs = document.getElementById('authTabs');
    
    const loginTabBtn = document.getElementById('loginTabBtn');
    const registerTabBtn = document.getElementById('registerTabBtn');
    
    const regPass = document.getElementById('regPass');
    const strengthBar = document.getElementById('strengthBar');
    const strengthText = document.getElementById('strengthText');

    // --- 2. HELPER: TOAST NOTIFICATIONS ---
    function showToast(message, type = "success") {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.innerText = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add("show");
            setTimeout(() => {
                toast.classList.remove("show");
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }, 100);
    }

    // --- 3. API HELPER FUNCTION ---
    async function apiCall(data) {
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(data)
            });
            return await response.json(); 
        } catch (error) {
            console.error("API Error:", error);
            return { status: "Error", message: "Network connection failed." };
        }
    }

    // --- 4. MOBILE MENU LOGIC ---
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = menuToggle.querySelector('i');
            const isOpened = navLinks.classList.contains('active');
            icon.setAttribute('data-lucide', isOpened ? 'x' : 'menu');
            lucide.createIcons();
            document.body.style.overflow = isOpened ? 'hidden' : 'auto';
        });
    }

    // --- 5. AUTH MODAL LOGIC ---
    const openAuth = () => {
        authModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    };

    const closeAuth = () => {
        authModal.style.display = 'none';
        document.body.style.overflow = 'auto';
        otpSection.classList.add('d-none');
        authTabs.classList.remove('d-none');
        loginTabBtn.click(); 
    };

    document.getElementById('navRegisterBtn').onclick = openAuth;
    document.getElementById('heroGetStartedBtn').onclick = openAuth;
    closeModal.onclick = closeAuth;

    loginTabBtn.onclick = () => {
        loginTabBtn.classList.add('active');
        registerTabBtn.classList.remove('active');
        loginForm.classList.remove('d-none');
        registerForm.classList.add('d-none');
    };

    registerTabBtn.onclick = () => {
        registerTabBtn.classList.add('active');
        loginTabBtn.classList.remove('active');
        registerForm.classList.remove('d-none');
        loginForm.classList.add('d-none');
    };

    // --- 6. SECURITY: PASSWORD STRENGTH (12+ Chars) ---
    regPass.addEventListener('input', () => {
        const val = regPass.value;
        let score = 0;
        
        if (val.length >= 8) score += 25;
        if (val.length >= 12) score += 25;
        if (/[A-Z]/.test(val)) score += 25;
        if (/[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val)) score += 25;

        strengthBar.style.width = score + '%';
        
        if (score < 50) {
            strengthBar.style.backgroundColor = '#ef4444';
            strengthText.innerText = "Weak (Minimum 12 characters)";
        } else if (score < 100) {
            strengthBar.style.backgroundColor = '#f59e0b';
            strengthText.innerText = "Good, but use special chars & numbers";
        } else {
            strengthBar.style.backgroundColor = '#10b981';
            strengthText.innerText = "Strong Password";
        }
    });

    // --- 7. FORM SUBMISSIONS ---
    
    // Register Logic
    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('regSubmitBtn');
        
        if (regPass.value.length < 12) {
            showToast("Password must be at least 12 characters.", "error");
            return;
        }

        btn.innerText = "Sending OTP...";
        btn.disabled = true;

        // FIXED: Include the hidden referral code in the payload
        const formData = {
            action: "register",
            username: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            phone: document.getElementById('regPhone').value,
            password: regPass.value,
            ref: document.getElementById('refCodeInput') ? document.getElementById('refCodeInput').value : "" 
        };

        const result = await apiCall(formData);

        if(result.status === "Success") {
            sessionStorage.setItem('pendingEmail', formData.email);
            registerForm.classList.add('d-none');
            authTabs.classList.add('d-none');
            otpSection.classList.remove('d-none');
            showToast("OTP sent to your email!");
        } else {
            showToast(result.message, "error");
        }
        btn.innerText = "Create Account & Verify";
        btn.disabled = false;
    };

    // OTP Verification Logic
    document.getElementById('verifyOtpBtn').onclick = async () => {
        const btn = document.getElementById('verifyOtpBtn');
        const otpVal = document.getElementById('otpCode').value;
        const email = sessionStorage.getItem('pendingEmail');

        if (otpVal.length !== 6) {
            showToast("Enter all 6 digits!", "error");
            return;
        }

        btn.innerText = "Verifying...";
        btn.disabled = true;

        const result = await apiCall({
            action: "verifyOTP",
            email: email,
            otp: otpVal
        });

        if(result.status === "Success") {
            showToast("Account Verified! Please sign in.");
            setTimeout(() => {
                btn.innerText = "Complete Registration";
                btn.disabled = false;
                otpSection.classList.add('d-none');
                authTabs.classList.remove('d-none');
                loginTabBtn.click();
            }, 1500);
        } else {
            showToast(result.message, "error");
            btn.innerText = "Complete Registration";
            btn.disabled = false;
        }
    };

    // Login Logic
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const btn = loginForm.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = "Checking Credentials...";
        btn.disabled = true;

        const formData = {
            action: "login",
            email: document.getElementById('loginEmail').value,
            password: document.getElementById('loginPass').value
        };

        const result = await apiCall(formData);

        if (result.status === "Success") {
            const userData = result.data || result.message; // Handling any payload type
            showToast("Welcome back, " + userData.username + "!");
            localStorage.setItem('huntJob_session', JSON.stringify(userData));
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1500);
        } else {
            const errorMsg = typeof result.message === 'string' ? result.message : result.data;
            showToast(errorMsg, "error");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    // Forgot Password Logic
    document.getElementById('forgotPassBtn').onclick = async (e) => {
        e.preventDefault();
        const email = prompt("Enter your registered email:");
        if (email) {
            const result = await apiCall({ action: "forgotPassword", email: email });
            const message = typeof result.message === 'string' ? result.message : result.data;
            showToast(message, result.status === "Success" ? "success" : "error");
        }
    };

    // --- 8. DYNAMIC UI EFFECTS ---
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 12, 0.98)';
            navbar.style.padding = '0.8rem 8%';
        } else {
            navbar.style.background = 'rgba(10, 10, 12, 0.8)';
            navbar.style.padding = '1.2rem 8%';
        }
    });
});