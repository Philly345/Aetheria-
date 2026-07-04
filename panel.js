// panel.js

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const clearBtn = document.getElementById('clear-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-upload');
const dropZone = document.getElementById('drop-zone');
const chatContainer = document.getElementById('chat-container');

// State
let chatHistory = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadChatHistory();
  setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
  // Input handling
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = messageInput.value.trim();
      if (text) {
        handleUserMessage(text);
        messageInput.value = '';
      }
    }
  });

  // Clear chat
  clearBtn.addEventListener('click', clearChat);

  // File upload via button
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
    fileInput.value = ''; // Reset
  });

  // Drag and Drop
  chatContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hidden');
  });

  chatContainer.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.relatedTarget && chatContainer.contains(e.relatedTarget)) {
      return;
    }
    dropZone.classList.add('hidden');
  });

  chatContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.add('hidden');

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileUpload(file);
      e.dataTransfer.clearData();
    }
  });
}

// Message Handling
async function handleUserMessage(text) {
  addMessageToUI('user', text);
  chatHistory.push({ role: 'user', content: text });
  saveChatHistory();

  // Simulate AI Response
  // In a real scenario, this would send data to a backend.
  setTimeout(() => {
    const aiResponse = `Echo: ${text}\n\nHere is some code:\n\`\`\`javascript\nconsole.log('Aetheria');\n\`\`\``;
    handleAIResponse(aiResponse);
  }, 500);
}

function handleAIResponse(text) {
  addMessageToUI('ai', text);
  chatHistory.push({ role: 'ai', content: text });
  saveChatHistory();
}

function addMessageToUI(role, text) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  msgEl.innerHTML = parseMarkdown(text);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
}

// Simple Markdown Parser (Bold, Code Blocks, Inline Code, Lists)
function parseMarkdown(text) {
  // Escape HTML first to prevent XSS (basic)
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Code Blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

  // Inline Code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Unordered lists (very basic: lines starting with - or *)
  // We'll wrap consecutive list items in <ul>...</ul>
  html = html.replace(/(?:^|\n)([-*]\s+.+(?:\n[-*]\s+.+)*)/g, function(match, p1) {
      let items = p1.trim().split('\n').map(item => `<li>${item.replace(/^[-*]\s+/, '')}</li>`).join('');
      return `\n<ul>${items}</ul>\n`;
  });

  return html;
}

// Storage
function loadChatHistory() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['aetheria_history'], (result) => {
      if (result.aetheria_history && Array.isArray(result.aetheria_history)) {
        chatHistory = result.aetheria_history;
        chatHistory.forEach(msg => {
          addMessageToUI(msg.role, msg.content);
        });
      }
    });
  }
}

function saveChatHistory() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ aetheria_history: chatHistory });
  }
}

function clearChat() {
  chatHistory = [];
  messagesContainer.innerHTML = '';
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.remove('aetheria_history');
  }
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// File Upload Handling
function handleFileUpload(file) {
  addMessageToUI('user', `[Uploaded file: ${file.name}]`);

  const reader = new FileReader();

  reader.onload = (e) => {
    const content = e.target.result;
    let parsedText = '';

    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      parsedText = content;
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      parsedText = `CSV Content Preview:\n${content.substring(0, 500)}${content.length > 500 ? '...' : ''}`;
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // Basic PDF parsing isn't trivial without a library like pdf.js
      // We will mock it for this ultra-minimalist foundation
      parsedText = `[PDF Parsing requires a library like pdf.js. Content size: ${content.byteLength} bytes]`;
    } else {
      parsedText = `[Unsupported file type: ${file.type || file.name}]`;
    }

    // In a real extension, we would send parsedText to the backend
    // For now, we simulate AI acknowledging the file
    setTimeout(() => {
      handleAIResponse(`I received the file ${file.name}. \n${parsedText}`);
    }, 500);
  };

  reader.onerror = (e) => {
    handleAIResponse(`Failed to read file: ${file.name}`);
  };

  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      reader.readAsArrayBuffer(file);
  } else {
      reader.readAsText(file);
  }
}
