import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, 
    onAuthStateChanged, signOut, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, updatePassword, updateProfile, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyC_U_pYSYWNm6Q1ufFwQE_tYlQZIYeDU0g",
    authDomain: "cdn-generator.firebaseapp.com",
    projectId: "cdn-generator",
    storageBucket: "cdn-generator.firebasestorage.app",
    messagingSenderId: "44677120607",
    appId: "1:44677120607:web:b4719f7b7c6414cd19d1ea",
    measurementId: "G-9RK16SGB09"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth();
const db = getFirestore(app);

// --- 2. USER DATA SAVE LOGIC ---
async function saveUserData(user) {
    try {
        let nameToSave = user.displayName;
        if (!nameToSave && user.email) {
            nameToSave = user.email.split('@')[0];
            nameToSave = nameToSave.charAt(0).toUpperCase() + nameToSave.slice(1);
        }

        await setDoc(doc(db, "users", user.uid), {
            name: nameToSave || "Guest",
            email: user.email,
            photo: user.photoURL,
            lastLogin: new Date()
        }, { merge: true });
    } catch(e) { console.error("Error saving user:", e); }
}

// --- 3. AUTHENTICATION LOGIC ---

// Google Login
window.loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        await saveUserData(result.user);
        closeModal('loginModal');
    } catch (e) { alert(e.message); }
};

// GitHub Login
window.loginWithGithub = async () => {
    try {
        const result = await signInWithPopup(auth, new GithubAuthProvider());
        await saveUserData(result.user);
        closeModal('loginModal');
        fetchGitHubRepos(result.user);
    } catch (e) { alert("GitHub Login Failed. Make sure your email is public on GitHub."); }
};

// Bind Provider Buttons
document.getElementById('btnGoogleLogin').onclick = loginWithGoogle;
document.getElementById('btnGithubLogin').onclick = loginWithGithub;

// Email Sign Up
if (document.getElementById('btnEmailSignup')) {
    document.getElementById('btnEmailSignup').addEventListener('click', async () => {
        const name = document.getElementById('signupName').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const pass = document.getElementById('signupPass').value;

        if (!name || !email || !pass) return alert("Please fill all fields!");

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: name });
            await saveUserData(userCredential.user);
            
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            alert("Account created successfully! Please verify your email before logging in.");
            toggleView('loginView');
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') alert("This email is already registered. Please login instead.");
            else if (error.code === 'auth/weak-password') alert("Password should be at least 6 characters.");
            else alert(error.message);
        }
    });
}

// Email Login
document.getElementById('btnEmailLogin').addEventListener('click', async () => {
    const email = document.getElementById('authEmail').value.trim();
    const pass = document.getElementById('authPass').value;
    const unverifiedAlert = document.getElementById('unverifiedAlert');
    if (unverifiedAlert) unverifiedAlert.classList.add('hidden');

    if (!email || !pass) return alert("Please enter email and password!");

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        if (!userCredential.user.emailVerified) {
            await signOut(auth);
            if (unverifiedAlert) {
                unverifiedAlert.classList.remove('hidden');
            } else {
                alert("Please verify your email address before logging in. Check your inbox.");
            }
            return;
        }
        closeModal('loginModal');
    } catch (error) {
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert("Incorrect email or password. Please try again.");
        } else {
            alert(error.message);
        }
    }
});

// Resend Verification Link
if (document.getElementById('btnResendVerification')) {
    document.getElementById('btnResendVerification').addEventListener('click', async () => {
        const email = document.getElementById('authEmail').value.trim();
        const pass = document.getElementById('authPass').value;
        if (!email || !pass) return alert("Please enter email and password to resend link!");

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            document.getElementById('unverifiedAlert')?.classList.add('hidden');
            alert("Verification email sent! Please check your inbox.");
        } catch (error) {
            alert("Error: " + error.message);
        }
    });
}

