import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, 
    onAuthStateChanged, signOut, createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, updatePassword, updateProfile, sendPasswordResetEmail, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, collection, addDoc, getDocs, query, where, orderBy 
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

// Safe DOM Selector
const getEl = (id) => document.getElementById(id);

// --- 2. CUSTOM ALERT SYSTEM ---
const showAlert = (message, type = 'success') => {
    const alertBox = getEl('customAlert');
    if (!alertBox) return;

    alertBox.className = "text-white font-semibold py-3 px-6 rounded-xl shadow-2xl fixed bottom-5 right-5 z-[10000] transition-all duration-300 transform translate-y-0 opacity-100 flex items-center";

    if (type === 'error') {
        alertBox.classList.add('bg-red-500');
        alertBox.innerHTML = `⚠️ <span class="ml-2">${message}</span>`;
    } else if (type === 'info') {
        alertBox.classList.add('bg-blue-500');
        alertBox.innerHTML = `ℹ️ <span class="ml-2">${message}</span>`;
    } else {
        alertBox.classList.add('bg-green-500');
        alertBox.innerHTML = `✅ <span class="ml-2">${message}</span>`;
    }

    alertBox.classList.remove('hidden');

    setTimeout(() => {
        alertBox.classList.add('opacity-0', 'translate-y-5');
        setTimeout(() => alertBox.classList.add('hidden'), 300);
    }, 3500);
};
window.showAlert = showAlert;

// --- 3. UI & TAB FUNCTIONS ---
const toggleView = (showId) => {
    ['loginView', 'forgotView', 'signupView'].forEach(id => {
        const el = getEl(id);
        if(el) el.classList.add('hidden');
    });
    const showEl = getEl(showId);
    if(showEl) showEl.classList.remove('hidden');
};
window.toggleView = toggleView;

const switchTab = (tabName) => {
    const homeSection = getEl('homeSection'); 
    const blogSection = getEl('blogSection'); 

    if(tabName === 'home' && homeSection) {
        homeSection.classList.remove('hidden');
        if(blogSection) blogSection.classList.add('hidden');
    } else if(tabName === 'blog' && blogSection) {
        if(homeSection) homeSection.classList.add('hidden');
        blogSection.classList.remove('hidden');
        if(typeof window.loadBlogArticles === 'function') window.loadBlogArticles();
    }
};
window.switchTab = switchTab;

const openHistory = () => { 
    if(typeof openModal === 'function') openModal('historyModal');
    if(typeof window.loadHistory === 'function') window.loadHistory(); 
};
window.openHistory = openHistory;

// --- 4. USER DATA SAVE LOGIC ---
const saveUserData = async (user) => {
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
};

// --- 5. AUTHENTICATION LOGIC ---
const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, new GoogleAuthProvider());
        await saveUserData(result.user);
        if(typeof closeModal === 'function') closeModal('loginModal');
        showAlert("Logged in successfully!", "success");
    } catch (e) { showAlert(e.message, "error"); }
};
window.loginWithGoogle = loginWithGoogle;

const loginWithGithub = async () => {
    try {
        const result = await signInWithPopup(auth, new GithubAuthProvider());
        await saveUserData(result.user);
        if(typeof closeModal === 'function') closeModal('loginModal');
        showAlert("Logged in with GitHub!", "success");
        fetchGitHubRepos(result.user);
    } catch (e) { 
        showAlert("GitHub Login Failed. Make sure your email is public on GitHub.", "error"); 
    }
};
window.loginWithGithub = loginWithGithub;

if(getEl('btnGoogleLogin')) getEl('btnGoogleLogin').onclick = loginWithGoogle;
if(getEl('btnGithubLogin')) getEl('btnGithubLogin').onclick = loginWithGithub;

if(getEl('btnEmailSignup')) {
    getEl('btnEmailSignup').addEventListener('click', async () => {
        const name = getEl('signupName').value.trim();
        const email = getEl('signupEmail').value.trim();
        const pass = getEl('signupPass').value;

        if (!name || !email || !pass) return showAlert("Please fill all fields!", "error");

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            await updateProfile(userCredential.user, { displayName: name });
            await saveUserData(userCredential.user);
            
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            showAlert("Account created! Please verify your email before logging in.", "info");
            toggleView('loginView');
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') showAlert("Email is already registered. Please login.", "error");
            else if (error.code === 'auth/weak-password') showAlert("Password should be at least 6 characters.", "error");
            else showAlert(error.message, "error");
        }
    });
}

