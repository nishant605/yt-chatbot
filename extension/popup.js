const API_BASE = "https://yt-chatbot-aqx0.onrender.com";

const askButton = document.getElementById("ask");
const answerDiv = document.getElementById("answer");
const questionInput = document.getElementById("question");
const statusText = document.getElementById("status-text");
const dot = document.getElementById("dot");

let currentUrl = "";

function setStatus(text, busy = false) {
  statusText.textContent = text;
  dot.classList.toggle("busy", busy);
}

// The popup runs as its own extension page (not inside youtube.com), so it
// is not bound by YouTube's CSP and can fetch the backend directly. It also
// is not killed by the ~30s service-worker idle timeout that can cut off
// background.js mid-request during a slow Render cold start.
async function callApi(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

async function loadCurrentVideo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tabs[0]?.url || "";

  if (!currentUrl.includes("youtube.com/watch")) {
    setStatus("No video open");
    answerDiv.innerText = "Please open a YouTube video.";
    return;
  }

  setStatus("Waking up server... this can take up to a minute", true);
  answerDiv.innerText = "Loading video, please wait...";

  try {
    const data = await callApi("/load_video", { url: currentUrl });
    if (data.error) {
      setStatus("Failed to load", false);
      answerDiv.innerText = data.error;
    } else {
      setStatus("Ready", false);
      answerDiv.innerText = data.message || "Video loaded.";
    }
  } catch (err) {
    setStatus("Failed to load", false);
    answerDiv.innerText = `Could not reach the server: ${err.message}`;
  }
}

loadCurrentVideo();

askButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (question === "") return;

  setStatus("Thinking...", true);
  answerDiv.innerText = "Thinking...";

  try {
    const data = await callApi("/ask", { question });
    setStatus("Ready", false);
    answerDiv.innerText = data.answer || data.error || "Something went wrong.";
  } catch (err) {
    setStatus("Error", false);
    answerDiv.innerText = `Could not reach the server: ${err.message}`;
  }
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askButton.click();
  }
});