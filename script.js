/* =====================================================
   APP CONFIG
===================================================== */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import {
  getFirestore,
  doc,
  onSnapshot,
  addDoc,
  collection,
  serverTimestamp,
  setDoc,
  increment,
  deleteDoc,
  orderBy,
  query,
  Timestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/* =====================================================
   FIREBASE INIT
===================================================== */

// --- FIREBASE LOGIC ---
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

/* =====================================================
   GLOBAL STATE
===================================================== */

let fileCache = [];
let currentRepo = {};
let currentCdnLink = "";

/* =====================================================
   UI HELPERS
===================================================== */

const $ = (id) => document.getElementById(id);

const showAlert = (msg, color = "bg-green-500") => {
  const el = $("customAlert");
  el.textContent = msg;
  el.className = `${color} text-white py-3 px-6 rounded-lg shadow-lg show`;
  setTimeout(() => el.classList.remove("show"), 2000);
};

/* =====================================================
   AUTH INIT
===================================================== */

async function initAuth() {
  try {
    if (!auth.currentUser) await signInAnonymously(auth);
    initAnalytics();
  } catch (e) {
    console.error("Auth error", e);
  }
}

initAuth();

/* =====================================================
   GITHUB → FILE FETCH
===================================================== */

window.fetchFiles = async () => {
  const user = $("user").value.trim();
  const repo = $("repo").value.trim();
  const branch = $("branch").value.trim() || "main";

  if (!user || !repo) {
    showAlert("GitHub user & repo required", "bg-red-500");
    return;
  }

  $("status-message").textContent = "Fetching repository...";
  fileCache = [];
  currentRepo = { user, repo, branch };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${user}/${repo}/git/trees/${branch}?recursive=1`
    );
    const data = await res.json();

    if (!data.tree) throw new Error("Repository not found");

    fileCache = data.tree.filter(f => f.type === "blob");
    renderFiles(fileCache);

    $("status-message").textContent = `Found ${fileCache.length} files`;
  } catch (e) {
    $("status-message").textContent = e.message;
  }
};

function renderFiles(files) {
  const list = $("fileList");
  list.innerHTML = "";

  files.forEach(f => {
    const cdn = `https://cdn.jsdelivr.net/gh/${currentRepo.user}/${currentRepo.repo}@${currentRepo.branch}/${f.path}`;
    const li = document.createElement("li");

    li.innerHTML = `
      <span>${f.path}</span>
      <button onclick="showCDN('${cdn}','${f.path}')">Generate</button>
    `;

    list.appendChild(li);
  });
}

/* =====================================================
   CDN PREVIEW
===================================================== */

window.showCDN = (cdn, path) => {
  currentCdnLink = cdn;

  let tag = "";
  const ext = path.split(".").pop();

  if (ext === "js") tag = `<script src="${cdn}"></script>`;
  if (ext === "css") tag = `<link rel="stylesheet" href="${cdn}">`;

  $("output").innerHTML = `
    <p>${path}</p>
    <input value="${cdn}" readonly>
    ${tag ? `<input value='${tag}' readonly>` : ""}
  `;
};

/* =====================================================
   ZIP DOWNLOAD
===================================================== */

window.downloadAllAsZip = async () => {
  if (!fileCache.length) return;

  const zip = new JSZip();

  for (const f of fileCache) {
    const url = `https://cdn.jsdelivr.net/gh/${currentRepo.user}/${currentRepo.repo}@${currentRepo.branch}/${f.path}`;
    const res = await fetch(url);
    if (res.ok) zip.file(f.path, await res.arrayBuffer());
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentRepo.repo}.zip`;
  a.click();
};

/* =====================================================
   GEMINI AI (NETLIFY FUNCTION)
===================================================== */

async function callGemini(prompt) {
  const res = await fetch("/.netlify/functions/gemini", {
    method: "POST",
    body: JSON.stringify({ prompt })
  });

  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "No AI response"
  );
}

window.triggerAiUsage = async () => {
  $("aiOutputContainer").classList.remove("hidden");
  $("aiContent").textContent = "Thinking...";

  const text = await callGemini(
    `Explain usage for ${currentCdnLink}`
  );

  $("aiContent").textContent = text;
};

/* =====================================================
   CHAT
===================================================== */

let chatHistory = "System: You are GitDelivr AI Assistant.\n";

window.sendChat = async () => {
  const input = $("chatInput");
  const msg = input.value.trim();
  if (!msg) return;

  input.value = "";
  chatHistory += `User: ${msg}\n`;

  const reply = await callGemini(chatHistory);
  chatHistory += `Assistant: ${reply}\n`;

  $("chatMessages").innerHTML += `
    <div>User: ${msg}</div>
    <div>AI: ${reply}</div>
  `;
};

/* =====================================================
   ANALYTICS
===================================================== */

async function initAnalytics() {
  const today = new Date().toISOString().split("T")[0];
  const ref = doc(db, "site_stats", today);
  try {
    await setDoc(ref, { views: increment(1) }, { merge: true });
  } catch {}
}
