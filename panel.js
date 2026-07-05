// panel.js

// Configuration
const SUPABASE_URL = 'https://siaeditmldjatmaefxhg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_x_nVVXv6RO0Pvtu6csu7-w_x5zFAWEl';
const VERCEL_API_URL = 'https://aetheria-azure.vercel.app/api/chat'; // Placeholder

// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const clearBtn = document.getElementById('clear-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-upload');
const dropZone = document.getElementById('drop-zone');
const chatContainer = document.getElementById('chat-container');
const sendBtn = document.getElementById('send-btn');
const authOverlay = document.getElementById('auth-overlay');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const authError = document.getElementById('auth-error');
const modeBtns = document.querySelectorAll('.mode-btn');
const voiceBtn = document.getElementById('voice-btn');

// State
let chatHistory = [];
let currentUser = null;
let supabaseSession = null;
let documentContext = "";
let currentMode = 'normal';
let isRecording = false;

// PDF.js worker setup
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupEventListeners();
});

// Authentication
async function checkAuth() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get(['supabase_session'], (result) => {
      if (result.supabase_session) {
        supabaseSession = result.supabase_session;
        currentUser = supabaseSession.user;
        authOverlay.classList.add('hidden');
        loadChatHistory();
      }
    });
  } else {
    // For local testing without extension APIs
    console.log("No chrome.storage found. Auth overlay remains visible for testing.");
  }
}

function showError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

function clearError() {
  authError.textContent = '';
  authError.classList.add('hidden');
}

async function handleAuth(type) {
  clearError();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  if (!email || !password) {
    showError('Email and password required.');
    return;
  }

  const endpoint = type === 'signup'
    ? `${SUPABASE_URL}/auth/v1/signup`
    : `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  try {
    const payload = { email, password };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error_description || data.msg || 'Authentication failed');
    }

    // For signup with email confirmation enabled, it might return just a user object and no session
    if (type === 'signup' && !data.session && !data.access_token) {
      showError('Signup successful. Please check your email to confirm.');
      return;
    }

    supabaseSession = data;
    currentUser = data.user;

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ supabase_session: data });
    }

    authOverlay.classList.add('hidden');
    loadChatHistory();
  } catch (err) {
    showError(err.message);
    console.error('Auth error:', err);
  }
}

async function login() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await handleAuth('login');
  } else {
    // For local testing without extension APIs
    console.log("Mocking authentication for testing...");
    currentUser = { id: 'mock-user-123' };
    authOverlay.classList.add('hidden');
    loadChatHistory();
  }
}

async function signup() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    await handleAuth('signup');
  } else {
    // For local testing without extension APIs
    console.log("Mocking authentication for testing...");
    currentUser = { id: 'mock-user-123' };
    authOverlay.classList.add('hidden');
    loadChatHistory();
  }
}

// Supabase DB Logging
async function logMessageToDB(role, content) {
  if (!currentUser || !supabaseSession) return;

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${supabaseSession.access_token}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        user_id: currentUser.id,
        role: role,
        content: content
      })
    });
  } catch (error) {
    console.error('Failed to log message to DB:', error);
  }
}

// Event Listeners
function setupEventListeners() {
  // Input handling
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  });

  sendBtn.addEventListener('click', submitMessage);
  loginBtn.addEventListener('click', login);
  signupBtn.addEventListener('click', signup);

  // Handle enter key in auth fields
  [authEmail, authPassword].forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        login();
      }
    });
  });

  function submitMessage() {
    const text = messageInput.value.trim();
    if (text) {
      handleUserMessage(text);
      messageInput.value = '';
    }
  }

  // Clear chat
  clearBtn.addEventListener('click', clearChat);

  // Attach File Button
  attachBtn.addEventListener('click', () => {
    fileInput.click();
  });

  // Mode Toggles
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active-mode'));
      btn.classList.add('active-mode');

      const modeText = btn.textContent.trim().toLowerCase();
      if (modeText.includes('deepthink')) {
        currentMode = 'deepthink';
      } else {
        currentMode = 'normal';
      }
    });
  });

  // Voice Input
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      messageInput.value += (messageInput.value ? ' ' : '') + transcript;
    };

    recognition.onend = () => {
      isRecording = false;
      voiceBtn.classList.remove('recording');
      voiceBtn.style.color = ''; // Reset visual feedback
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      isRecording = false;
      voiceBtn.classList.remove('recording');
      voiceBtn.style.color = ''; // Reset visual feedback
    };

    voiceBtn.addEventListener('click', () => {
      if (isRecording) {
        recognition.stop();
      } else {
        try {
          recognition.start();
          isRecording = true;
          voiceBtn.classList.add('recording');
          voiceBtn.style.color = '#ff4757'; // Visual feedback
        } catch (e) {
          console.error("Failed to start speech recognition:", e);
        }
      }
    });
  } else {
    voiceBtn.addEventListener('click', () => {
      alert("Speech Recognition API is not supported in this browser.");
    });
  }

  // File upload via button
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
    fileInput.value = ''; // Reset
  });

  attachBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
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

  let payloadText = text;
  if (currentMode === 'deepthink') {
    payloadText = `[DeepThink Mode Active: Please think step-by-step and provide a highly analytical answer]\n${text}`;
  }

  chatHistory.push({ role: 'user', content: payloadText });
  saveChatHistory();
  logMessageToDB('user', payloadText);

  // Show loading state
  const loadingId = 'loading-' + Date.now();
  addMessageToUI('ai', '...', loadingId);

  try {
    let payloadHistory = [...chatHistory];

    // Inject documentContext if it exists
    if (documentContext) {
      // Unshift 'ai' first, then 'user', so the resulting array starts with 'user', then 'ai'.
      payloadHistory.unshift({
        role: 'ai',
        content: `I have received the document context and will use it as reference for our conversation.`
      });
      payloadHistory.unshift({
        role: 'user',
        content: `[System Note: The following is the User's Document/CV Content to be used as reference data for this conversation.]\n\n${documentContext}`
      });
    }

    const response = await fetch(VERCEL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ history: payloadHistory })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Remove loading message
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();

    handleAIResponse(data.text || 'No response received.');
  } catch (error) {
    console.error('AI Fetch Error:', error);
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    handleAIResponse(`[Connection Error: Could not reach Aetheria Brain]`);
  }
}

