/* ===================================================================
   chat.js — Chat View: Talk to your OpenClaw agent
   =================================================================== */

// Chat history — persisted server-side so it survives across browsers/tabs
let _chatHistory = [];
let _chatHistoryLoaded = false;
let _chatStreaming = false;

async function _loadChatHistory() {
  if (_chatHistoryLoaded) return;
  try {
    const data = await apiFetch('/api/chat/history');
    if (data && Array.isArray(data.messages)) {
      // Don't restore error bubbles — they're transient (e.g. "Connection lost")
      _chatHistory = data.messages.filter(m => m.role !== 'error');
    }
  } catch { /* server unavailable, start fresh */ }
  _chatHistoryLoaded = true;
}

async function _saveChatHistory() {
  try {
    // Don't persist error messages so refresh doesn't show stale connection errors
    const toSave = _chatHistory.filter(m => m.role !== 'error').slice(-200);
    await apiPost('/api/chat/history', { messages: toSave });
  } catch { /* silent */ }
}

async function _clearChatHistory() {
  _chatHistory = [];
  _chatHistoryLoaded = true;
  try {
    await apiFetch('/api/chat/history', { method: 'DELETE' });
  } catch { /* silent */ }
}

registerView('chat', async function renderChat() {
  // Load chat history from server if not already loaded
  await _loadChatHistory();

  // Check if chat is configured
  const status = await apiFetch('/api/chat/status');
  const configured = status && status.configured;
  const hasToken = status && status.has_token;

  const html = `
    <div class="chat-container">
      ${!configured || !hasToken ? `
        <div class="chat-config-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>${!hasToken ? 'Gateway token not set.' : 'Gateway not configured.'} <a href="#settings" style="color: var(--primary); text-decoration: underline;">Go to Settings</a> to add your token.</span>
        </div>
      ` : ''}

      ${_chatHistory.length > 0 ? `
        <div class="chat-toolbar" id="chatToolbar">
          <button class="btn btn-ghost btn-sm" id="chatClearBtn" title="Clear and start a new conversation. Next message will have no prior context (good if the agent seems to be answering a different topic)." style="font-size: 0.75rem; padding: 5px 10px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="margin-right: 4px; vertical-align: -2px;">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
            New conversation
          </button>
        </div>
      ` : ''}

      <div class="chat-messages" id="chatMessages">
        ${_chatHistory.length === 0 ? `
          <div class="chat-welcome">
            <div class="chat-welcome-icon">${App.branding.hasIcon && App.branding.iconUrl ? `<img src="${App.branding.iconUrl}" alt="" style="width:48px;height:48px;border-radius:12px;object-fit:cover;">` : App.branding.emoji}</div>
            <h3>Chat with ${botName()}</h3>
            <p>Send a message to your OpenClaw agent. Responses stream in real-time.</p>
          </div>
        ` : ''}
        ${_chatHistory.map(renderChatBubble).join('')}
      </div>
      <div class="chat-input-bar">
        <input
          type="text"
          class="chat-input"
          id="chatInput"
          placeholder="${configured ? 'Type a message...' : 'Chat not configured'}"
          autocomplete="off"
          ${configured ? '' : 'disabled'}
        />
        <button
          class="chat-send-btn"
          id="chatSendBtn"
          title="Send message"
          ${configured ? '' : 'disabled'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // Wire up events after render
  setTimeout(() => {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const messages = document.getElementById('chatMessages');

    if (input && sendBtn) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
      sendBtn.addEventListener('click', () => sendChatMessage());
      // Focus the input
      input.focus();
    }

    // Scroll to bottom — multiple attempts for mobile where layout completes late
    if (messages) {
      const scrollDown = () => { messages.scrollTop = messages.scrollHeight; };
      scrollDown();
      requestAnimationFrame(scrollDown);
      // Staggered delays to catch late layout shifts on mobile
      for (const ms of [100, 300, 600, 1000]) {
        setTimeout(scrollDown, ms);
      }
    }

    // New conversation — clears history so next message has no prior context
    const clearBtn = document.getElementById('chatClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('Start a new conversation? This clears the thread so your next message is sent with no prior context (the agent will focus only on what you type).')) return;
        await _clearChatHistory();
        navigateTo('chat');
      });
    }
  }, 50);

  return html;
});

function renderChatBubble(msg, index) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';

  if (isError) {
    return `
      <div class="chat-bubble-wrap error">
        <div class="chat-bubble error-bubble">
          <span class="chat-error-icon">!</span>
          <span>${escapeHtml(msg.content)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="chat-bubble-wrap ${isUser ? 'user' : 'agent'}">
      ${!isUser ? botAvatarHTML() : ''}
      <div class="chat-bubble ${isUser ? 'user-bubble' : 'agent-bubble'}" id="bubble-${index}">
        <div class="chat-bubble-content">${formatChatContent(msg.content)}</div>
      </div>
      ${isUser ? '<div class="chat-avatar user-avatar">You</div>' : ''}
    </div>
  `;
}

function formatChatContent(text) {
  if (!text) return '';
  // Basic markdown-ish formatting: code blocks, inline code, bold, newlines
  let html = escapeHtml(text);
  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="chat-code"><code>$2</code></pre>');
  // Inline code (`...`)
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
  // Bold (**...**)
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic (*...*)
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // Newlines
  html = html.replace(/\n/g, '<br>');
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function sendChatMessage() {
  if (_chatStreaming) return;

  const input = document.getElementById('chatInput');
  const message = (input?.value || '').trim();
  if (!message) return;

  // Clear input
  input.value = '';

  // Add user message to history
  _chatHistory.push({ role: 'user', content: message });
  _saveChatHistory();

  // Re-render to show user bubble
  const messagesEl = document.getElementById('chatMessages');
  if (!messagesEl) return;

  // Remove welcome if present
  const welcome = messagesEl.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  // Append user bubble
  messagesEl.insertAdjacentHTML('beforeend', renderChatBubble(
    { role: 'user', content: message },
    _chatHistory.length - 1
  ));

  // Add placeholder agent bubble
  const agentIdx = _chatHistory.length;
  _chatHistory.push({ role: 'assistant', content: '' });

  messagesEl.insertAdjacentHTML('beforeend', `
    <div class="chat-bubble-wrap agent">
      ${botAvatarHTML()}
      <div class="chat-bubble agent-bubble" id="bubble-${agentIdx}">
        <div class="chat-bubble-content"><span class="chat-typing-indicator"><span></span><span></span><span></span></span></div>
      </div>
    </div>
  `);
  scrollChatToBottom();

  // Disable input while streaming
  _chatStreaming = true;
  input.disabled = true;
  document.getElementById('chatSendBtn')?.setAttribute('disabled', '');

  const CHAT_REQUEST_TIMEOUT_MS = 150000; // 2.5 min — agent may be slow
  let timeoutId = null;

  try {
    // Send only last 6 turns (3 exchanges) so the agent focuses on your latest message
    // and doesn't mix in old topics or other chat windows
    const contextHistory = _chatHistory
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(0, -1)  // exclude the empty assistant placeholder
      .slice(-6);

    const chatPayload = {
      message,
      history: contextHistory,
    };

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatPayload),
      signal: controller.signal,
    });

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Read the SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let agentText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === 'data: [DONE]') {
          // Stream complete
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);

            // Check for error from our proxy
            if (parsed.error) {
              _chatHistory[agentIdx] = { role: 'error', content: parsed.error };
              const bubbleEl = document.getElementById(`bubble-${agentIdx}`);
              if (bubbleEl) {
                bubbleEl.closest('.chat-bubble-wrap').outerHTML = renderChatBubble(
                  _chatHistory[agentIdx], agentIdx
                );
              }
              scrollChatToBottom();
              continue;
            }

            // OpenAI streaming format: choices[0].delta.content
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              agentText += delta;
              _chatHistory[agentIdx].content = agentText;

              const bubbleEl = document.getElementById(`bubble-${agentIdx}`);
              if (bubbleEl) {
                const contentEl = bubbleEl.querySelector('.chat-bubble-content');
                if (contentEl) {
                  contentEl.innerHTML = formatChatContent(agentText) +
                    '<span class="chat-cursor"></span>';
                }
              }
              scrollChatToBottom();
            }
          } catch {
            // Ignore parse errors on incomplete chunks
          }
        }
      }
    }

    // Remove cursor after stream ends
    const bubbleEl = document.getElementById(`bubble-${agentIdx}`);
    if (bubbleEl) {
      const cursor = bubbleEl.querySelector('.chat-cursor');
      if (cursor) cursor.remove();
    }

    // If we got no content at all, show a fallback
    if (!agentText && _chatHistory[agentIdx].role !== 'error') {
      _chatHistory[agentIdx].content = '(No response received)';
      if (bubbleEl) {
        const contentEl = bubbleEl.querySelector('.chat-bubble-content');
        if (contentEl) contentEl.innerHTML = '<em style="color:var(--text-muted);">(No response received)</em>';
      }
    }

  } catch (err) {
    console.error('Chat error:', err);
    let friendlyMessage = err.message || 'Connection error';
    if (err.name === 'AbortError') {
      friendlyMessage = 'Request timed out. Your agent may still be busy—try sending again.';
    } else if (/Load failed|Failed to fetch|NetworkError|Network request failed/i.test(friendlyMessage)) {
      friendlyMessage = 'Connection lost. Your agent is likely still running—try sending your message again.';
    } else if (!friendlyMessage.startsWith('HTTP ')) {
      friendlyMessage = `Connection error: ${friendlyMessage}`;
    }
    _chatHistory[agentIdx] = { role: 'error', content: friendlyMessage };
    const bubbleEl = document.getElementById(`bubble-${agentIdx}`);
    if (bubbleEl) {
      bubbleEl.closest('.chat-bubble-wrap').outerHTML = renderChatBubble(
        _chatHistory[agentIdx], agentIdx
      );
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    _chatStreaming = false;
    input.disabled = false;
    document.getElementById('chatSendBtn')?.removeAttribute('disabled');
    input.focus();
    scrollChatToBottom();
    _saveChatHistory();
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chatMessages');
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}
