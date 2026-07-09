// Injects a floating toggle button and the chat sidebar into YouTube watch
// pages. All network calls are delegated to background.js via
// chrome.runtime.sendMessage — this file never calls fetch() directly,
// since youtube.com's CSP would block requests to our Render backend.

let sidebarEl = null;
let toggleEl = null;
let lastLoadedUrl = null;

function isWatchPage(url) {
  return url.includes("youtube.com/watch");
}

function buildToggle() {
  const btn = document.createElement("button");
  btn.id = "yt-ai-toggle";
  btn.innerHTML = `
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 4h16v12H7l-3 3V4z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`;
  btn.addEventListener("click", () => setSidebarVisible(sidebarEl.classList.contains("hidden")));
  document.body.appendChild(btn);
  return btn;
}

function buildSidebar() {
  const wrap = document.createElement("div");
  wrap.id = "yt-ai-chat";
  wrap.classList.add("hidden");
  wrap.innerHTML = `
    <div id="yac-header">
      <div id="yac-header-title">
        <span id="yac-logo">AI</span>
        <div>
          <div id="yac-title-text">Video Chat</div>
          <div id="yac-status"><span class="yac-dot"></span><span id="yac-status-text">Not loaded yet</span></div>
        </div>
      </div>
      <button id="yac-close" aria-label="Close">&times;</button>
    </div>
    <div id="yac-messages"></div>
    <div id="yac-bottom">
      <textarea id="yac-question" placeholder="Ask anything about this video..."></textarea>
      <button id="yac-ask">Send</button>
    </div>`;
  document.body.appendChild(wrap);

  wrap.querySelector("#yac-close").addEventListener("click", () => setSidebarVisible(false));
  wrap.querySelector("#yac-ask").addEventListener("click", handleAsk);
  wrap.querySelector("#yac-question").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  });

  return wrap;
}

function setSidebarVisible(visible) {
  sidebarEl.classList.toggle("hidden", !visible);
  if (visible) {
    maybeLoadVideo();
  }
}

function setStatus(text, busy = false) {
  const statusText = sidebarEl.querySelector("#yac-status-text");
  const dot = sidebarEl.querySelector(".yac-dot");
  statusText.textContent = text;
  dot.classList.toggle("busy", busy);
}

function appendMessage(role, text) {
  const messages = sidebarEl.querySelector("#yac-messages");
  const bubble = document.createElement("div");
  bubble.className = `yac-msg yac-${role}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function sendMessageAsync(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => resolve(response));
  });
}

async function maybeLoadVideo() {
  const url = window.location.href;
  if (!isWatchPage(url) || url === lastLoadedUrl) return;

  lastLoadedUrl = url;
  setStatus("Loading video...", true);
  const response = await sendMessageAsync({ type: "LOAD_VIDEO", url });

  if (response?.ok) {
    setStatus(response.data.error || response.data.message || "Ready", false);
  } else {
    setStatus(response?.error || "Failed to load video", false);
  }
}

async function handleAsk() {
  const input = sidebarEl.querySelector("#yac-question");
  const question = input.value.trim();
  if (!question) return;

  appendMessage("user", question);
  input.value = "";
  setStatus("Thinking...", true);

  const response = await sendMessageAsync({ type: "ASK_QUESTION", question });

  if (response?.ok) {
    appendMessage("assistant", response.data.answer || response.data.error || "No answer returned.");
    setStatus("Ready", false);
  } else {
    appendMessage("assistant", response?.error || "Something went wrong.");
    setStatus("Error", false);
  }
}

function init() {
  toggleEl = buildToggle();
  sidebarEl = buildSidebar();

  // YouTube is a single-page app: watch for client-side navigation between
  // videos so the sidebar reloads context without a full page refresh.
  document.addEventListener("yt-navigate-finish", () => {
    if (!sidebarEl.classList.contains("hidden")) {
      maybeLoadVideo();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}