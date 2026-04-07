const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const messagesContainer = document.getElementById('messages');

const fileInput = document.getElementById("file-input");

const participantId = localStorage.getItem('participantId');

if (!participantId) {
    alert('No participant ID found. Please go back to the homepage and enter your ID.');
    window.location.href = '/';
}

async function sendMessage(inputElement) {
    const trimmedInput = inputElement.value.trim();
    if (trimmedInput === "") {
        alert("Please enter a message");
    } else {
        messagesContainer.innerHTML += `<p>${trimmedInput}</p>`;
        inputElement.value = '';

        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ participantId: participantId, message: trimmedInput, retrievalMethod: retrievalDropdown.value })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            messagesContainer.innerHTML += `<p>Bot: ${data.botResponse}</p>`;

            // Display confidence metrics
            if (data.confidenceMetrics) {
                const cm = data.confidenceMetrics;
                const pct = (cm.overallConfidence * 100).toFixed(1);
                messagesContainer.innerHTML += `<p id="confidence">Confidence: ${pct}% (method: ${cm.retrievalMethod})</p>`;
            }

            // Display retrieved evidence
            if (data.retrievedDocuments && data.retrievedDocuments.length > 0) {
                let evidenceHTML = '<div id="evidence">Retrieved Evidence:<ul>';
                data.retrievedDocuments.forEach((doc) => {
                    const score = (doc.relevanceScore ?? doc.score ?? 0).toFixed(4);
                    const preview = doc.chunkText.length > 200 ? doc.chunkText.substring(0, 200) + '...' : doc.chunkText;
                    evidenceHTML += `<li>${doc.documentName} (score: ${score})<br><small>${preview}</small></li>`;
                });
                evidenceHTML += '</ul></div>';
                messagesContainer.innerHTML += evidenceHTML;
            }

        } catch (error) {
            console.error('Error sending message:', error);
            messagesContainer.innerHTML += `<p>Error: Failed to get response from bot</p>`;
        }
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantId: participantId })
        });

        const interactions = await response.json();

        interactions.forEach(entry => {
            messagesContainer.innerHTML += `<p>You: ${entry.userInput}</p>`;
            messagesContainer.innerHTML += `<p>Bot: ${entry.botResponse}</p>`;
        });
    } catch (err) {
        console.error('Error loading history:', err);
    }
}

const sendButton = document.getElementById("send-btn");
sendButton.addEventListener("click", (event) => {
    event.preventDefault();
    logEvent( 'click', 'Send Button');
    sendMessage(inputField);
});

const inputElement = document.getElementById("user-input");
inputElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        sendMessage(inputElement);
    }
});

const retrievalDropdown = document.querySelector("#retrieval-method select");

// Prevent form submit from reloading the page
document.querySelector('#chat-container form').addEventListener('submit', (event) => {
    event.preventDefault();
});


retrievalDropdown.addEventListener("change", () => {
    console.log("Selected retrieval method: ", retrievalDropdown.value);
});

// Log hover and focus events on the input field
document.getElementById('user-input').addEventListener('mouseover', () => {
    logEvent('hover', 'User Input');
});

document.getElementById('user-input').addEventListener('focus', () => {
    logEvent('focus', 'User Input');
});

// Function to log events to the server
function logEvent(type, element) {
    fetch('/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: participantId, eventType: type, elementName: element, timestamp: new Date() })
    }).catch(error => {
        console.error('Error logging event:', error);
    });
}

document.getElementById("upload-btn").addEventListener("click", async (event) => {
    console.log("Selected file: ", fileInput.files[0].name);
    event.preventDefault();

    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];
  
    if (!file) {
        alert("Choose a file first.");
        return;
    }
  
    const formData = new FormData();
    formData.append("document", file);
  
    const response = await fetch("/upload-document", {
        method: "POST",
        body: formData
    });
  
    const data = await response.json();
    console.log(data);
    
    await loadDocuments();
});

async function loadDocuments() {
    const documentsList = document.getElementById('documents-list');
    const placeholder = document.getElementById('uploaded-docs-placeholder');
    if (!documentsList || !placeholder) {
        return;
    }
    try {
        const response = await fetch("/documents");
        const docs = await response.json();
        console.log("Docs:", docs);
    
        const documentsList = document.getElementById("documents-list");
        documentsList.innerHTML = "";

        const placeholder = document.getElementById("uploaded-docs-placeholder");

        if (docs.length === 0) {
            placeholder.style.display = '';
            return;
        }

        placeholder.style.display = 'none';
    
        docs.forEach((doc) => {
            const li = document.createElement("li");
            li.textContent = `${doc.filename} - ${doc.processingStatus}`;
            documentsList.appendChild(li);
        });
    } catch (e) {
        console.error('loadDocuments:', e);
    }
}

loadHistory();loadDocuments();
