import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, addDoc, collection, serverTimestamp, setDoc, increment, deleteDoc, orderBy, query, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global State ---
let fileCache = [];
let currentCdnLink = "";
let currentRepoInfo = { user: "", repo: "", branch: "", file: "" };

// Elements
const statusMessage = document.getElementById("status-message");
const fileBrowser = document.getElementById("file-browser");
const outputContainer = document.getElementById("output-container");
const zipButton = document.getElementById("zip-download-button");
const aiSection = document.getElementById("ai-section");
const aiOutputContainer = document.getElementById("aiOutputContainer");
const aiLoading = document.getElementById("aiLoading");
const aiContent = document.getElementById("aiContent");
const aiOutputTitle = document.getElementById("aiOutputTitle");

// Dark Mode
(function() { if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) { document.body.classList.add('dark'); } })();

// Utilities
const escapeHtmlForOnclick = (str) => str ? str.replace(/\\/g, "\\\\").replace(/'/g, "\\'") : '';
const escapeHtmlAttribute = (str) => str ? str.replace(/"/g, '&quot;') : '';

// --- URL AUTO-FILL ---
        // --- URL AUTO-FILL ---
        function parseGitHubUrl(url) {
            url = url.trim();
            if (!url || !url.includes("github.com")) return;
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/').filter(p => p);
                if (pathParts.length >= 2) {
                    const user = pathParts[0];
                    const repo = pathParts[1];
                    document.getElementById('user').value = user;
                    document.getElementById('repo').value = repo;
                    if (pathParts.length >= 4 && (pathParts[2] === 'tree' || pathParts[2] === 'blob')) {
                        document.getElementById('branch').value = pathParts[3];
                    } else if (!document.getElementById('branch').value) {
                        document.getElementById('branch').value = 'main';
                    }
                }
            } catch (e) {}
        }

// --- CORE LOGIC (GitHub API) ---
function fetchFiles() {
    const user = document.getElementById("user").value.trim();
    const repo = document.getElementById("repo").value.trim();
    const branch = document.getElementById("branch").value.trim() || "main";
    const token = document.getElementById("token").value.trim();

    if (!user || !repo) {
        statusMessage.textContent = "GitHub Username and Repository Name are required.";
        return;
    }
    currentRepoInfo = { user, repo, branch, file: "" };
    statusMessage.textContent = "Fetching repository data...";
    fileBrowser.classList.add("hidden");
    outputContainer.classList.add("hidden");

    const githubApiUrl = `https://api.github.com/repos/${user}/${repo}/git/trees/${branch}?recursive=1`;
    const headers = token ? { Authorization: `token ${token}` } : {};

    fetch(githubApiUrl, { headers: headers })
    .then(res => res.json())
    .then(data => {
        if (data.message === "Bad credentials") throw new Error("❌ Invalid GitHub Token. Clear the token field for public repos.");
        if (data.message === "Not Found") throw new Error("❌ Repository not found. Check spelling or visibility.");
        if (!data.tree) throw new Error(data.message || "Invalid repo details");
        
        fileCache = data.tree.filter(f => f.type === "blob");
        renderFileList(fileCache, user, repo, branch);
        statusMessage.textContent = `Success! Found ${fileCache.length} files.`;
        statusMessage.className = "mt-4 text-center text-sm text-green-600 dark:text-green-400 font-medium";
        fileBrowser.classList.remove("hidden");
        document.getElementById("search").value = "";
        zipButton.disabled = fileCache.length === 0;
    })
    .catch(err => {
        statusMessage.textContent = `${err.message}`;
        statusMessage.className = "mt-4 text-center text-sm text-red-500 dark:text-red-400 font-medium";
    });
}

function renderFileList(files, user, repo, branch) {
    const list = document.getElementById("fileList");
    list.innerHTML = files.length ? "" : `<li class="p-4 text-center text-slate-500">No files found.</li>`;
    files.forEach(f => {
        const cdn = `https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${f.path}`;
        const li = document.createElement("li");
        li.className = "flex justify-between items-center p-4 hover:bg-slate-50 dark:hover:bg-slate-700 transition duration-150";
        li.innerHTML = `<span class="truncate pr-4 text-sm text-slate-700 dark:text-slate-300">${f.path}</span><button class="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3 rounded-lg transition" onclick="showCDN('${cdn}', '${escapeHtmlForOnclick(f.path)}')">Generate Link</button>`;
        list.appendChild(li);
    });
}

function showCDN(cdnLink, path) {
    outputContainer.classList.remove("hidden");
    aiSection.classList.remove("hidden");
    aiOutputContainer.classList.add("hidden");
    currentCdnLink = cdnLink;
    currentRepoInfo.file = path;

    const output = document.getElementById("output");
    const ext = path.split('.').pop().toLowerCase();
    const fileName = path.split('/').pop();
    let tagValue = "";

    if (ext === "js") tagValue = `<script src="${cdnLink}"><\/script>`;
    else if (ext === "css") tagValue = `<link rel="stylesheet" href="${cdnLink}">`;
    else if (["png", "jpg", "jpeg", "gif", "svg"].includes(ext)) tagValue = `<img src="${cdnLink}" alt="${fileName}">`;
    
    const safeTag = escapeHtmlAttribute(tagValue);
    const safeLink = escapeHtmlAttribute(cdnLink);

    output.innerHTML = `
        <p class="text-sm text-slate-600 dark:text-slate-300"><span class="font-bold">File:</span> ${fileName}</p>
        <div class="space-y-2 pt-2">
            <p class="font-bold text-xs uppercase text-slate-500 tracking-wide">CDN Link</p>
            <div class="flex"><input value="${cdnLink}" readonly class="flex-grow p-3 border border-slate-200 dark:border-slate-600 rounded-l-lg bg-slate-50 dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300 truncate"><button class="bg-slate-200 dark:bg-slate-600 p-3 rounded-r-lg hover:bg-slate-300 dark:hover:bg-slate-500 transition" onclick="copyToClipboard('${safeLink}')">📋</button></div>
        </div>
        ${tagValue ? `<div class="space-y-2 pt-4"><p class="font-bold text-xs uppercase text-slate-500 tracking-wide">HTML Tag</p><div class="flex"><input value='${tagValue}' readonly class="flex-grow p-3 border border-slate-200 dark:border-slate-600 rounded-l-lg bg-slate-50 dark:bg-slate-900 text-sm text-blue-600 dark:text-blue-400 font-mono truncate"><button class="bg-slate-200 dark:bg-slate-600 p-3 rounded-r-lg hover:bg-slate-300 dark:hover:bg-slate-500 transition" onclick="copyToClipboard('${safeTag}')">📋</button></div></div>` : ''}
        <a class="inline-flex items-center mt-6 text-emerald-600 dark:text-emerald-400 hover:underline text-sm font-medium" href="${cdnLink}" download="${fileName}"><svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Download File</a>
    `;
    outputContainer.scrollIntoView({ behavior: 'smooth' });
}

// --- ZIP & UTILS ---
async function downloadAllAsZip() {
    if (!fileCache.length) return;
    const user = document.getElementById("user").value.trim();
    const repo = document.getElementById("repo").value.trim();
    const branch = document.getElementById("branch").value.trim() || "main";
    const zip = new JSZip();
    let promises = [];
    let processed = 0;
    
    zipButton.disabled = true;
    zipButton.textContent = "Preparing...";

    for (let f of fileCache) {
        promises.push(fetch(`https://cdn.jsdelivr.net/gh/${user}/${repo}@${branch}/${f.path}`).then(r => r.ok ? r.arrayBuffer() : null).then(d => { if(d) zip.file(f.path, d); processed++; zipButton.textContent = `Downloading (${Math.round((processed/fileCache.length)*100)}%)...`; }).catch(e => { zip.file(f.path + ".error.txt", e.message); processed++; }));
    }
    await Promise.allSettled(promises);
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${repo}-${branch}.zip`;
    link.click();
    zipButton.disabled = false;
    zipButton.textContent = "Download All Files as ZIP";
    showCopyAlert("Download Started!", "bg-emerald-500");
}

function copyToClipboard(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    try { document.execCommand('copy'); showCopyAlert("Copied!", "bg-green-500"); } catch(e) {}
    document.body.removeChild(el);
}

function showCopyAlert(msg, color) {
    const alert = document.getElementById("customAlert");
    alert.textContent = msg;
    alert.className = `${color} text-white font-semibold py-3 px-6 rounded-lg shadow-lg`;
    alert.classList.add("show");
    setTimeout(() => alert.classList.remove("show"), 2000);
}

function filterFiles() {
    const key = document.getElementById("search").value.toLowerCase();
    const filtered = fileCache.filter(f => f.path.toLowerCase().includes(key));
    const user = document.getElementById("user").value;
    const repo = document.getElementById("repo").value;
    const branch = document.getElementById("branch").value || "main";
    renderFileList(filtered, user, repo, branch);
}

// =======================================================
// --- AI & CHAT (SECURE SERVERLESS INTEGRATION) ---
// =======================================================

/**
 * Calls the serverless function located at /.netlify/functions/gemini
 */
async function callGemini(title, prompt, isChat = false) {
    // 1. UI Setup (If not chat, show the AI Modal)
    if (!isChat) {
        aiOutputContainer.classList.remove('hidden');
        if(aiOutputTitle) aiOutputTitle.textContent = title;
        aiLoading.classList.remove('hidden');
        aiContent.innerHTML = "";
    }

    try {
        // 2. Fetch from Netlify Function
        const response = await fetch("https://gitdelivr.netlify.app/.netlify/functions/gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                prompt: prompt,
                history: isChat ? chatHistory : null 
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `Server Error: ${response.status}`);
        }

        const aiText = data.response;
        
        // 3. Handle Response
        if (isChat) return aiText;

        // Update UI for Tool usage
        aiLoading.classList.add('hidden');
        aiContent.textContent = aiText;

    } catch (e) {
        console.error("AI Error:", e);
        const errorMessage = "Our AI Chat Support is getting an upgrade. We’re building a smarter, faster way to help you. We'll be live very soon!";
        
        if (isChat) return errorMessage;

        aiLoading.classList.add('hidden');
        aiContent.textContent = errorMessage + ` (${e.message})`;
    }
}
//⚠️ Failed to fetch AI response. Please try again later.
function triggerAiUsage() {
    const prompt = `Generate a code snippet and usage explanation for the file '${currentRepoInfo.file}' which is a ${currentRepoInfo.file.split('.').pop()} file. The CDN link is: ${currentCdnLink}. Keep it concise.`;
    callGemini("Installation Guide", prompt);
}

function triggerAiSummary() {
    const prompt = `Analyze the GitHub repository ${document.getElementById("user").value}/${document.getElementById("repo").value} based on standard naming conventions. Explain what this project likely does.`;
    callGemini("Repository Analysis", prompt);
}

// --- Chat Logic ---
const chatBtn = document.getElementById('chatToggle');
const chatWindow = document.getElementById('chatWindow');
const closeChat = document.getElementById('closeChat');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendMessage');
const messagesContainer = document.getElementById('chatMessages');
const clearChatBtn = document.getElementById('clearChat');

// Chat System Prompt
const isToolPage = !!document.getElementById('file-browser');
const systemPrompt = isToolPage 
    ? "System: You are the Anux CDN Support Assistant. Use the user's name if known. Keep answers short.\n"
    : `System: You are the GitDelivr Support Assistant. 
       KNOWLEDGE BASE:
       1. WHAT WE DO: Convert raw GitHub file links into jsDelivr CDN links.
       2. FEATURES: Global Edge Network, Smart HTML Generation, Repo Archiving.
       3. PRICING: 100% Free and Open Source.
       4. CREATOR: Anurag.
       Keep answers concise.`;

let chatHistory = systemPrompt + "\n";

if(chatBtn) {
    const toggle = () => chatWindow.classList.toggle('open');
    chatBtn.onclick = toggle;
    if(closeChat) closeChat.onclick = toggle;
    
    const handleSend = async () => {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // User Msg
        messagesContainer.innerHTML += `<div class="flex justify-end mb-2"><div class="bg-blue-600 text-white rounded-tr-none p-3 rounded-lg max-w-[85%] text-sm shadow-sm">${escapeHtmlAttribute(text)}</div></div>`;
        chatInput.value = '';
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Update history
        chatHistory += `User: ${text}\n`;

        // Loading Bubble
        const loadId = 'l-' + Date.now();
        messagesContainer.innerHTML += `<div id="${loadId}" class="flex justify-start mb-2"><div class="bg-gray-100 dark:bg-slate-700 p-3 rounded-lg text-xs text-gray-500 animate-pulse">Thinking...</div></div>`;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // AI Call
        const response = await callGemini(null, text, true);
        
        // Update history with bot response
        if (!response.startsWith("⚠️")) {
            chatHistory += `Assistant: ${response}\n`;
        }
        
        document.getElementById(loadId).remove();
        messagesContainer.innerHTML += `<div class="flex justify-start mb-2"><div class="bg-blue-100 dark:bg-blue-900 text-slate-800 dark:text-slate-200 rounded-tl-none p-3 rounded-lg max-w-[85%] text-sm shadow-sm">${response}</div></div>`;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    };

    sendBtn.onclick = handleSend;
    chatInput.onkeypress = (e) => { if(e.key === 'Enter') handleSend() };

    if(clearChatBtn) {
        clearChatBtn.onclick = () => {
            messagesContainer.innerHTML = `
            <div class="flex items-start">
                <div class="bg-blue-100 dark:bg-blue-900 text-slate-800 dark:text-slate-200 p-3 rounded-lg rounded-tl-none max-w-[85%] text-sm shadow-sm">
                    Hi there! 👋 I'm the GitDelivr AI assistant.
                </div>
            </div>`;
            chatHistory = systemPrompt + "\n";
        };
    }

    // Auto-open chat on landing page
    if (!isToolPage) {
        setTimeout(() => { 
            chatWindow.classList.add('open');
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.volume = 0.5;
            audio.play().catch(() => {});
        }, 5000);
    }
}


// --- EXPOSE FUNCTIONS TO WINDOW ---
window.fetchFiles = fetchFiles;
window.filterFiles = filterFiles;
window.downloadAllAsZip = downloadAllAsZip;
window.showCDN = showCDN;
window.copyToClipboard = copyToClipboard;
window.triggerAiUsage = triggerAiUsage;
window.triggerAiSummary = triggerAiSummary;


// =======================================================
// --- FIREBASE LOGIC ---
// =======================================================

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
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

async function initAuth() {
    try {
        if (!auth.currentUser) await signInAnonymously(auth);
        initAnalytics();
        setupRealtimeReviews();
        listenForMaintenanceMode();
        listenForAnnouncement();
    } catch (e) {
        console.error("Anonymous auth failed", e);
    }
}

function listenForMaintenanceMode() {
    const settingsRef = doc(db, 'settings', 'config');
    const overlay = document.getElementById('maintenanceOverlay');
    const msgEl = document.getElementById('maintenanceMessage');
    let maintenanceTimeout;

    onSnapshot(settingsRef, (docSnap) => {
        const data = docSnap.exists() ? docSnap.data() : {};
        let isMaintenance = data.maintenanceMode === true;
        const isAdmin = localStorage.getItem('adminAuth') === 'true';
        
        // Clear existing timeout
        if (maintenanceTimeout) clearTimeout(maintenanceTimeout);

        // Check Schedule
        if (!isMaintenance && data.scheduledStart) {
            const start = data.scheduledStart.toDate();
            const now = new Date();
            if (now >= start) {
                isMaintenance = true;
            } else {
                const delay = start - now;
                if (delay > 0 && delay < 2147483647) {
                    maintenanceTimeout = setTimeout(() => {
                        if (!localStorage.getItem('adminAuth')) {
                            overlay.classList.remove('hidden');
                            overlay.classList.add('flex');
                        }
                    }, delay);
                }
            }
        }

        if (isMaintenance && !isAdmin) {
            if(msgEl) msgEl.innerText = data.message || "The tool is currently unavailable. Please check back later.";
            overlay.classList.remove('hidden');
            overlay.classList.add('flex');
        } else {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');

            // Show Admin Badge if maintenance is active but bypassed
            if (isMaintenance && isAdmin) {
                let badge = document.getElementById('adminMaintenanceBadge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'adminMaintenanceBadge';
                    badge.className = 'fixed bottom-20 left-4 bg-yellow-500 text-white px-3 py-1 rounded-full text-xs font-bold z-[2000] shadow-lg pointer-events-none';
                    badge.innerText = 'Maintenance Mode Active (Admin Bypass)';
                    document.body.appendChild(badge);
                }
            } else {
                const badge = document.getElementById('adminMaintenanceBadge');
                if (badge) badge.remove();
            }
        }
    }, (error) => {
        console.error("Could not listen for maintenance mode:", error);
    });
}

// --- Announcement Logic ---
function listenForAnnouncement() {
    const announcementRef = doc(db, 'settings', 'announcement');
    const banner = document.getElementById('announcementBanner');
    const text = document.getElementById('announcementText');
    const title = document.getElementById('announcementTitle');
    const iconContainer = document.getElementById('announcementIcon');
    const closeBtn = document.getElementById('closeAnnouncement');

    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            banner.classList.add('-translate-y-full');
            sessionStorage.setItem('announcementClosed', 'true');
            // Only close THIS specific message
            const currentMsg = document.getElementById('announcementText').innerText;
            sessionStorage.setItem('closedAnnouncement', currentMsg);
        });
    }

    onSnapshot(announcementRef, (snap) => {
        if(snap.exists()) {
            const data = snap.data();
            const wasClosed = sessionStorage.getItem('closedAnnouncement') === data.message;

            if(data.active && data.message && !wasClosed) {
                text.innerText = data.message;
                
                // Reset colors and apply new type
                const baseClasses = "relative z-[2000] hidden transform -translate-y-full transition-all duration-500 ease-out shadow-md";
                let typeClass = "bg-blue-600 text-white";
                let iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
                let titleText = "INFO";

                if (data.type === 'warning') {
                    typeClass = "bg-amber-500 text-white";
                    iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
                    titleText = "WARNING";
                } else if (data.type === 'error') {
                    typeClass = "bg-rose-600 text-white";
                    iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
                    titleText = "CRITICAL";
                }

                banner.className = `${baseClasses} ${typeClass}`;
                if(iconContainer) iconContainer.innerHTML = iconSvg;
                if(title) title.innerText = titleText;

                banner.classList.remove('hidden');
                setTimeout(() => banner.classList.remove('-translate-y-full'), 100);
            } else { banner.classList.add('-translate-y-full'); }
        }
    });
}

// --- Newsletter Submission ---
const newsletterForm = document.getElementById('newsletterForm');

if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById('newsletterEmail');
        const btn = newsletterForm.querySelector('button');
        const email = emailInput.value;

        if (!email) return;

        try {
            if (!auth.currentUser) await signInAnonymously(auth);

            const originalText = btn.innerText;
            btn.disabled = true;
            btn.innerText = "...";

            await addDoc(collection(db, 'subscribers'), { email, timestamp: serverTimestamp() });

            btn.innerText = "✓";
            emailInput.value = '';
            setTimeout(() => { btn.disabled = false; btn.innerText = originalText; }, 3000);

        } catch (error) {
            console.error("Error subscribing:", error);
            alert("Subscription failed. Error: " + (error.message || "Unknown error."));
            btn.disabled = false;
            btn.innerText = "Subscribe";
        }
    });
}

// --- Analytics Logic ---
const initAnalytics = async () => {
    const today = new Date().toISOString().split('T')[0];
    const statsRef = doc(db, 'site_stats', today);
    
    try { await setDoc(statsRef, { views: increment(1) }, { merge: true }); } catch (e) {}

    let startTime = Date.now();
    const sendTime = async () => {
        const duration = (Date.now() - startTime) / 1000;
        if (duration < 1) return;
        startTime = Date.now();
        try { await setDoc(statsRef, { totalDuration: increment(duration) }, { merge: true }); } catch (e) {}
    };

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sendTime(); });
    window.addEventListener('beforeunload', sendTime);
};

// --- Realtime Reviews Logic ---
function setupRealtimeReviews() {
    const grid = document.getElementById('testimonialsGrid');
    if (!grid) return;

    onSnapshot(collection(db, 'reviews'), (snapshot) => {
        const reviews = [];
        snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
        reviews.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

        document.querySelectorAll('.dynamic-review').forEach(el => el.remove());
        
        [...reviews].reverse().forEach(review => {
            const html = `
                <div class="dynamic-review bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-900 animate-fade-in-up">
                    <div class="flex text-yellow-400 mb-4">${"★".repeat(review.rating)}</div>
                    <p class="text-slate-600 dark:text-slate-300 italic mb-4">"${review.text}"</p>
                    <div class="font-bold text-slate-900 dark:text-white">- ${review.name}</div>
                </div>`;
            grid.insertAdjacentHTML('afterbegin', html);
        });
    });
}

// --- Review Submission ---
const submitReviewBtn = document.getElementById('submitReview');
if (submitReviewBtn) {
    submitReviewBtn.addEventListener('click', async () => {
        const stars = document.querySelectorAll('.star-rating button');
        const activeStars = Array.from(stars).filter(s => s.classList.contains('active'));
        const rating = activeStars.length; 

        if(!rating) return alert("Select a rating!");
        const text = document.getElementById('reviewText').value;
        const name = document.getElementById('reviewName').value || "Anonymous";
        if (!text) return alert("Please write a review!");

        try {
            submitReviewBtn.innerText = "Posting...";
            submitReviewBtn.disabled = true;
            await addDoc(collection(db, 'reviews'), { name, rating, text, timestamp: serverTimestamp() });

            document.getElementById('modalForm').classList.add('hidden');
            document.getElementById('modalSuccess').classList.remove('hidden');
            
            setTimeout(() => { 
                document.getElementById('reviewModal').classList.remove('active'); 
                document.getElementById('modalForm').classList.remove('hidden'); 
                document.getElementById('modalSuccess').classList.add('hidden'); 
                document.getElementById('reviewText').value = '';
                submitReviewBtn.innerText = "Submit Review";
                submitReviewBtn.disabled = false;
                stars.forEach(btn => { btn.classList.remove('active'); btn.style.removeProperty('color'); });
            }, 2000);
        } catch(e) {
            alert("Error saving review.");
            submitReviewBtn.disabled = false;
        }
    });
}
// =======================================================
// --- BLOGGER FEED INTEGRATION ---
// =======================================================

function showBlogs(json) {
    const container = document.getElementById("blog-container");
    if (!container) return;

    const posts = json.feed.entry;
    if (!posts || posts.length === 0) {
        container.innerHTML = '<p class="col-span-full text-center text-slate-500">No blog posts found.</p>';
        return;
    }

    let html = "";
    
    // Loop through posts (max 3)
    for (let i = 0; i < Math.min(3, posts.length); i++) {
        const post = posts[i];
        const title = post.title.$t;
        // Find the actual link to the post
        const linkObj = post.link.find(l => l.rel === "alternate");
        const link = linkObj ? linkObj.href : "#";
        
        // Extract Image (Use high-res if available)
        let image = "";
        if (post.media$thumbnail) {
             const imgUrl = post.media$thumbnail.url.replace(/s72-c/, "s600"); // Get higher resolution
             image = `<img src="${imgUrl}" alt="${title}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" loading="lazy">`;
        } else {
             // Fallback placeholder
             image = `<div class="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-slate-700 text-slate-400">
                        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"></path></svg>
                      </div>`;
        }

        html += `
        <article class="reveal delay-${(i+1)*100} bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-xl hover:border-blue-500/20 transition-all duration-300 group hover:-translate-y-2 flex flex-col h-full overflow-hidden">
          <div class="h-48 overflow-hidden bg-gray-100 dark:bg-slate-700 relative">
             ${image}
          </div>
          <div class="p-6 flex-1 flex flex-col">
            <h3 class="text-lg font-bold mb-3 text-slate-900 dark:text-white leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                <a href="${link}" target="_blank">${title}</a>
            </h3>
            <div class="mt-auto pt-4 border-t border-slate-100 dark:border-slate-700">
                <a href="${link}" target="_blank" class="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 inline-flex items-center transition-colors">
                    Read Article 
                    <svg class="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                </a>
            </div>
          </div>
        </article>`;
    }

    container.innerHTML = html;
    
    // Trigger animations for new elements
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { 
            if (entry.isIntersecting) { 
                entry.target.classList.add('active'); 
                observer.unobserve(entry.target); 
            }
        });
    }, { threshold: 0.1 });
    
    container.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// CRITICAL: Expose the function to the global window object
// This allows the Blogger JSONP callback to find it!
window.showBlogs = showBlogs;// --- Contact Form ---
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submitContact');
        const status = document.getElementById('contactStatus');
        const data = {
            name: document.getElementById('contactName').value,
            email: document.getElementById('contactEmail').value,
            message: document.getElementById('contactMessage').value,
            timestamp: serverTimestamp()
        };

        try {
            btn.disabled = true; btn.innerText = "Sending...";
            
            await addDoc(collection(db, 'messages'), data);

            status.innerText = "Message sent successfully!";
            status.classList.remove('hidden');
            contactForm.reset();
            setTimeout(() => { status.classList.add('hidden'); btn.disabled = false; btn.innerText = "Send Message"; }, 5000);
        } catch (error) {
            status.innerText = "Failed to send message.";
            status.classList.remove('hidden');
            btn.disabled = false;
        }
    });
}

// --- UI Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu
    const btn = document.getElementById('mobile-menu-button');
    const menu = document.getElementById('mobile-menu');
    if (btn && menu) btn.addEventListener('click', () => menu.classList.toggle('hidden'));

    // Scroll Reveal
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('active'); observer.unobserve(entry.target); }});
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // Modals
    const toggleModal = (id, show) => { const el = document.getElementById(id); if(el) show ? el.classList.add('active') : el.classList.remove('active'); };
    
    document.getElementById('openReviewModal')?.addEventListener('click', () => toggleModal('reviewModal', true));
    document.getElementById('closeModal')?.addEventListener('click', () => toggleModal('reviewModal', false));
    
    document.getElementById('openTosModal')?.addEventListener('click', (e) => { e.preventDefault(); toggleModal('tosModal', true); });
    document.getElementById('closeTosModal')?.addEventListener('click', () => toggleModal('tosModal', false));
    document.getElementById('acceptTos')?.addEventListener('click', () => toggleModal('tosModal', false));

    document.getElementById('openPrivacyModal')?.addEventListener('click', (e) => { e.preventDefault(); toggleModal('privacyModal', true); });
    document.getElementById('closePrivacyModal')?.addEventListener('click', () => toggleModal('privacyModal', false));
    document.getElementById('acceptPrivacy')?.addEventListener('click', () => toggleModal('privacyModal', false));

    // Cookie Banner
    const cookieBanner = document.getElementById('cookieBanner');
    if (cookieBanner && !localStorage.getItem('cookiesAccepted')) {
        setTimeout(() => cookieBanner.classList.remove('translate-y-full'), 1500);
    }
    document.getElementById('acceptCookies')?.addEventListener('click', () => {
        localStorage.setItem('cookiesAccepted', 'true');
        cookieBanner?.classList.add('translate-y-full');
    });

    // Star Rating Visuals
    const stars = document.querySelectorAll('.star-rating button');
    stars.forEach(s => s.addEventListener('click', () => { 
        const val = s.dataset.value; 
        stars.forEach(btn => {
            if (btn.dataset.value <= val) btn.classList.add('active');
            else btn.classList.remove('active');
            btn.style.removeProperty('color');
        });
    }));
});

// Initialize App
initAuth();

// =======================================================
// --- ADMIN PANEL LOGIC ---
// =======================================================

function initAdminPage() {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return; // Exit if not on admin page

    const loginOverlay = document.getElementById('loginOverlay');
    const dashboard = document.getElementById('dashboard');
    const emailInput = document.getElementById('adminEmail');
    const passInput = document.getElementById('adminPass');
    const forgotBtn = document.getElementById('forgotPasswordBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const maintenanceToggle = document.getElementById('maintenanceToggle');

    let dataInitialized = false;

    // Monitor Auth State
    onAuthStateChanged(auth, (user) => {
        if (user && !user.isAnonymous) {
            // User is logged in as admin
            if(loginOverlay) loginOverlay.classList.add('hidden');
            if(dashboard) dashboard.classList.remove('hidden');
            if(!dataInitialized) {
                initData();
                dataInitialized = true;
            }
        } else {
            // User is anonymous or logged out
            if(loginOverlay) loginOverlay.classList.remove('hidden');
            if(dashboard) dashboard.classList.add('hidden');
        }
    });

    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passInput.value;
        if(!email || !password) return alert("Please enter email and password");
        
        const originalText = loginBtn.innerText;
        loginBtn.innerText = "Verifying...";
        loginBtn.disabled = true;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            if("Notification" in window) Notification.requestPermission();
        } catch (error) {
            console.error(error);
            alert("Login Failed: " + error.message);
            loginBtn.innerText = originalText;
            loginBtn.disabled = false;
        }
    });

    if(forgotBtn) {
        forgotBtn.addEventListener('click', async () => {
            const email = emailInput.value;
            if(!email) return alert("Please enter your email address first.");
            try {
                await sendPasswordResetEmail(auth, email);
                alert("Password reset email sent! Check your inbox.");
            } catch (error) {
                alert("Error: " + error.message);
            }
        });
    }

    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOut(auth);
            location.reload();
        });
    }

    if(maintenanceToggle) {
        maintenanceToggle.addEventListener('change', async (e) => {
            const isEnabled = e.target.checked;
            const settingsRef = doc(db, 'settings', 'config');
            try {
                await setDoc(settingsRef, { maintenanceMode: isEnabled }, { merge: true });
                const status = isEnabled ? 'enabled' : 'disabled';
                const toggleLabel = e.target.closest('label');
                toggleLabel.classList.add('scale-active');
                setTimeout(() => toggleLabel.classList.remove('scale-active'), 200);
            } catch (error) {
                console.error("Failed to update maintenance mode:", error);
                alert('Failed to update setting: ' + error.message);
                e.target.checked = !isEnabled; // Revert toggle on error
            }
        });
    }

    // Admin Data & State
    let messagesData = [];
    let subscribersData = [];
    let reviewsData = [];
    let statsData = [];
    let chartInstance = null;
    let currentRange = '7d';

    const notify = (title, body) => {
        if(Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/1827/1827301.png' });
            new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(()=>{});
        }
    };

    async function initData() {
        if (!auth.currentUser) await signInAnonymously(auth);

        // 1. Messages
        let firstMsg = true;
        onSnapshot(query(collection(db, 'messages'), orderBy('timestamp', 'desc')), (snapshot) => {
            messagesData = [];
            snapshot.forEach(d => messagesData.push({id: d.id, ...d.data()}));
            
            if(!firstMsg) {
                snapshot.docChanges().forEach(c => {
                    if(c.type === 'added') notify('New Message 📩', `From: ${c.doc.data().name || 'User'}`);
                });
            }
            firstMsg = false;

            renderMessages(messagesData);
            updateStats();
        }, (error) => {
            document.getElementById('messagesList').innerHTML = `<p class="text-red-500 text-center text-sm py-4">Error: ${error.message}</p>`;
        });

        // 2. Subscribers
        let firstSub = true;
        onSnapshot(query(collection(db, 'subscribers'), orderBy('timestamp', 'desc')), (snapshot) => {
            subscribersData = [];
            snapshot.forEach(d => subscribersData.push({id: d.id, ...d.data()}));
            
            if(!firstSub) {
                snapshot.docChanges().forEach(c => {
                    if(c.type === 'added') notify('New Subscriber 📰', `${c.doc.data().email} joined!`);
                });
            }
            firstSub = false;

            renderSubscribers(subscribersData);
            updateStats();
        }, (error) => {
            document.getElementById('subscribersList').innerHTML = `<p class="text-red-500 text-center text-sm py-4">Error: ${error.message}</p>`;
        });

        // 3. Reviews
        let firstRev = true;
        onSnapshot(query(collection(db, 'reviews'), orderBy('timestamp', 'desc')), (snapshot) => {
            reviewsData = [];
            snapshot.forEach(d => reviewsData.push({id: d.id, ...d.data()}));
            
            if(!firstRev) {
                snapshot.docChanges().forEach(c => {
                    if(c.type === 'added') notify('New Review ⭐', `${c.doc.data().rating} stars from ${c.doc.data().name}`);
                });
            }
            firstRev = false;

            renderReviews(reviewsData);
            updateStats();
        }, (error) => {
            document.getElementById('reviewsList').innerHTML = `<p class="text-red-500 text-center col-span-full text-sm py-4">Error: ${error.message}</p>`;
        });

        // 4. Site Stats
        onSnapshot(collection(db, 'site_stats'), (snapshot) => {
            statsData = [];
            snapshot.forEach(d => statsData.push({ date: d.id, ...d.data() }));
            updateStats();
            window.updateChart(currentRange);
        }, (error) => {
            console.error("Stats error:", error);
            document.getElementById('statTraffic').innerText = "Err";
            document.getElementById('statTime').innerText = "Err";
        });

        // 5. Settings
        const settingsRef = doc(db, 'settings', 'config');
        onSnapshot(settingsRef, (docSnap) => {
            const maintenanceMsgInput = document.getElementById('maintenanceMsgInput');
            const scheduledStatus = document.getElementById('scheduledStatus');
            const scheduledTimeDisplay = document.getElementById('scheduledTimeDisplay');

            if (docSnap.exists()) {
                const data = docSnap.data();
                if(maintenanceToggle) maintenanceToggle.checked = data.maintenanceMode === true;
                if(maintenanceMsgInput) maintenanceMsgInput.value = data.message || '';
                if (data.scheduledStart && scheduledStatus) {
                    scheduledTimeDisplay.innerText = data.scheduledStart.toDate().toLocaleString();
                    scheduledStatus.classList.remove('hidden');
                } else if(scheduledStatus) {
                    scheduledStatus.classList.add('hidden');
                }
            }
        }, (error) => {
            console.error("Settings error:", error);
        });

        document.getElementById('saveMaintenanceMsg')?.addEventListener('click', async () => {
            const message = document.getElementById('maintenanceMsgInput').value;
            const btn = document.getElementById('saveMaintenanceMsg');
            try {
                await setDoc(settingsRef, { message }, { merge: true });
                btn.innerText = "Saved!"; setTimeout(() => btn.innerText = "Save", 2000);
            } catch (e) { console.error(e); alert("Error saving message: " + e.message); }
        });

        document.getElementById('saveScheduleBtn')?.addEventListener('click', async () => {
            const val = document.getElementById('scheduleInput').value;
            if (!val) return alert("Select a date/time");
            const date = new Date(val);
            if (date < new Date()) return alert("Select a future time");
            try {
                await setDoc(settingsRef, { scheduledStart: Timestamp.fromDate(date) }, { merge: true });
                document.getElementById('scheduleInput').value = '';
            } catch (e) {
                alert("Error scheduling maintenance: " + e.message);
            }
        });

        document.getElementById('cancelScheduleBtn')?.addEventListener('click', async () => {
            try {
                await setDoc(settingsRef, { scheduledStart: null }, { merge: true });
            } catch (e) {
                alert("Error cancelling schedule: " + e.message);
            }
        });

        // 6. Announcement
        const announcementRef = doc(db, 'settings', 'announcement');
        onSnapshot(announcementRef, (snap) => {
            if(snap.exists()) {
                const data = snap.data();
                const msg = document.getElementById('announcementMsg');
                const toggle = document.getElementById('announcementToggle');
                const type = document.getElementById('announcementType');
                if(msg) msg.value = data.message || '';
                if(toggle) toggle.checked = data.active || false;
                if(type) type.value = data.type || 'info';
            }
        }, (error) => {
            console.error("Announcement error:", error);
        });

        document.getElementById('saveAnnouncement')?.addEventListener('click', async () => {
            const message = document.getElementById('announcementMsg').value;
            const active = document.getElementById('announcementToggle').checked;
            const type = document.getElementById('announcementType').value;
            const btn = document.getElementById('saveAnnouncement');
            try {
                await setDoc(announcementRef, { message, active, type, timestamp: serverTimestamp() });
                btn.innerText = "Sent!"; setTimeout(() => btn.innerText = "Send Push", 2000);
            } catch (e) {
                alert("Error sending announcement: " + e.message);
            }
        });
    }

    function updateStats() {
        const msgEl = document.getElementById('statMessages');
        const subEl = document.getElementById('statSubscribers');
        const rateEl = document.getElementById('statRating');
        const trafficEl = document.getElementById('statTraffic');
        const timeEl = document.getElementById('statTime');

        if(msgEl) msgEl.innerText = messagesData.length;
        if(subEl) subEl.innerText = subscribersData.length;
        
        if(reviewsData.length > 0 && rateEl) {
            const avg = reviewsData.reduce((acc, curr) => acc + (curr.rating || 0), 0) / reviewsData.length;
            rateEl.innerText = avg.toFixed(1) + " ★";
        } else if(rateEl) { rateEl.innerText = "0.0"; }

        // Traffic & Time
        let totalViews = 0;
        let totalDuration = 0;
        statsData.forEach(d => {
            totalViews += (d.views || 0);
            totalDuration += (d.totalDuration || 0);
        });
        if(trafficEl) trafficEl.innerText = totalViews;
        const avgTime = totalViews > 0 ? Math.round(totalDuration / totalViews) : 0;
        if(timeEl) timeEl.innerText = avgTime + "s";
    }

    window.updateChart = (range) => {
        currentRange = range;
        // Update Buttons
        ['7d', '1m', '1y'].forEach(r => {
            const btn = document.getElementById(`btn-${r}`);
            if(btn) {
                if(r === range) {
                    btn.className = "px-4 py-1.5 text-sm font-medium rounded-md transition-all bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-300 shadow-sm";
                } else {
                    btn.className = "px-4 py-1.5 text-sm font-medium rounded-md transition-all text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200";
                }
            }
        });

        // Filter Data
        const now = new Date();
        const cutoff = new Date();
        if(range === '7d') cutoff.setDate(now.getDate() - 7);
        if(range === '1m') cutoff.setDate(now.getDate() - 30);
        if(range === '1y') cutoff.setFullYear(now.getFullYear() - 1);

        const sorted = [...statsData].sort((a, b) => a.date.localeCompare(b.date));
        const filtered = sorted.filter(d => new Date(d.date) >= cutoff);

        const labels = filtered.map(d => d.date);
        const data = filtered.map(d => d.views || 0);

        const ctx = document.getElementById('trafficChart')?.getContext('2d');
        if(!ctx) return;

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const gridColor = isDark ? '#334155' : '#e2e8f0';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        if(chartInstance) chartInstance.destroy();

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Page Views',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: gridColor },
                        ticks: { color: textColor }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: textColor }
                    }
                }
            }
        });
    };

    function renderMessages(data) {
        const list = document.getElementById('messagesList');
        if(!list) return;
        list.innerHTML = '';
        if(data.length === 0) { list.innerHTML = '<p class="text-gray-400 text-center text-sm">No messages found.</p>'; return; }
        data.forEach(d => {
            const date = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleString() : 'Just now';
            list.innerHTML += `<div class="bg-gray-50 dark:bg-slate-700 p-4 rounded-xl border border-gray-100 dark:border-slate-600 relative group hover:shadow-md transition-shadow"><div class="flex justify-between items-start mb-2"><div><h3 class="font-bold text-sm text-slate-800 dark:text-white">${d.name || 'Unknown'}</h3><p class="text-xs text-blue-500">${d.email}</p></div><span class="text-xs text-gray-400">${date}</span></div><p class="text-sm text-gray-600 dark:text-gray-300 mb-3">${d.message}</p><div class="flex justify-end"><a href="mailto:${d.email}?subject=Re: GitDelivr Inquiry" class="text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors">Reply</a></div><button onclick="window.deleteItem('messages', '${d.id}')" class="absolute top-3 right-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all" title="Delete">🗑️</button></div>`;
        });
    }

    function renderSubscribers(data) {
        const list = document.getElementById('subscribersList');
        if(!list) return;
        list.innerHTML = '';
        if(data.length === 0) { list.innerHTML = '<p class="text-gray-400 text-center text-sm">No subscribers yet.</p>'; return; }
        data.forEach(d => {
            const date = d.timestamp ? new Date(d.timestamp.seconds * 1000).toLocaleDateString() : 'Just now';
            list.innerHTML += `<div class="flex justify-between items-center bg-gray-50 dark:bg-slate-700 p-3 rounded-lg border border-gray-100 dark:border-slate-600 group hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors"><span class="text-sm font-mono text-slate-700 dark:text-slate-200">${d.email}</span><div class="flex items-center gap-3"><span class="text-xs text-gray-400">${date}</span><button onclick="window.deleteItem('subscribers', '${d.id}')" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">🗑️</button></div></div>`;
        });
    }

    function renderReviews(data) {
        const list = document.getElementById('reviewsList');
        if(!list) return;
        list.innerHTML = '';
        if(data.length === 0) { list.innerHTML = '<p class="text-gray-400 text-center col-span-full text-sm">No reviews yet.</p>'; return; }
        data.forEach(d => {
            list.innerHTML += `<div class="bg-gray-50 dark:bg-slate-700 p-4 rounded-xl border border-gray-100 dark:border-slate-600 relative group hover:shadow-md transition-shadow"><div class="flex justify-between mb-2"><span class="font-bold text-sm text-slate-800 dark:text-white">${d.name}</span><span class="text-yellow-500 text-xs">${"★".repeat(d.rating)}</span></div><p class="text-xs text-gray-600 dark:text-gray-300 italic">"${d.text}"</p><button onclick="window.deleteItem('reviews', '${d.id}')" class="absolute top-3 right-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">🗑️</button></div>`;
        });
    }

    document.getElementById('searchMessages')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = messagesData.filter(m => (m.name && m.name.toLowerCase().includes(term)) || (m.email && m.email.toLowerCase().includes(term)) || (m.message && m.message.toLowerCase().includes(term)));
        renderMessages(filtered);
    });

    document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Email,Date\n";
        subscribersData.forEach(row => {
            const date = row.timestamp ? new Date(row.timestamp.seconds * 1000).toLocaleDateString() : 'Unknown';
            csvContent += `${row.email},${date}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "subscribers.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    window.deleteItem = async (col, id) => { if(confirm('Delete this item?')) await deleteDoc(doc(db, col, id)); };
}

initAdminPage();
