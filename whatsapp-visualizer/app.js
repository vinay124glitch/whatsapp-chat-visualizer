// app.js - WhatsApp-Style Chat Visualizer (Mobile Optimized)
document.addEventListener('DOMContentLoaded', () => {
  let allMessages = [];
  let renderStartIndex = 0;
  let renderEndIndex = 0;
  const chunkLimit = 50;
  let isLoading = false;
  let currentPerspective = '';
  let activeSenders = [];

  // DOM Elements
  const landingScreen = document.getElementById('landing-screen');
  const appContainer = document.getElementById('app-container');
  const messagesContainer = document.getElementById('messages-container');
  const perspectiveSelect = document.getElementById('perspective-select');
  const emptyState = document.getElementById('empty-state');
  const chatSubtitleText = document.getElementById('chat-subtitle-text');

  const chatFeed = document.getElementById('chat-feed');
  const uploadChatBtn = document.getElementById('upload-chat-btn');
  const chatFileInput = document.getElementById('chat-file-input');
  const dropZone = document.getElementById('drop-zone');
  const landingUploadBtn = document.getElementById('landing-upload-btn');

  const dateJumpBtn = document.getElementById('date-jump-btn');
  const dateJumpInput = document.getElementById('date-jump-input');

  init();

  async function init() {
    const cachedData = localStorage.getItem('whatsapp_chat_data');
    if (cachedData) {
      try {
        allMessages = JSON.parse(cachedData);
        renderStartIndex = 0;
        renderEndIndex = Math.min(allMessages.length, chunkLimit);
        setupChat();
        showVisualizer();
        renderChat(false, true);
      } catch (e) {
        localStorage.removeItem('whatsapp_chat_data');
        showLanding();
      }
    } else {
      showLanding();
    }

    // Event Listeners
    perspectiveSelect.addEventListener('change', (e) => {
      currentPerspective = e.target.value;
      renderChat();
    });


    uploadChatBtn.addEventListener('click', () => chatFileInput.click());
    chatFileInput.addEventListener('change', handleFileUpload);
    landingUploadBtn.addEventListener('click', () => chatFileInput.click());

    
    dateJumpBtn.addEventListener('click', () => {
      if (dateJumpInput.showPicker) {
        try { dateJumpInput.showPicker(); } catch (e) { dateJumpInput.click(); }
      } else {
        dateJumpInput.click();
      }
    });

    dateJumpInput.addEventListener('change', (e) => {
      const selectedDate = e.target.value;
      if (!selectedDate) return;
      jumpToDate(selectedDate);
    });

    setupDragAndDrop();
    setupInfiniteScroll();
  }

  function jumpToDate(targetDate) {
    const targetIndex = allMessages.findIndex(msg => msg.timestamp.startsWith(targetDate));
    if (targetIndex !== -1) {
      renderStartIndex = targetIndex;
      renderEndIndex = Math.min(allMessages.length, renderStartIndex + chunkLimit);
      renderChat(false, true);
    } else {
      const afterIndex = allMessages.findIndex(msg => msg.timestamp > targetDate);
      if (afterIndex !== -1) {
        renderStartIndex = afterIndex;
        renderEndIndex = Math.min(allMessages.length, renderStartIndex + chunkLimit);
        renderChat(false, true);
      } else {
        alert('No messages found on or after this date.');
      }
    }
  }

  function showLanding() {
    landingScreen.classList.remove('hidden');
    appContainer.classList.add('hidden');
  }

  function showVisualizer() {
    landingScreen.classList.add('hidden');
    appContainer.classList.remove('hidden');
  }

  function setupDragAndDrop() {
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      }, false);
    });

    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.txt')) {
        processUploadedFile(file);
      } else {
        alert('Please drop a valid WhatsApp .txt exported chat file.');
      }
    });

    dropZone.addEventListener('click', (e) => {
      if (e.target !== landingUploadBtn) {
        chatFileInput.click();
      }
    });
  }



  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
      processUploadedFile(file);
    }
  }

  function processUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const text = e.target.result;
      const parsed = parseChatText(text);

      if (parsed.length === 0) {
        alert("Could not parse messages from this file. Please verify it's a valid WhatsApp chat log.");
        return;
      }

      allMessages = parsed;
      try {
        localStorage.setItem('whatsapp_chat_data', JSON.stringify(parsed));
      } catch (err) {
        console.warn("localStorage quota exceeded.");
      }

      renderStartIndex = 0;
      renderEndIndex = Math.min(allMessages.length, chunkLimit);
      setupChat();
      showVisualizer();
      renderChat(false, true);
    };
    reader.readAsText(file);
  }

  function parseChatText(content) {
    const lines = content.split(/\r?\n/);
    const messages = [];

    const bracketRegex = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[\s\u202f]*[aApP][mM])?)\]\s*(.+)$/;
    const hyphenRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}:\d{2}(?:[\s\u202f]*[aApP][mM])?)\s*-\s*(.+)$/;

    for (const line of lines) {
      if (!line.trim() && messages.length === 0) continue;

      let match = line.match(hyphenRegex);
      if (!match) {
        match = line.match(bracketRegex);
      }

      if (match) {
        const [, day, month, yearPart, timeStr, rest] = match;
        const year = yearPart.length === 2 ? '20' + yearPart : yearPart;

        let time24 = timeStr;
        if (timeStr.toLowerCase().includes('am') || timeStr.toLowerCase().includes('pm') || !timeStr.includes(':')) {
          time24 = convertTo24Hour(timeStr);
        } else {
          const parts = timeStr.split(':');
          if (parts.length === 2) {
            time24 = `${parts[0].padStart(2, '0')}:${parts[1]}:00`;
          } else {
            time24 = `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2]}`;
          }
        }

        const timestamp = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${time24}`;

        const colonIndex = rest.indexOf(':');
        let sender = 'System';
        let messageContent = rest;

        if (colonIndex !== -1 && colonIndex < 60) {
          sender = rest.substring(0, colonIndex).trim();
          messageContent = rest.substring(colonIndex + 1).trim();
        }

        messages.push({
          id: messages.length + 1,
          timestamp,
          sender,
          content: messageContent
        });
      } else {
        if (messages.length > 0) {
          messages[messages.length - 1].content += '\n' + line;
        }
      }
    }
    return messages;
  }

  function convertTo24Hour(timeStr) {
    const cleaned = timeStr.replace(/[\u202f\s]/g, ' ').toLowerCase().trim();
    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (!match) return '00:00:00';

    let hours = parseInt(match[1]);
    const minutes = match[2];
    const ampm = match[3];

    if (ampm === 'pm' && hours < 12) {
      hours += 12;
    } else if (ampm === 'am' && hours === 12) {
      hours = 0;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}:00`;
  }

  function setupChat() {
    const statsMap = {};
    allMessages.forEach(msg => {
      statsMap[msg.sender] = (statsMap[msg.sender] || 0) + 1;
    });

    const stats = Object.keys(statsMap).map(sender => ({
      sender,
      count: statsMap[sender]
    })).sort((a, b) => b.count - a.count);

    activeSenders = stats.filter(s => s.sender !== 'System').map(s => s.sender);

    chatSubtitleText.textContent = `${allMessages.length} messages • ${activeSenders.length} participants`;

    perspectiveSelect.innerHTML = '';
    activeSenders.forEach(sender => {
      const option = document.createElement('option');
      option.value = sender;
      option.textContent = sender;
      perspectiveSelect.appendChild(option);
    });

    if (activeSenders.length > 0) {
      currentPerspective = activeSenders[0];
      perspectiveSelect.value = currentPerspective;
      perspectiveSelect.classList.remove('hidden');
    } else {
      perspectiveSelect.classList.add('hidden');
    }

    if (allMessages.length > 0) {
      const minDateStr = allMessages[0].timestamp.split(' ')[0];
      const maxDateStr = allMessages[allMessages.length - 1].timestamp.split(' ')[0];
      dateJumpInput.min = minDateStr;
      dateJumpInput.max = maxDateStr;
      dateJumpBtn.classList.remove('hidden');
    } else {
      dateJumpBtn.classList.add('hidden');
    }
  }

  function renderChat(isPagination = false, isJump = false) {
    const visibleMessages = allMessages.slice(renderStartIndex, renderEndIndex);

    renderMessagesList(visibleMessages);

    if (visibleMessages.length === 0) {
      emptyState.classList.remove('hidden');
    } else {
      emptyState.classList.add('hidden');
    }

    if (isJump) {
      setTimeout(() => {
        chatFeed.scrollTop = 0;
      }, 10);
    } else if (!isPagination) {
      // Auto-scroll to bottom on first load or new message
      setTimeout(() => {
        chatFeed.scrollTop = chatFeed.scrollHeight;
      }, 100);
    }
  }

  function renderMessagesList(list) {
    messagesContainer.innerHTML = '';

    if (list.length === 0) return;

    let lastDate = null;

    list.forEach(msg => {
      const msgDate = msg.timestamp.split(' ')[0];
      if (msgDate !== lastDate) {
        lastDate = msgDate;
        const dateDiv = document.createElement('div');
        dateDiv.className = 'date-divider';
        dateDiv.textContent = formatDate(msg.timestamp);
        messagesContainer.appendChild(dateDiv);
      }

      const row = document.createElement('div');

      if (msg.sender === 'System') {
        row.className = 'message-row system';
        row.innerHTML = `
          <div class="bubble">
            <div class="bubble-content">${msg.content}</div>
          </div>
        `;
      } else {
        const isMe = msg.sender === currentPerspective;
        row.className = `message-row ${isMe ? 'me' : 'friend'}`;

        const formattedTime = formatTimestamp(msg.timestamp);
        const tickSvg = isMe ? `
          <svg class="double-tick" viewBox="0 0 16 15" fill="none">
            <path d="M15.01 3.58a.75.75 0 0 0-1.08.06l-6.75 7.9-3.21-3.22a.75.75 0 1 0-1.06 1.06l3.75 3.75a.75.75 0 0 0 1.08-.06l7.33-8.58a.75.75 0 0 0-.06-1.01z" fill="currentColor"/>
            <path d="M11.01 3.58a.75.75 0 0 0-1.08.06l-2.75 3.22-.06-.06a.75.75 0 0 0-1.08.06L2.3 11.23a.75.75 0 1 0 1.08 1.04l3.52-4.12 1.34 1.34a.75.75 0 0 0 1.08-.06l3.75-4.38a.75.75 0 0 0-.06-1.01z" fill="currentColor"/>
          </svg>
        ` : '';

        const senderHeader = !isMe ? `<div class="bubble-sender">${msg.sender}</div>` : '';

        row.innerHTML = `
          <div class="bubble">
            ${senderHeader}
            <div class="bubble-content">${processContent(msg.content)}</div>
            <div class="bubble-meta">
              <span class="bubble-time" title="${msg.timestamp}">${formattedTime}</span>
              ${tickSvg}
            </div>
          </div>
        `;
      }
      messagesContainer.appendChild(row);
    });
  }

  function formatDate(timestampStr) {
    const date = new Date(timestampStr.split(' ')[0]);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatTimestamp(timestampStr) {
    try {
      const date = new Date(timestampStr.replace(' ', 'T'));
      if (isNaN(date.getTime())) {
        return timestampStr.split(' ')[1] || timestampStr;
      }
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return timestampStr;
    }
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function processContent(content) {
    const escaped = escapeHtml(content);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const replaced = escaped.replace(urlRegex, (url) => {
      const lower = url.toLowerCase();
      if (lower.match(/\.(png|jpe?g|gif|webp)(\?.*)?$/)) {
        return `<img src="${url}" class="bubble-media" />`;
      }
      if (lower.match(/\.(mp4|webm|ogg)(\?.*)?$/)) {
        return `<video src="${url}" controls class="bubble-media"></video>`;
      }
      if (lower.includes('youtube.com/watch') || lower.includes('youtu.be/')) {
        const ytMatch = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/);
        if (ytMatch && ytMatch[1]) {
          const vid = ytMatch[1];
          return `<iframe width="250" height="140" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen class="bubble-media"></iframe>`;
        }
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
    return replaced.replace(/\n/g, '<br/>');
  }



  function setupInfiniteScroll() {
    chatFeed.addEventListener('scroll', () => {
      if (isLoading) return;

      // Scrolling UP: load older messages
      if (chatFeed.scrollTop < 100 && renderStartIndex > 0) {
        isLoading = true;
        const oldScrollHeight = chatFeed.scrollHeight;
        
        renderStartIndex = Math.max(0, renderStartIndex - chunkLimit);
        renderChat(true);
        
        // Restore scroll position after rendering older messages
        setTimeout(() => {
          chatFeed.scrollTop = chatFeed.scrollTop + (chatFeed.scrollHeight - oldScrollHeight);
          isLoading = false;
        }, 10);
      }

      // Scrolling DOWN: load newer messages
      const distanceFromBottom = chatFeed.scrollHeight - chatFeed.scrollTop - chatFeed.clientHeight;
      if (distanceFromBottom < 100 && renderEndIndex < allMessages.length) {
        isLoading = true;
        
        renderEndIndex = Math.min(allMessages.length, renderEndIndex + chunkLimit);
        renderChat(true);
        
        setTimeout(() => {
          isLoading = false;
        }, 10);
      }
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
});