// Forgot Password / Reset Link
document.getElementById('btnResetPass').addEventListener('click', async () => {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) return alert("Please enter your email first!");

    try {
        await sendPasswordResetEmail(auth, email);
        alert("Password reset link has been sent to your email!");
        toggleView('loginView');
    } catch (error) {
        alert(error.message);
    }
});

// Logout
window.logout = () => signOut(auth).then(() => location.reload());

// Update Password (from settings)
if (document.getElementById('btnChangePass')) {
    document.getElementById('btnChangePass').onclick = async () => {
        const newPass = document.getElementById('newPassword').value;
        if(newPass.length < 6) return alert("Password must be at least 6 characters.");
        try {
            await updatePassword(auth.currentUser, newPass);
            alert("Password updated successfully!");
            document.getElementById('newPassword').value = '';
        } catch (e) {
            alert("Error: Please logout and login via Email to change password. This is required for security.");
        }
    };
}

// --- 4. UI STATE & GITHUB REPOS ---

// Monitor Auth State (Runs automatically on login/logout)
onAuthStateChanged(auth, (user) => {
    const btnGenerate = document.getElementById('btnGenerate');

    if (user) {
        // Hide top login, show profile
        document.getElementById('topLoginBtn').classList.add('hidden');
        document.getElementById('topProfileSection').classList.remove('hidden');
        document.getElementById('btnLogout').classList.remove('hidden');
        
        if (btnGenerate) btnGenerate.innerText = "Generate & Fetch Files";

        // SMART NAME DETECTION
        let name = "Guest";
        if (user.displayName) {
            name = user.displayName; 
        } else if (user.email) {
            name = user.email.split('@')[0];
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }

        const email = user.email;
        const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${name}&background=random`;

        // Update DOM elements safely
        if(document.getElementById('sideName')) document.getElementById('sideName').innerText = name;
        if(document.getElementById('sideEmail')) document.getElementById('sideEmail').innerText = email;
        if(document.getElementById('sideAvatar')) document.getElementById('sideAvatar').src = avatarUrl;
        
        if(document.getElementById('dropName')) document.getElementById('dropName').innerText = name;
        if(document.getElementById('dropEmail')) document.getElementById('dropEmail').innerText = email;
        if(document.getElementById('topAvatar')) document.getElementById('topAvatar').src = avatarUrl;

        fetchGitHubRepos(user);
    } else {
        document.getElementById('topLoginBtn').classList.remove('hidden');
        document.getElementById('topProfileSection').classList.add('hidden');
        document.getElementById('btnLogout').classList.add('hidden');
        
        if (btnGenerate) btnGenerate.innerText = "Generate & Fetch Files (Requires Login)";

        if(document.getElementById('sideName')) document.getElementById('sideName').innerText = "Guest";
        if(document.getElementById('sideEmail')) document.getElementById('sideEmail').innerText = "Click to Login";
    }
});

async function fetchGitHubRepos(user) {
    const githubConnectOption = document.getElementById('githubConnectOption');
    const repoList = document.getElementById('repoList');
    if(!repoList || !githubConnectOption) return; // UI safeguard
    
    let isGithub = false;
    let githubUsername = "";

    user.providerData.forEach((profile) => {
        if (profile.providerId === 'github.com') {
            isGithub = true;
            githubUsername = user.reloadUserInfo?.screenName || profile.email.split('@')[0];
        }
    });

    if (isGithub && githubUsername) {
        githubConnectOption.classList.add('hidden');
        repoList.innerHTML = `<p class="text-sm text-slate-500 animate-pulse col-span-2">Fetching Repositories...</p>`;
        
        try {
            const res = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=12`);
            const repos = await res.json();
            
            repoList.innerHTML = "";
            repos.forEach(repo => {
                repoList.innerHTML += `
                    <div class="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 cursor-pointer bg-slate-50 dark:bg-slate-900/50 transition shadow-sm"
                         onclick="document.getElementById('user').value='${repo.owner.login}'; document.getElementById('repo').value='${repo.name}'; switchTab('tabGenerator', document.querySelectorAll('.nav-btn')[0]);">
                        <h4 class="font-bold text-blue-600 dark:text-blue-400 text-sm truncate">${repo.name}</h4>
                        <p class="text-xs text-slate-500 mt-1">⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}</p>
                    </div>
                `;
            });
        } catch (e) {
            repoList.innerHTML = `<p class="text-red-500 text-sm col-span-2">Could not load repos. Rate limit exceeded.</p>`;
        }
    } else {
        githubConnectOption.classList.remove('hidden');
        repoList.innerHTML = "";
    }
}