function handleAIResponse(text) {
  addMessageToUI('ai', text);
  chatHistory.push({ role: 'ai', content: text });
  saveChatHistory();
  logMessageToDB('model', text);
}

function addMessageToUI(role, text, id = null) {
  const msgEl = document.createElement('div');
  if (id) msgEl.id = id;
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
  documentContext = "";
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
  const msg = `[Uploaded file: ${file.name}]`;
  addMessageToUI('user', msg);
  chatHistory.push({ role: 'user', content: msg });
  saveChatHistory();
  logMessageToDB('user', msg);

  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    parsePDFLocally(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    let parsedText = '';

    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      parsedText = content;
      documentContext += `\n\n--- Document: ${file.name} ---\n${parsedText}`;
      handleAIResponse(`I received and parsed the text file ${file.name}. You can now ask me questions about it.`);
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      parsedText = content;
      documentContext += `\n\n--- CSV Document: ${file.name} ---\n${parsedText}`;
      handleAIResponse(`I received and parsed the CSV file ${file.name}. You can now ask me questions about it.`);
    } else {
      handleAIResponse(`[Unsupported file type: ${file.type || file.name}]`);
    }
  };

  reader.onerror = (e) => {
    handleAIResponse(`Failed to read file: ${file.name}`);
  };

  reader.readAsText(file);
}

async function parsePDFLocally(file) {
  const loadingId = 'loading-' + Date.now();
  addMessageToUI('ai', 'Parsing PDF...', loadingId);

  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const typedarray = new Uint8Array(e.target.result);

      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}\n`;
      }

      documentContext += `\n\n--- PDF Document: ${file.name} ---\n${fullText}`;

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      handleAIResponse(`I have successfully parsed the PDF ${file.name} (${pdf.numPages} pages). You can now ask me questions about its content.`);

    } catch (err) {
      console.error('PDF parsing error:', err);
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();
      handleAIResponse(`Error parsing PDF ${file.name}: ${err.message}`);
    }
  };

  reader.onerror = (e) => {
    const loadingEl = document.getElementById(loadingId);
    if (loadingEl) loadingEl.remove();
    handleAIResponse(`Failed to read file: ${file.name}`);
  };

  reader.readAsArrayBuffer(file);
}
