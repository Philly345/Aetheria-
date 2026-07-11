const DEFAULT_AI_ENDPOINT = 'https://aetheria-azure.vercel.app/api/chat';
const STORAGE_KEYS = {
  history: 'aetheria_history',
  settings: 'aetheria_settings',
};
const DEFAULT_SETTINGS = {
  aiEndpoint: '',
  localOnly: false,
  redactSensitiveData: true,
  persistHistory: true,
};

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const clearBtn = document.getElementById('clear-btn');
const attachBtn = document.getElementById('attach-btn');
const fileInput = document.getElementById('file-upload');
const dropZone = document.getElementById('drop-zone');
const chatContainer = document.getElementById('chat-container');
const sendBtn = document.getElementById('send-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('auth-overlay');
const aiEndpointInput = document.getElementById('ai-endpoint');
const localOnlyToggle = document.getElementById('local-only-toggle');
const redactToggle = document.getElementById('redact-toggle');
const historyToggle = document.getElementById('history-toggle');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const settingsError = document.getElementById('auth-error');
const privacyStatus = document.getElementById('privacy-status');
const modeTrigger = document.getElementById('mode-trigger');
const modeMenu = document.getElementById('mode-menu');
const modeLabel = document.getElementById('mode-label');
const modeOptions = document.querySelectorAll('.mode-option');
const voiceBtn = document.getElementById('voice-btn');
const talkBtn = document.getElementById('talk-btn');
const screenBtn = document.getElementById('screen-btn');
const voiceLabel = document.getElementById('voice-label');

let chatHistory = [];
let documentContext = '';
let currentMode = 'normal';
let settings = cloneSettings(DEFAULT_SETTINGS);

let recognition = null;
let isRecording = false;
let activeSpeechAction = null;
let speechBuffer = '';
let screenStream = null;
let screenTrack = null;
let isScreenSharing = false;

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.js';
}

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
  await loadSettings();
  syncSettingsPanel();
  setupEventListeners();
  await loadChatHistory();
  updatePrivacyStatus();
}

function cloneSettings(source) {
  return {
    aiEndpoint: source.aiEndpoint || '',
    localOnly: Boolean(source.localOnly),
    redactSensitiveData: Boolean(source.redactSensitiveData),
    persistHistory: Boolean(source.persistHistory),
  };
}

function storageGet(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve);
      return;
    }
    resolve({});
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(items, resolve);
      return;
    }
    resolve();
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys, resolve);
      return;
    }
    resolve();
  });
}

function permissionsRequest(originPattern) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.request) {
      resolve(false);
      return;
    }
    chrome.permissions.request({ origins: [originPattern] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

function permissionsContains(originPattern) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.permissions || !chrome.permissions.contains) {
      resolve(false);
      return;
    }
    chrome.permissions.contains({ origins: [originPattern] }, (granted) => {
      resolve(Boolean(granted));
    });
  });
}

async function loadSettings() {
  const result = await storageGet([STORAGE_KEYS.settings]);
  const saved = result[STORAGE_KEYS.settings];
  if (saved && typeof saved === 'object') {
    settings = {
      aiEndpoint: typeof saved.aiEndpoint === 'string' ? saved.aiEndpoint : '',
      localOnly: Boolean(saved.localOnly),
      redactSensitiveData: saved.redactSensitiveData !== false,
      persistHistory: saved.persistHistory !== false,
    };
  }
}

async function saveSettings() {
  await storageSet({ [STORAGE_KEYS.settings]: settings });
  if (!settings.persistHistory) {
    await storageRemove([STORAGE_KEYS.history]);
  }
}

function syncSettingsPanel() {
  aiEndpointInput.value = settings.aiEndpoint;
  localOnlyToggle.checked = settings.localOnly;
  redactToggle.checked = settings.redactSensitiveData;
  historyToggle.checked = settings.persistHistory;
  clearSettingsError();
}

function showSettingsError(message) {
  settingsError.textContent = message;
  settingsError.classList.remove('hidden');
}

function clearSettingsError() {
  settingsError.textContent = '';
  settingsError.classList.add('hidden');
}

function openSettings() {
  syncSettingsPanel();
  settingsOverlay.classList.remove('hidden');
}