if(getEl('btnEmailLogin')) {
    getEl('btnEmailLogin').addEventListener('click', async () => {
        const email = getEl('authEmail').value.trim();
        const pass = getEl('authPass').value;
        const unverifiedAlert = getEl('unverifiedAlert');
        if (unverifiedAlert) unverifiedAlert.classList.add('hidden');

        if (!email || !pass) return showAlert("Please enter email and password!", "error");

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            if (!userCredential.user.emailVerified) {
                await signOut(auth);
                if (unverifiedAlert) {
                    unverifiedAlert.classList.remove('hidden');
                } else {
                    showAlert("Please verify your email before logging in.", "error");
                }
                return;
            }
            
            if(typeof closeModal === 'function') closeModal('loginModal');
            showAlert("Welcome back!", "success");
        } catch (error) {
            showAlert("Incorrect email or password. Please try again.", "error");
        }
    });
}

if(getEl('btnResendVerification')) {
    getEl('btnResendVerification').addEventListener('click', async () => {
        const email = getEl('authEmail').value.trim();
        const pass = getEl('authPass').value;
        if (!email || !pass) return showAlert("Please enter email and password to resend.", "error");
        
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, pass);
            await sendEmailVerification(userCredential.user);
            await signOut(auth);
            getEl('unverifiedAlert')?.classList.add('hidden');
            showAlert("Verification email sent! Check your inbox.", "success");
        } catch (error) {
            showAlert("Failed to send verification: " + error.message, "error");
        }
    });
}

if(getEl('btnResetPass')) {
    getEl('btnResetPass').addEventListener('click', async () => {
        const email = getEl('resetEmail').value.trim();
        if (!email) return showAlert("Please enter your email first!", "error");

        try {
            await sendPasswordResetEmail(auth, email);
            showAlert("Password reset link has been sent to your email!", "success");
            toggleView('loginView');
        } catch (error) { showAlert(error.message, "error"); }
    });
}

const logoutUser = () => signOut(auth).then(() => location.reload());
window.logout = logoutUser;
if(getEl('btnLogout')) getEl('btnLogout').onclick = logoutUser;

if (getEl('btnChangePass')) {
    getEl('btnChangePass').onclick = async () => {
        const newPass = getEl('newPassword').value;
        if(newPass.length < 6) return showAlert("Password must be at least 6 characters.", "error");
        try {
            await updatePassword(auth.currentUser, newPass);
            showAlert("Password updated successfully!", "success");
            getEl('newPassword').value = '';
        } catch (e) { showAlert("Error: Please logout and login via Email to change password.", "error"); }
    };
}

// --- 6. UI STATE & GITHUB REPOS ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        if(getEl('navLoginBtn')) getEl('navLoginBtn').classList.add('hidden');
        if(getEl('navProfileSection')) getEl('navProfileSection').classList.remove('hidden');
        
        let name = "Guest";
        if (user.displayName) {
            name = user.displayName;
        } else if (user.email) {
            name = user.email.split('@')[0];
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        const email = user.email;
        const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${name}&background=random`;

        if(getEl('dropName')) getEl('dropName').innerText = name;
        if(getEl('dropEmail')) getEl('dropEmail').innerText = email;
        if(getEl('navUserName')) getEl('navUserName').innerText = name;
        if(getEl('navAvatar')) getEl('navAvatar').src = avatarUrl;
        if(getEl('dropAvatar')) getEl('dropAvatar').src = avatarUrl;

        fetchGitHubRepos(user);
    } else {
        if(getEl('navLoginBtn')) getEl('navLoginBtn').classList.remove('hidden');
        if(getEl('navProfileSection')) getEl('navProfileSection').classList.add('hidden');
    }
});

const fetchGitHubRepos = async (user) => {
    const githubConnectOption = getEl('githubConnectOption');
    const repoList = getEl('repoList');
    if(!repoList) return; 
    
    let isGithub = false;
    let githubUsername = "";

    user.providerData.forEach((profile) => {
        if (profile.providerId === 'github.com') {
            isGithub = true;
            githubUsername = user.reloadUserInfo?.screenName || profile.email.split('@')[0];
        }
    });

    if (isGithub && githubUsername) {
        if(githubConnectOption) githubConnectOption.classList.add('hidden');
        repoList.innerHTML = `<p class="text-sm text-slate-500 animate-pulse col-span-2">Fetching Repositories...</p>`;
        
        try {
            const res = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=12`);
            const repos = await res.json();
            
            repoList.innerHTML = "";
            repos.forEach(repo => {
                repoList.innerHTML += `
                    <div class="p-4 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 cursor-pointer bg-slate-50 dark:bg-slate-900/50 transition shadow-sm"
                         onclick="document.getElementById('user').value='${repo.owner.login}'; document.getElementById('repo').value='${repo.name}';">
                        <h4 class="font-bold text-blue-600 dark:text-blue-400 text-sm truncate">${repo.name}</h4>
                        <p class="text-xs text-slate-500 mt-1">⭐ ${repo.stargazers_count} | 🍴 ${repo.forks_count}</p>
                    </div>
                `;
            });
        } catch (e) {
            repoList.innerHTML = `<p class="text-red-500 text-sm col-span-2">Could not load repos. Rate limit exceeded.</p>`;
        }
    } else {
        if(githubConnectOption) githubConnectOption.classList.remove('hidden');
        repoList.innerHTML = "";
    }
};