// --- 5. LINK GENERATOR LOGIC ---
if (document.getElementById('btnGenerate')) {
    document.getElementById('btnGenerate').onclick = async () => {
        if (!auth.currentUser) {
            openModal('loginModal');
            return;
        }

        const user = document.getElementById('user').value.trim();
        const repo = document.getElementById('repo').value.trim();
        const branch = document.getElementById('branch').value.trim();
        const filePath = document.getElementById('filePath').value.trim();
        const provider = document.getElementById('cdnProvider').value;

        if (!user || !repo || !filePath) return alert("Please fill Username, Repository, and File Path!");

        let cdnUrl = "";
        if (provider === 'jsdelivr') cdnUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
        else if (provider === 'statically') cdnUrl = `https://pagedelivr.statically.io/gh/${user}/${repo}/${branch}/${filePath}`;
        else cdnUrl = `https://unpkg.com/${user}@${branch}/${filePath}`;

        document.getElementById('outputContainer').classList.remove('hidden');
        document.getElementById('generatedLink').innerText = cdnUrl;

        try {
            await addDoc(collection(db, "history"), {
                userId: auth.currentUser.uid,
                repo: repo,
                file: filePath,
                link: cdnUrl,
                timestamp: serverTimestamp()
            });
        } catch (e) { console.error("Error saving history:", e); }
    };
}

// --- 6. HISTORY FETCHING ---
window.loadHistory = async () => {
    const historyList = document.getElementById('historyList');
    if(!historyList) return;

    if (!auth.currentUser) {
        historyList.innerHTML = '<p class="text-slate-500 text-sm">Please login to view history.</p>';
        return;
    }
    
    historyList.innerHTML = '<p class="text-center py-6 text-slate-500 animate-pulse">Loading history...</p>';
    
    try {
        const q = query(collection(db, "history"), where("userId", "==", auth.currentUser.uid));
        const snapshot = await getDocs(q);
        
        historyList.innerHTML = "";
        if (snapshot.empty) {
            historyList.innerHTML = '<p class="text-center py-6 text-slate-500">No links generated yet.</p>';
            return;
        }

        const historyItems = [];
        snapshot.forEach(doc => historyItems.push({ id: doc.id, ...doc.data() }));
        historyItems.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        historyItems.forEach(data => {
            const date = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : 'Just now';
            historyList.innerHTML += `
                <div class="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex justify-between items-center group mb-3">
                    <div class="overflow-hidden mr-4">
                        <p class="text-xs font-bold text-blue-500 uppercase">${data.repo}</p>
                        <p class="text-sm font-mono truncate text-slate-700 dark:text-slate-300">${data.link}</p>
                        <p class="text-[10px] text-slate-400 mt-1">${date}</p>
                    </div>
                    <div class="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition">
                        <button onclick="navigator.clipboard.writeText('${data.link}'); alert('Copied!')" class="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border hover:bg-slate-100 dark:hover:bg-slate-700" title="Copy">📋</button>
                        <button onclick="deleteHistoryItem('${data.id}')" class="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        });
    } catch(e) {
        console.error(e);
        historyList.innerHTML = '<p class="text-center py-6 text-red-500">Error loading history.</p>';
    }
};

window.deleteHistoryItem = async (id) => {
    if (!confirm("Are you sure you want to delete this link?")) return;
    try {
        await deleteDoc(doc(db, "history", id));
        loadHistory();
    } catch (e) {
        console.error("Error deleting history item:", e);
        alert("Failed to delete item.");
    }
};