function closeSettings() {
  settingsOverlay.classList.add('hidden');
  clearSettingsError();
}

async function saveSettingsFromUI() {
  clearSettingsError();

  const endpointValue = aiEndpointInput.value.trim();
  if (endpointValue) {
    let endpointURL;
    try {
      endpointURL = new URL(endpointValue);
    } catch (error) {
      showSettingsError('Enter a valid endpoint URL or leave it blank.');
      return;
    }

    if (endpointURL.protocol !== 'https:' && endpointURL.hostname !== 'localhost' && endpointURL.hostname !== '127.0.0.1') {
      showSettingsError('Use HTTPS or a local development endpoint.');
      return;
    }

    const originPattern = endpointURL.origin + '/*';
    const defaultOriginPattern = new URL(DEFAULT_AI_ENDPOINT).origin + '/*';
    if (originPattern !== defaultOriginPattern) {
      const alreadyGranted = await permissionsContains(originPattern);
      if (!alreadyGranted) {
        const granted = await permissionsRequest(originPattern);
        if (!granted) {
          showSettingsError('Permission for that endpoint was not granted.');
          return;
        }
      }
    }
  }

  settings = {
    aiEndpoint: endpointValue,
    localOnly: localOnlyToggle.checked,
    redactSensitiveData: redactToggle.checked,
    persistHistory: historyToggle.checked,
  };

  await saveSettings();
  updatePrivacyStatus();
  closeSettings();
}

function getEffectiveEndpoint() {
  return settings.aiEndpoint.trim() || DEFAULT_AI_ENDPOINT;
}

function getEndpointLabel() {
  if (settings.localOnly) {
    return 'Local-only';
  }

  try {
    return new URL(getEffectiveEndpoint()).host;
  } catch (error) {
    return 'Configured';
  }
}

function updatePrivacyStatus() {
  privacyStatus.textContent = settings.localOnly ? 'Local-only' : 'AI: ' + getEndpointLabel();
}

function redactSensitiveData(text) {
  if (!settings.redactSensitiveData || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted-email]')
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, '[redacted-phone]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/\b(?:sk-|pk-|rk-)[A-Za-z0-9_-]{12,}\b/g, '[redacted-token]');
}

function buildRemoteHistory() {
  const history = chatHistory.map((entry) => {
    return {
      role: entry.role,
      content: redactSensitiveData(entry.content),
    };
  });

  if (documentContext) {
    const contextText = redactSensitiveData(documentContext);
    history.unshift({
      role: 'ai',
      content: 'I have received the document context and will use it as reference for our conversation.',
    });
    history.unshift({
      role: 'user',
      content: '[System Note: The following is the user document or file context for this conversation.]\n\n' + contextText,
    });
  }

  return history;
}

function renderChatHistory() {
  messagesContainer.innerHTML = '';
  chatHistory.forEach((message) => {
    addMessageToUI(message.role, message.content);
  });
}

async function loadChatHistory() {
  if (!settings.persistHistory) {
    chatHistory = [];
    renderChatHistory();
    await storageRemove([STORAGE_KEYS.history]);
    return;
  }

  const result = await storageGet([STORAGE_KEYS.history]);
  if (result[STORAGE_KEYS.history] && Array.isArray(result[STORAGE_KEYS.history])) {
    chatHistory = result[STORAGE_KEYS.history];
    renderChatHistory();
  }
}

async function saveChatHistory() {
  if (!settings.persistHistory) {
    await storageRemove([STORAGE_KEYS.history]);
    return;
  }

  await storageSet({ [STORAGE_KEYS.history]: chatHistory });
}

function clearChat() {
  chatHistory = [];
  documentContext = '';
  messagesContainer.innerHTML = '';
  storageRemove([STORAGE_KEYS.history]);
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addMessageToUI(role, text, id) {
  const msgEl = document.createElement('div');
  if (id) {
    msgEl.id = id;
  }
  msgEl.className = 'message ' + role;
  msgEl.innerHTML = parseMarkdown(text);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
}

function parseMarkdown(text) {
  let html = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?:^|\n)([-*]\s+.+(?:\n[-*]\s+.+)*)/g, function (match, group) {
    const items = group
      .trim()
      .split('\n')
      .map((item) => '<li>' + item.replace(/^[-*]\s+/, '') + '</li>')
      .join('');
    return '\n<ul>' + items + '</ul>\n';
  });

  return html;
}

