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

function sendMessageAsync(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => resolve(response));
  });
}

async function loadCurrentVideo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  currentUrl = tabs[0]?.url || "";

  if (!currentUrl.includes("youtube.com/watch")) {
    setStatus("No video open");
    answerDiv.innerText = "Please open a YouTube video.";
    return;
  }

  setStatus("Loading video...", true);
  const response = await sendMessageAsync({ type: "LOAD_VIDEO", url: currentUrl });

  if (response?.ok) {
    setStatus("Ready", false);
    answerDiv.innerText = response.data.message || "Video loaded.";
  } else {
    setStatus("Failed to load", false);
    answerDiv.innerText = response?.error || "Could not reach the server.";
  }
}

loadCurrentVideo();

askButton.addEventListener("click", async () => {
  const question = questionInput.value.trim();
  if (question === "") return;

  setStatus("Thinking...", true);
  answerDiv.innerText = "Thinking...";

  const response = await sendMessageAsync({ type: "ASK_QUESTION", question });

  if (response?.ok) {
    setStatus("Ready", false);
    answerDiv.innerText = response.data.answer || response.data.error || "Something went wrong.";
  } else {
    setStatus("Error", false);
    answerDiv.innerText = response?.error || "Something went wrong.";
  }
});

questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askButton.click();
  }
});