// --- 7. AUTO FILE FETCHER (Bina Path Ke) ---
window.currentRepoFiles = [];

const fetchFiles = async () => {
    const user = getEl('user')?.value.trim();
    const repo = getEl('repo')?.value.trim();
    const branch = getEl('branch')?.value.trim() || 'main';

    if (!user || !repo) return showAlert("Please enter Username and Repository!", "error");

    const fileBrowser = getEl('file-browser');
    const fileList = getEl('fileList');
    const statusMsg = getEl('status-message');
    
    if(statusMsg) statusMsg.innerText = "Fetching files from GitHub...";
    if(fileBrowser) fileBrowser.classList.remove('hidden');
    if(fileList) fileList.innerHTML = '<li class="p-4 text-center text-slate-500 animate-pulse">Loading files...</li>';

    try {
        const response = await fetch(`https://api.github.com/repos/${user}/${repo}/git/trees/${branch}?recursive=1`);
        const data = await response.json();

        if (data.message) throw new Error(data.message);

        window.currentRepoFiles = data.tree.filter(file => file.type === 'blob'); 
        if(statusMsg) statusMsg.innerText = `Success! Found ${window.currentRepoFiles.length} files.`;
        renderFileList(window.currentRepoFiles);

    } catch (error) {
        if(statusMsg) statusMsg.innerText = "";
        if(fileList) fileList.innerHTML = `<li class="p-4 text-center text-red-500">Error: Could not load files. Check repo name.</li>`;
        showAlert("Failed to fetch repository files.", "error");
    }
};
window.fetchFiles = fetchFiles;

const renderFileList = (files) => {
    const fileList = getEl('fileList');
    if(!fileList) return;
    fileList.innerHTML = '';

    if(files.length === 0) {
        fileList.innerHTML = '<li class="p-4 text-center text-slate-500">No files found.</li>';
        return;
    }

    files.forEach(file => {
        fileList.innerHTML += `
            <li class="p-3 flex justify-between items-center hover:bg-slate-100 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-700 transition">
                <span class="text-sm font-mono truncate text-slate-700 dark:text-slate-300" style="max-width: 70%;" title="${file.path}">
                    📄 ${file.path}
                </span>
                <button onclick="generateSpecificLink('${file.path}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition">
                    Generate Link
                </button>
            </li>
        `;
    });
};
window.renderFileList = renderFileList;

const filterFiles = () => {
    const query = getEl('search').value.toLowerCase();
    if(!window.currentRepoFiles) return;
    const filteredFiles = window.currentRepoFiles.filter(file => file.path.toLowerCase().includes(query));
    renderFileList(filteredFiles);
};
window.filterFiles = filterFiles;