function setupEventListeners() {
  messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  });

  sendBtn.addEventListener('click', submitMessage);
  clearBtn.addEventListener('click', clearChat);
  settingsBtn.addEventListener('click', openSettings);
  saveSettingsBtn.addEventListener('click', saveSettingsFromUI);
  closeSettingsBtn.addEventListener('click', closeSettings);

  attachBtn.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput.click();
  });

  [localOnlyToggle, redactToggle, historyToggle].forEach((input) => {
    input.addEventListener('change', () => {
      if (input === historyToggle && !historyToggle.checked) {
        showSettingsError('Turning off local history will clear stored conversations.');
      } else {
        clearSettingsError();
      }
    });
  });

  settingsOverlay.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
      closeSettings();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!modeMenu.classList.contains('hidden')) {
        closeModeMenu();
      }
      if (!settingsOverlay.classList.contains('hidden')) {
        closeSettings();
      }
    }
  });

  modeTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (modeMenu.classList.contains('hidden')) {
      openModeMenu();
    } else {
      closeModeMenu();
    }
  });

  modeOptions.forEach((option) => {
    option.addEventListener('click', () => {
      setMode(option.dataset.mode || 'normal');
      closeModeMenu();
    });
  });

  document.addEventListener('click', (event) => {
    if (!modeMenu.classList.contains('hidden') && !modeMenu.contains(event.target) && !modeTrigger.contains(event.target)) {
      closeModeMenu();
    }
  });

  setupVoiceInput();

  voiceBtn.addEventListener('click', () => {
    toggleSpeech('dictate');
  });

  talkBtn.addEventListener('click', () => {
    toggleSpeech('talk');
  });

  screenBtn.addEventListener('click', () => {
    toggleScreenShare();
  });

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
    fileInput.value = '';
  });

  chatContainer.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.remove('hidden');
  });

  chatContainer.addEventListener('dragleave', (event) => {
    event.preventDefault();
    if (event.relatedTarget && chatContainer.contains(event.relatedTarget)) {
      return;
    }
    dropZone.classList.add('hidden');
  });

  chatContainer.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.add('hidden');

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFileUpload(event.dataTransfer.files[0]);
      event.dataTransfer.clearData();
    }
  });
}

function openModeMenu() {
  modeMenu.classList.remove('hidden');
  modeTrigger.setAttribute('aria-expanded', 'true');
}

function closeModeMenu() {
  modeMenu.classList.add('hidden');
  modeTrigger.setAttribute('aria-expanded', 'false');
}

function setMode(mode) {
  currentMode = mode === 'deepthink' ? 'deepthink' : 'normal';
  modeLabel.textContent = currentMode === 'deepthink' ? 'DeepThink' : 'Normal';

  modeOptions.forEach((option) => {
    option.classList.toggle('active', option.dataset.mode === currentMode);
  });
}

function updateScreenButtonState() {
  if (!screenBtn) {
    return;
  }

  screenBtn.textContent = isScreenSharing ? 'Screen On' : 'Share';
  screenBtn.classList.toggle('screen-on', isScreenSharing);
}

async function toggleScreenShare() {
  if (isScreenSharing) {
    stopScreenShare(false);
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    handleAIResponse('[Screen share is not supported in this browser.]');
    return;
  }

  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 1 },
      audio: false,
    });

    screenTrack = screenStream.getVideoTracks()[0] || null;
    if (!screenTrack) {
      stopScreenShare(true);
      handleAIResponse('[No screen track available. Please try again.]');
      return;
    }

    screenTrack.addEventListener('ended', () => {
      stopScreenShare(true);
      handleAIResponse('[Screen share stopped.]');
    });

    isScreenSharing = true;
    updateScreenButtonState();
    handleAIResponse('[Screen sharing enabled. Each message will include a fresh screenshot context.]');
  } catch (error) {
    console.error('Screen share start failed:', error);
    handleAIResponse('[Screen share permission denied or canceled.]');
    stopScreenShare(true);
  }
}

