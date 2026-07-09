// All network requests happen here in the service worker.
// Content scripts run inside youtube.com's page and are bound by YouTube's
// own Content-Security-Policy, which blocks fetches to arbitrary domains.
// The background service worker is NOT subject to that CSP — only the
// "host_permissions" in manifest.json matter here — so every fetch is
// routed through this file via chrome.runtime.sendMessage.

const API_BASE = "https://yt-chatbot-aqx0.onrender.com";

async function loadVideo(url) {
  const res = await fetch(`${API_BASE}/load_video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

async function askQuestion(question) {
  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question })
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "LOAD_VIDEO") {
    loadVideo(message.url)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }

  if (message?.type === "ASK_QUESTION") {
    askQuestion(message.question)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});