const generateSpecificLink = async (filePath) => {
    const user = getEl('user').value.trim();
    const repo = getEl('repo').value.trim();
    const branch = getEl('branch').value.trim() || 'main';
    const provider = getEl('cdnProvider') ? getEl('cdnProvider').value : 'jsdelivr';

    let cdnUrl = "";
    if (provider === 'jsdelivr') cdnUrl = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${filePath}`;
    else if (provider === 'statically') cdnUrl = `https://pagedelivr.statically.io/gh/${user}/${repo}/${branch}/${filePath}`;
    else cdnUrl = `https://unpkg.com/${user}@${branch}/${filePath}`;

    const outputContainer = getEl('output-container');
    const outputDiv = getEl('output');
    
    if(outputContainer) outputContainer.classList.remove('hidden');
    
    // HTML TAG LOGIC
    const ext = filePath.split('.').pop().toLowerCase();
    const fileName = filePath.split('/').pop();
    let tagValue = "";
    if (ext === "js") tagValue = `<script src="${cdnUrl}"><\/script>`;
    else if (ext === "css") tagValue = `<link rel="stylesheet" href="${cdnUrl}">`;
    else if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) tagValue = `<img src="${cdnUrl}" alt="${fileName}">`;
    
    const safeTag = tagValue ? tagValue.replace(/"/g, '&quot;') : '';

    if(outputDiv) {
        outputDiv.innerHTML = `
            <p class="text-sm text-slate-600 dark:text-slate-300"><span class="font-bold">File:</span> ${fileName}</p>
            <div class="space-y-2 pt-2">
                <p class="font-bold text-xs uppercase text-slate-500 tracking-wide">CDN Link</p>
                <div class="flex">
                    <input value="${cdnUrl}" readonly class="flex-grow p-3 border border-slate-200 dark:border-slate-600 rounded-l-lg bg-slate-50 dark:bg-slate-900 text-sm font-mono text-slate-800 dark:text-slate-200 truncate outline-none">
                    <button class="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-r-lg hover:bg-blue-100 dark:hover:bg-blue-800 border border-l-0 border-slate-200 dark:border-slate-600 transition" onclick="navigator.clipboard.writeText('${cdnUrl}'); showAlert('Copied!', 'success')">📋</button>
                </div>
            </div>
            ${tagValue ? `<div class="space-y-2 pt-4"><p class="font-bold text-xs uppercase text-slate-500 tracking-wide">HTML Tag</p><div class="flex"><input value='${tagValue}' readonly class="flex-grow p-3 border border-slate-200 dark:border-slate-600 rounded-l-lg bg-slate-50 dark:bg-slate-900 text-sm text-blue-600 dark:text-blue-400 font-mono truncate outline-none"><button class="bg-blue-50 dark:bg-blue-900/30 p-3 rounded-r-lg hover:bg-blue-100 dark:hover:bg-blue-800 border border-l-0 border-slate-200 dark:border-slate-600 transition" onclick="navigator.clipboard.writeText('${safeTag}'); showAlert('Copied HTML Tag!', 'success')">📋</button></div></div>` : ''}
        `;
    }
};
window.generateSpecificLink = generateSpecificLink;


// --- 8. HISTORY FETCHING ---
const loadHistory = async () => {
    const historyList = getEl('historyList');
    if(!historyList) return;

    if (!auth.currentUser) {
        historyList.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">Please login to view history.</p>';
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
        snapshot.forEach(doc => historyItems.push(doc.data()));
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
                    <button onclick="navigator.clipboard.writeText('${data.link}'); showAlert('Copied!', 'success');" class="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border opacity-0 group-hover:opacity-100 transition hover:bg-slate-200">📋</button>
                </div>
            `;
        });
    } catch(e) {
        console.error(e);
        historyList.innerHTML = '<p class="text-center py-6 text-red-500">Error loading history.</p>';
    }
};
window.loadHistory = loadHistory;


// --- 9. BLOG / ARTICLES LOGIC ---
const loadBlogArticles = async () => {
    const blogContainer = getEl('blogContainer');
    if(!blogContainer) return;

    blogContainer.innerHTML = '<p class="text-center py-10 text-slate-500 animate-pulse">Loading Articles...</p>';

    try {
        const response = await fetch('articles.json'); 
        if (!response.ok) throw new Error("File not found");
        
        const articles = await response.json();
        blogContainer.innerHTML = '';

        if(articles.length === 0) {
            blogContainer.innerHTML = '<p class="text-center py-10 text-slate-500">No articles published yet.</p>';
            return;
        }

        articles.forEach(article => {
            blogContainer.innerHTML += `
                <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 hover:shadow-lg transition mb-6">
                    <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">${article.title}</h3>
                    <p class="text-xs text-slate-500 mb-4">📅 ${article.date}</p>
                    <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">${article.excerpt}</p>
                    <a href="${article.url}" class="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline">Read More →</a>
                </div>
            `;
        });
    } catch (error) {
        blogContainer.innerHTML = `
            <div class="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-md border border-slate-200 dark:border-slate-700">
                <h3 class="text-xl font-bold text-slate-900 dark:text-white mb-2">How to use GitHub as a Free CDN</h3>
                <p class="text-xs text-slate-500 mb-4">📅 Today</p>
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-4">Learn how to easily convert your raw GitHub files into production-ready CDN links using GitDelivr...</p>
                <button onclick="window.switchTab('home')" class="text-blue-600 dark:text-blue-400 font-bold text-sm hover:underline">Try the Tool →</button>
            </div>
        `;
    }
};
window.loadBlogArticles = loadBlogArticles;