function stopScreenShare(silent) {
  if (screenTrack) {
    screenTrack.stop();
  }

  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
  }

  screenTrack = null;
  screenStream = null;
  isScreenSharing = false;
  updateScreenButtonState();

  if (!silent) {
    handleAIResponse('[Screen sharing disabled.]');
  }
}

async function captureScreenSnapshotDataUrl() {
  if (!screenTrack || !isScreenSharing) {
    return null;
  }

  const imageCaptureSupported = typeof ImageCapture !== 'undefined';
  if (imageCaptureSupported) {
    try {
      const imageCapture = new ImageCapture(screenTrack);
      const bitmap = await imageCapture.grabFrame();
      const canvas = document.createElement('canvas');
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / bitmap.width);
      canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
      canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch (error) {
      console.error('ImageCapture failed, falling back:', error);
    }
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.srcObject = screenStream;
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      try {
        await video.play();
      } catch (error) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      video.pause();
      resolve(dataUrl);
    };

    video.onerror = () => resolve(null);
  });
}
function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    talkBtn.disabled = true;
    voiceBtn.title = 'Speech recognition is not available in this browser build.';
    talkBtn.title = 'Speech recognition is not available in this browser build.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let chunk = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      chunk += event.results[i][0].transcript;
    }
    speechBuffer = chunk.trim();

    if (activeSpeechAction === 'dictate') {
      messageInput.value = speechBuffer;
    }
  };

  recognition.onend = () => {
    const completedAction = activeSpeechAction;
    const completedText = speechBuffer.trim();

    resetSpeechState();

    if (completedAction === 'talk' && completedText) {
      handleUserMessage(completedText);
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error', event.error);
    handleVoiceError(event.error);
    resetSpeechState();
  };
}

function handleVoiceError(errorCode) {
  if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
    handleAIResponse('[Microphone access blocked. Click the lock icon in Chrome, allow microphone for this extension, and try again.]');
    return;
  }

  if (errorCode === 'no-speech') {
    handleAIResponse('[No speech detected. Try again and speak clearly.]');
    return;
  }

  handleAIResponse('[Voice error: ' + errorCode + ']');
}

async function ensureMicrophonePermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return true;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error('Microphone permission request failed:', error);
    return false;
  }
}

async function toggleSpeech(action) {
  if (!recognition) {
    return;
  }

  if (isRecording && activeSpeechAction === action) {
    recognition.stop();
    return;
  }

  if (isRecording) {
    recognition.stop();
  }

  const hasPermission = await ensureMicrophonePermission();
  if (!hasPermission) {
    handleVoiceError('not-allowed');
    resetSpeechState();
    return;
  }

  try {
    activeSpeechAction = action;
    isRecording = true;
    speechBuffer = '';

    if (action === 'dictate') {
      setSpeechButtonState(true, false);
      messageInput.focus();
    } else {
      setSpeechButtonState(false, true);
    }

    recognition.start();
  } catch (error) {
    console.error('Failed to start speech recognition:', error);
    handleVoiceError(error && error.name ? error.name : 'start-failed');
    resetSpeechState();
  }
}
function setSpeechButtonState(dictating, talking) {
  voiceBtn.classList.toggle('recording', dictating);
  talkBtn.classList.toggle('recording', talking);
  if (voiceLabel) {
    voiceLabel.textContent = dictating ? 'Listening...' : 'Dictate';
  }
  talkBtn.textContent = talking ? 'Listening...' : 'Talk';
}

function resetSpeechState() {
  isRecording = false;
  activeSpeechAction = null;
  speechBuffer = '';
  setSpeechButtonState(false, false);
}

function submitMessage() {
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  handleUserMessage(text);
  messageInput.value = '';
}

