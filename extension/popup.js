const askButton = document.getElementById("ask");
const answerDiv = document.getElementById("answer");
const questionInput = document.getElementById("question");

const API_BASE_URL = "https://yt-chatbot-aqx0.onrender.com";

let currentUrl = "";

async function loadCurrentVideo() {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    currentUrl = tabs[0].url;

    if (!currentUrl.includes("youtube.com/watch")) {
        showError("Please open a YouTube video.");
        return;
    }

    showLoading();

    try {
        const response = await fetch(
            `${API_BASE_URL}/load_video`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    url: currentUrl
                })
            }
        );

        const data = await response.json();
        displayMessage(data.message, "ai");
    } catch (error) {
        showError("Failed to load video. Make sure the backend is running.");
    }
}

function showLoading() {
    answerDiv.innerHTML = `
        <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
    `;
}

function showError(message) {
    answerDiv.innerHTML = `<div class="error-message">⚠️ ${message}</div>`;
}

function displayMessage(message, type = "ai") {
    const bubble = document.createElement("div");
    bubble.className = type === "ai" ? "ai-bubble" : "user-bubble";
    bubble.textContent = message;
    
    if (answerDiv.innerHTML.includes("typing-indicator")) {
        answerDiv.innerHTML = "";
    }
    
    answerDiv.appendChild(bubble);
    answerDiv.scrollTop = answerDiv.scrollHeight;
}

function typeMessage(message, element) {
    element.innerHTML = "";
    let index = 0;
    
    const typeInterval = setInterval(() => {
        if (index < message.length) {
            element.textContent += message[index];
            index++;
            element.scrollTop = element.scrollHeight;
        } else {
            clearInterval(typeInterval);
        }
    }, 15);
}

loadCurrentVideo();

askButton.addEventListener("click", async () => {
    const question = questionInput.value.trim();

    if (question === "") return;

    // Disable button while processing
    askButton.disabled = true;

    // Display user question
    displayMessage(question, "user");
    questionInput.value = "";

    // Show loading
    showLoading();

    try {
        const response = await fetch(
            `${API_BASE_URL}/ask`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    question: question
                })
            }
        );

        const data = await response.json();

        if (data.answer) {
            answerDiv.innerHTML = "";
            displayMessage(data.answer, "ai");
        } else if (data.error) {
            showError(data.error);
        } else {
            showError("Something went wrong. Please try again.");
        }
    } catch (error) {
        showError("Connection error. Make sure the backend is available at https://yt-chatbot-aqx0.onrender.com");
    } finally {
        askButton.disabled = false;
    }
});