async function handleUserMessage(text) {
  const outgoingText = currentMode === 'deepthink'
    ? '[DeepThink Mode Active: Please think step-by-step and provide a highly analytical answer]\n' + text
    : text;

  addMessageToUI('user', text);
  chatHistory.push({ role: 'user', content: outgoingText });
  await saveChatHistory();

  const loadingId = 'loading-' + Date.now();
  addMessageToUI('ai', '...', loadingId);

  if (settings.localOnly) {
    removeLoadingMessage(loadingId);
    handleAIResponse('Local-only mode is enabled. Configure an AI endpoint in Settings if you want remote responses.');
    return;
  }

  try {
    const payloadHistory = buildRemoteHistory();
    const endpoint = getEffectiveEndpoint();
    console.log('Attempting to connect to endpoint:', endpoint);
    const screenshotDataUrl = isScreenSharing ? await captureScreenSnapshotDataUrl() : null;
    if (isScreenSharing && !screenshotDataUrl) {
      handleAIResponse('[Screen snapshot failed. Try re-enabling Share.]');
    }
    const response = await sendMessageToEndpoint(endpoint, payloadHistory, screenshotDataUrl);

    removeLoadingMessage(loadingId);
    handleAIResponse(response.text || 'No response received.');
  } catch (error) {
    console.error('AI Fetch Error:', error);
    console.error('Error details:', error.message, error.stack);
    removeLoadingMessage(loadingId);
    handleAIResponse('[Connection Error: ' + error.message + ']');
  }
}

function removeLoadingMessage(loadingId) {
  const loadingEl = document.getElementById(loadingId);
  if (loadingEl) {
    loadingEl.remove();
  }
}

async function sendMessageToEndpoint(endpoint, history, screenshotDataUrl) {
  const originPattern = new URL(endpoint).origin + '/*';
  const defaultOriginPattern = new URL(DEFAULT_AI_ENDPOINT).origin + '/*';

  if (originPattern !== defaultOriginPattern) {
    const allowed = await permissionsContains(originPattern);
    if (!allowed) {
      const granted = await permissionsRequest(originPattern);
      if (!granted) {
        throw new Error('Endpoint permission denied');
      }
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ history: history, screenshotDataUrl: screenshotDataUrl }),
  });

  if (!response.ok) {
    throw new Error('API error: ' + response.status);
  }

  return response.json();
}

function handleAIResponse(text) {
  addMessageToUI('ai', text);
  chatHistory.push({ role: 'ai', content: text });
  saveChatHistory();
  updatePrivacyStatus();
}

function handleFileUpload(file) {
  const displayName = settings.redactSensitiveData ? '[uploaded file]' : '[Uploaded file: ' + file.name + ']';
  addMessageToUI('user', displayName);
  chatHistory.push({ role: 'user', content: displayName });
  saveChatHistory();

  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    parsePDFLocally(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const content = event.target.result;

    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      documentContext += '\n\n--- Document ---\n' + content;
      handleAIResponse('I received and parsed the text file. You can now ask me questions about it.');
      return;
    }

    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
      documentContext += '\n\n--- CSV Document ---\n' + content;
      handleAIResponse('I received and parsed the CSV file. You can now ask me questions about it.');
      return;
    }

    handleAIResponse('[Unsupported file type: ' + (file.type || file.name) + ']');
  };

  reader.onerror = () => {
    handleAIResponse('Failed to read file: ' + file.name);
  };

  reader.readAsText(file);
}

async function parsePDFLocally(file) {
  const loadingId = 'loading-' + Date.now();
  addMessageToUI('ai', 'Parsing PDF...', loadingId);

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const typedArray = new Uint8Array(event.target.result);
      const pdf = await pdfjsLib.getDocument(typedArray).promise;
      let fullText = '';

      for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        fullText += '\n--- Page ' + pageIndex + ' ---\n' + pageText + '\n';
      }

      documentContext += '\n\n--- PDF Document ---\n' + fullText;
      removeLoadingMessage(loadingId);
      handleAIResponse('I have successfully parsed the PDF (' + pdf.numPages + ' pages). You can now ask me questions about its content.');
    } catch (error) {
      console.error('PDF parsing error:', error);
      removeLoadingMessage(loadingId);
      handleAIResponse('Error parsing PDF ' + file.name + ': ' + error.message);
    }
  };

  reader.onerror = () => {
    removeLoadingMessage(loadingId);
    handleAIResponse('Failed to read file: ' + file.name);
  };

  reader.readAsArrayBuffer(file);
}



window.addEventListener('beforeunload', () => {
  stopScreenShare(true);
});

