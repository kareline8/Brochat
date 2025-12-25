// --- Цвета для пользователей ---
const userColors = {};
const colorPalette = [
  "#38bdf8",
  "#a855f7",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#f472b6",
  "#2dd4bf",
  "#fb7185"
];

function getColorForLogin(login) {
  const name = (login || "guest").toLowerCase();
  if (userColors[name]) return userColors[name];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const color = colorPalette[Math.abs(hash) % colorPalette.length];
  userColors[name] = color;
  return color;
}

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const num = parseInt(h, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const socket = io();

const replyPreview = document.getElementById("reply-preview");
const replyAuthorEl = replyPreview
  ? replyPreview.querySelector(".reply-author")
  : null;
const replyTextEl = replyPreview
  ? replyPreview.querySelector(".reply-text")
  : null;
const replyCancelBtn = document.getElementById("reply-cancel");

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const loginForm = document.getElementById("login-form");
const loginInput = document.getElementById("login");
const colorInput = document.getElementById("color-input");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const messagesList = document.getElementById("messages");
const usersList = document.getElementById("users-list");
const chatStatus = document.getElementById("chat-status");
const muteToggle = document.getElementById("mute-toggle");
const zoomRange = document.getElementById("zoom-range");
const zoomLabel = document.querySelector(".zoom-label");
const botsToggle = document.getElementById("bots-toggle");
const attachButton = document.getElementById("attach-button");
const attachmentInput = document.getElementById("attachment-input");
const attachmentCount = document.getElementById("attachment-count");
const attachmentPreview = document.getElementById("attachment-preview");
const lightbox = document.getElementById("media-lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxClose = lightbox ? lightbox.querySelector(".lightbox-close") : null;
const audioPlayer = document.getElementById("audio-player");
const audioElement = document.getElementById("audio-element");
const audioPlayButton = document.getElementById("audio-play");
const audioTitle = document.getElementById("audio-title");
const audioCurrent = document.getElementById("audio-current");
const audioDuration = document.getElementById("audio-duration");
const audioProgress = document.getElementById("audio-progress");
const audioClose = document.getElementById("audio-close");

// общий флаг: есть ли вообще тестовые боты в этой сборке
const ENABLE_TEST_BOTS = true;

let currentLogin = null;
let currentColor = null;
let isMuted = false;
let audioCtx = null;

// по умолчанию боты включены только если режим разрешён
let botsEnabled = ENABLE_TEST_BOTS;
let lastUserList = [];
let replyTarget = null; // { login, text } или null
let isUploading = false;
let attachmentPreviewUrls = [];

const FAKE_BOT_NAMES = [
  "Аня", "Кирилл", "Сергей", "Марина", "Игорь",
  "Лена", "Дима", "Юля", "Павел", "Оля",
  "Никита", "Света", "Костя", "Вика", "Рома",
  "Надя", "Антон", "Катя", "Женя", "Маша"
];

function showReplyPreview() {
  if (!replyPreview || !replyAuthorEl || !replyTextEl || !replyTarget) return;
  replyAuthorEl.textContent = replyTarget.login;
  replyTextEl.textContent =
    replyTarget.text.length > 120
      ? replyTarget.text.slice(0, 120) + "…"
      : replyTarget.text;
  replyPreview.classList.remove("hidden");
}

function hideReplyPreview() {
  replyTarget = null;
  if (replyPreview) {
    replyPreview.classList.add("hidden");
  }
}

if (replyCancelBtn) {
  replyCancelBtn.addEventListener("click", () => {
    hideReplyPreview();
  });
}

function autoSizeTextarea() {
  if (!messageInput) return;
  messageInput.style.height = "0px";
  const newHeight = Math.min(120, messageInput.scrollHeight);
  messageInput.style.height = newHeight + "px";
}

function formatBytes(bytes) {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function showAudioPlayer(track) {
  if (!audioPlayer || !audioElement || !track?.url) return;
  audioElement.src = track.url;
  if (audioTitle) {
    audioTitle.textContent = track.name || "Аудио";
  }
  if (audioCurrent) audioCurrent.textContent = "0:00";
  if (audioDuration) audioDuration.textContent = "0:00";
  if (audioProgress) audioProgress.value = "0";
  audioPlayer.classList.remove("hidden");
  audioElement
    .play()
    .then(() => {
      if (audioPlayButton) audioPlayButton.textContent = "⏸";
    })
    .catch(() => {
      if (audioPlayButton) audioPlayButton.textContent = "▶️";
    });
}

function stopAudioPlayer() {
  if (!audioPlayer || !audioElement) return;
  audioElement.pause();
  audioElement.removeAttribute("src");
  audioElement.load();
  if (audioPlayButton) audioPlayButton.textContent = "▶️";
  if (audioProgress) audioProgress.value = "0";
  if (audioCurrent) audioCurrent.textContent = "0:00";
  if (audioDuration) audioDuration.textContent = "0:00";
  audioPlayer.classList.add("hidden");
}

if (audioPlayButton && audioElement) {
  audioPlayButton.addEventListener("click", () => {
    if (audioElement.paused) {
      audioElement.play().catch(() => {});
      audioPlayButton.textContent = "⏸";
    } else {
      audioElement.pause();
      audioPlayButton.textContent = "▶️";
    }
  });
}

if (audioClose) {
  audioClose.addEventListener("click", () => {
    stopAudioPlayer();
  });
}

if (audioElement) {
  audioElement.addEventListener("loadedmetadata", () => {
    if (audioDuration) {
      audioDuration.textContent = formatTime(audioElement.duration);
    }
    if (audioProgress && Number.isFinite(audioElement.duration)) {
      audioProgress.max = String(Math.floor(audioElement.duration));
    }
  });

  audioElement.addEventListener("timeupdate", () => {
    if (audioCurrent) {
      audioCurrent.textContent = formatTime(audioElement.currentTime);
    }
    if (audioProgress && !audioProgress.matches(":active")) {
      audioProgress.value = String(Math.floor(audioElement.currentTime));
    }
  });

  audioElement.addEventListener("ended", () => {
    if (audioPlayButton) audioPlayButton.textContent = "▶️";
  });
}

if (audioProgress && audioElement) {
  audioProgress.addEventListener("input", () => {
    audioElement.currentTime = Number(audioProgress.value);
  });
}

function updateAttachmentCount() {
  if (!attachmentInput || !attachmentCount) return;
  const files = Array.from(attachmentInput.files || []);
  if (files.length === 0) {
    attachmentCount.textContent = "";
    attachmentCount.classList.add("hidden");
    return;
  }
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  attachmentCount.textContent = `${files.length} файл(ов) • ${formatBytes(totalSize)}`;
  attachmentCount.classList.remove("hidden");
}

function clearAttachmentPreview() {
  if (!attachmentPreview) return;
  attachmentPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  attachmentPreviewUrls = [];
  attachmentPreview.innerHTML = "";
  attachmentPreview.classList.add("hidden");
}

function renderAttachmentPreview(files) {
  if (!attachmentPreview) return;
  clearAttachmentPreview();
  if (!files.length) return;

  const fragment = document.createDocumentFragment();

  files.forEach((file) => {
    if (!file) return;
    if (file.type && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      attachmentPreviewUrls.push(url);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attachment-thumb";
      button.setAttribute("aria-label", `Открыть изображение ${file.name}`);
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name || "Изображение";
      img.dataset.full = url;
      img.classList.add("attachment-image");
      button.appendChild(img);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openLightbox(url, img.alt);
      });
      fragment.appendChild(button);
    } else {
      const item = document.createElement("div");
      item.className = "attachment-file";
      item.textContent = `${file.name} (${formatBytes(file.size)})`;
      fragment.appendChild(item);
    }
  });

  attachmentPreview.appendChild(fragment);
  attachmentPreview.classList.remove("hidden");
}

function openLightbox(src, alt) {
  if (!lightbox || !lightboxImage || !src) return;
  lightboxImage.src = src;
  lightboxImage.alt = alt || "Просмотр изображения";
  lightbox.classList.remove("hidden");
}

function closeLightbox() {
  if (!lightbox || !lightboxImage) return;
  lightbox.classList.add("hidden");
  lightboxImage.src = "";
}

if (lightboxClose) {
  lightboxClose.addEventListener("click", (event) => {
    event.stopPropagation();
    closeLightbox();
  });
}

if (lightbox) {
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox && !lightbox.classList.contains("hidden")) {
    closeLightbox();
  }
});

async function uploadAttachments(files) {
  const payload = {
    files: await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        data: await file.arrayBuffer(),
      }))
    ),
  };

  return new Promise((resolve, reject) => {
    socket.emit("uploadFiles", payload, (response) => {
      if (!response?.ok) {
        reject(new Error(response?.message || "Не удалось загрузить вложения."));
        return;
      }
      resolve(Array.isArray(response.files) ? response.files : []);
    });
  });
}

if (messageInput) {
  messageInput.addEventListener("input", autoSizeTextarea);
  autoSizeTextarea();

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Enter — отправка
      e.preventDefault();
      messageForm.requestSubmit();
    }
    // Shift+Enter — обычная новая строка, ничего не трогаем
  });
}

if (attachButton && attachmentInput) {
  attachButton.addEventListener("click", () => {
    attachmentInput.click();
  });

  attachmentInput.addEventListener("change", () => {
    updateAttachmentCount();
    renderAttachmentPreview(Array.from(attachmentInput.files || []));
  });
}

// --- звук уведомлений ---
function playNotification() {
  if (isMuted) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const duration = 0.16;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(920, now);
    osc.frequency.linearRampToValueAtTime(680, now + duration);

    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {
    // молча игнорируем
  }
}

// --- инициализация mute-кнопки ---
if (muteToggle) {
  const saved = localStorage.getItem("minichat_muted");
  if (saved === "1") {
    isMuted = true;
    muteToggle.classList.add("muted");
    muteToggle.textContent = "🔕";
  }

  muteToggle.addEventListener("click", () => {
    isMuted = !isMuted;
    muteToggle.classList.toggle("muted", isMuted);
    muteToggle.textContent = isMuted ? "🔕" : "🔔";
    localStorage.setItem("minichat_muted", isMuted ? "1" : "0");
  });
}

// --- инициализация переключателя ботов ---
if (botsToggle) {
  const wrapper = botsToggle.closest(".bots-toggle");

  if (!ENABLE_TEST_BOTS) {
    // режим ботов отключён вообще: прячем рубильник, ботов не показываем
    botsEnabled = false;
    botsToggle.checked = false;
    if (wrapper) {
      wrapper.classList.add("hidden");
    }
  } else {
    const savedBots = localStorage.getItem("minichat_bots_enabled");
    if (savedBots === "0") {
      botsEnabled = false;
    } else {
      botsEnabled = true;
    }
    botsToggle.checked = botsEnabled;

    botsToggle.addEventListener("change", () => {
      botsEnabled = botsToggle.checked;
      localStorage.setItem("minichat_bots_enabled", botsEnabled ? "1" : "0");

      // перерисуем список пользователей (фейковые ники)
      if (typeof renderUserList === "function") {
        renderUserList();
      }

      // сейчас сервер у тебя сам запускает ботов при первом коннекте,
      // но оставим этот emit, он не мешает
      if (botsEnabled) {
        socket.emit("startBots");
      }
    });
  }
}


// --- масштаб (размер шрифта сообщений) ---
function setZoom(percent) {
  const scale = percent / 100;
  const base = 14;
  const metaBase = 11;

  document.documentElement.style.setProperty(
    "--message-font-size",
    `${base * scale}px`
  );
  document.documentElement.style.setProperty(
    "--meta-font-size",
    `${metaBase * scale}px`
  );
}

if (zoomRange && zoomLabel) {
  let zoom = 100;
  const savedZoom = localStorage.getItem("minichat_zoom");
if (savedZoom) {
  const z = Number(savedZoom);
  if (z >= 70 && z <= 200) zoom = z;
}

  zoomRange.value = String(zoom);
  zoomLabel.textContent = `${zoom}%`;
  setZoom(zoom);

  zoomRange.addEventListener("input", () => {
    const z = Number(zoomRange.value);
    zoomLabel.textContent = `${z}%`;
    setZoom(z);
    localStorage.setItem("minichat_zoom", String(z));
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMessage({
  login,
  color,
  text,
  timestamp,
  local,
  silent,
  replyTo,
  attachments,
}) {
  const li = document.createElement("li");
  li.classList.add("message");
  if (login === currentLogin) {
    li.classList.add("me");
  }

  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // блок цитаты, если это ответ на другое сообщение
  let replyHtml = "";
  if (replyTo && replyTo.login && replyTo.text) {
    const raw = String(replyTo.text || "");
    const snippet = raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
    replyHtml = `
      <div class="reply-block">
        <div class="reply-author">${escapeHtml(replyTo.login)}</div>
        <div class="reply-snippet">${escapeHtml(snippet)}</div>
      </div>
    `;
  }

  const safeAttachments = Array.isArray(attachments) ? attachments : [];

  const isImageAttachment = (item) => {
    if (!item) return false;
    if (item.type && String(item.type).startsWith("image/")) return true;
    const name = String(item.name || "");
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
  };

  const isAudioAttachment = (item) => {
    if (!item) return false;
    if (item.type && String(item.type).startsWith("audio/")) return true;
    const name = String(item.name || "");
    return /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(name);
  };

  const imageAttachments = safeAttachments.filter(isImageAttachment);
  const audioAttachments = safeAttachments.filter(isAudioAttachment);
  const fileAttachments = safeAttachments.filter(
    (item) => !isImageAttachment(item) && !isAudioAttachment(item)
  );

  const attachmentsHtml =
    imageAttachments.length || fileAttachments.length || audioAttachments.length
      ? `
      <div class="attachments">
        ${
          imageAttachments.length
            ? `
            <div class="attachment-images">
              ${imageAttachments
                .map((item) => {
                  const name = escapeHtml(item.name || "изображение");
                  const url = escapeHtml(item.url || "#");
                  return `
                    <button type="button" class="attachment-thumb" aria-label="Открыть изображение ${name}">
                      <img class="attachment-image" src="${url}" alt="${name}" data-full="${url}" />
                    </button>
                  `;
                })
                .join("")}
            </div>
          `
            : ""
        }
        ${
          fileAttachments.length
            ? `
            <div class="attachment-files">
              ${fileAttachments
                .map((item) => {
                  const name = escapeHtml(item.name || "файл");
                  const url = escapeHtml(item.url || "#");
                  const sizeLabel = item.size ? formatBytes(item.size) : "";
                  return `
                    <div class="attachment-item">
                      <span>📎</span>
                      <a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>
                      ${sizeLabel ? `<span>(${sizeLabel})</span>` : ""}
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
            : ""
        }
        ${
          audioAttachments.length
            ? `
            <div class="attachment-audio">
              ${audioAttachments
                .map((item) => {
                  const name = escapeHtml(item.name || "аудио");
                  const url = escapeHtml(item.url || "#");
                  const sizeLabel = item.size ? formatBytes(item.size) : "";
                  return `
                    <button
                      type="button"
                      class="audio-attachment"
                      data-url="${url}"
                      data-name="${name}"
                    >
                      <span>🎵</span>
                      <span>${name}${sizeLabel ? ` (${sizeLabel})` : ""}</span>
                      <span>▶️</span>
                    </button>
                  `;
                })
                .join("")}
            </div>
          `
            : ""
        }
      </div>
    `
      : "";

  li.innerHTML = `
    <div class="meta">
      <span class="author">${escapeHtml(login)}</span>
      <span class="time">${timeStr}</span>
    </div>
    ${replyHtml}
    <div class="text">${linkify(text)}</div>
    ${attachmentsHtml}
  `;

  li.querySelectorAll(".attachment-image").forEach((img) => {
    img.addEventListener("click", (event) => {
      event.stopPropagation();
      const src = img.getAttribute("data-full") || img.getAttribute("src");
      if (src && src !== "#") {
        openLightbox(src, img.getAttribute("alt") || "");
      }
    });
  });

  li.querySelectorAll(".audio-attachment").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const url = button.getAttribute("data-url");
      const name = button.getAttribute("data-name");
      if (url && url !== "#") {
        showAudioPlayer({ url, name });
      }
    });
  });

  const baseColor = color || getColorForLogin(login);
  const border = hexToRgba(baseColor, 0.8);
  const glow = hexToRgba(baseColor, 0.35);
  const bubbleBg =
    login === currentLogin
      ? hexToRgba(baseColor, 0.35)   // свои — поярче
      : hexToRgba(baseColor, 0.10);  // чужие — лёгкая заливка

  li.style.borderColor = border;
  li.style.boxShadow = `0 0 12px ${glow}`;
  li.style.background = bubbleBg;

  const authorEl = li.querySelector(".author");
  if (authorEl) {
    authorEl.style.color = baseColor;
  }

  // клик по сообщению — выбрать его как цель для ответа
  li.addEventListener("click", () => {
    // replyTarget и showReplyPreview должны быть объявлены глобально,
    // как мы выше делали
    replyTarget = {
      login,
      text: String(text || ""),
    };
    showReplyPreview();
  });

  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;

  if (!silent && !local && login !== currentLogin) {
    playNotification();
  }
}



loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = loginInput.value.trim();
  if (!value) return;

  currentLogin = value;
  currentColor = (colorInput && colorInput.value) || "#38bdf8";

  socket.emit("join", { login: value, color: currentColor });

  if (botsEnabled) {
    socket.emit("startBots");
  }

  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  messageInput.focus();
  isChatActive = true;
});


messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isUploading) return;

  const text = messageInput.value.trim();
  const files = Array.from((attachmentInput && attachmentInput.files) || []);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (!text && files.length === 0) return;

  if (totalSize > 500 * 1024 * 1024) {
    alert("Суммарный размер вложений не должен превышать 500 МБ.");
    return;
  }

  let uploadedAttachments = [];
  if (files.length > 0) {
    isUploading = true;
    messageForm.classList.add("is-uploading");
    try {
      uploadedAttachments = await uploadAttachments(files);
    } catch (error) {
      alert(error.message || "Ошибка загрузки вложений.");
      isUploading = false;
      messageForm.classList.remove("is-uploading");
      return;
    }
    isUploading = false;
    messageForm.classList.remove("is-uploading");
  }

  const ts = new Date().toISOString();

  // локально показываем сразу, с учётом reply
  const localPayload = {
    login: currentLogin || "Я",
    color: currentColor || "#38bdf8",
    text,
    timestamp: ts,
    local: true,
    replyTo: replyTarget ? { ...replyTarget } : null,
    attachments: uploadedAttachments,
  };

  renderMessage(localPayload);

  // на сервер отправляем объект, а не голую строку
  socket.emit("chatMessage", {
    text,
    replyTo: replyTarget ? { ...replyTarget } : null,
    attachments: uploadedAttachments,
  });

  messageInput.value = "";
  autoSizeTextarea(); // вернуть высоту
  if (attachmentInput) {
    attachmentInput.value = "";
    updateAttachmentCount();
    clearAttachmentPreview();
  }

  // убираем превью ответа после отправки
  if (typeof hideReplyPreview === "function") {
    hideReplyPreview();
  }
});


socket.on("connect", () => {
  chatStatus.textContent = "Подключено";
  chatStatus.style.color = "var(--accent)";
});

socket.on("disconnect", () => {
  chatStatus.textContent = "Отключено";
  chatStatus.style.color = "#f97373";
});

document.addEventListener("keydown", (event) => {
  if (!isChatActive || !messageInput) return;
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.isComposing) return;

  const activeElement = document.activeElement;
  if (
    activeElement &&
    (activeElement.tagName === "INPUT" ||
      activeElement.tagName === "TEXTAREA" ||
      activeElement.isContentEditable)
  ) {
    return;
  }

  if (event.key === "Escape") {
    messageInput.blur();
    return;
  }

  messageInput.focus();
});

socket.on("history", (items) => {
  messagesList.innerHTML = "";
  if (!Array.isArray(items)) return;

  items.forEach((msg) => {
    if (!botsEnabled && msg.isBot) return;

    renderMessage({
      login: msg.login,
      color: msg.color,
      text: msg.text,
      timestamp: msg.timestamp,
      attachments: msg.attachments || [],
      replyTo: msg.replyTo || null,
      local: false,
      silent: true,
    });
  });
});


socket.on("chatMessage", (payload) => {
  const { login, text, timestamp, color, isBot, replyTo, attachments } = payload;

  if (login === currentLogin) return;
  if (!botsEnabled && isBot) return;

  renderMessage({
    login,
    color,
    text,
    timestamp,
    attachments: attachments || [],
    replyTo: replyTo || null,
    local: false,
  });
});


socket.on("systemMessage", (payload) => {
  const li = document.createElement("li");
  li.classList.add("message", "system");

  let text = "";
  let login = null;
  let color = null;
  let kind = null;

  if (typeof payload === "string") {
    text = payload;
  } else if (payload && typeof payload === "object") {
    text = payload.text || "";
    login = payload.login || null;
    color = payload.color || null;
    kind = payload.kind || null;
  } else {
    text = String(payload ?? "");
  }

  if (kind === "join" || kind === "leave" || kind === "welcome") {
    li.classList.add("system-join-leave");
  }

  // если есть логин и цвет — красим ник
  if (login && color && typeof text === "string" && text.startsWith(login)) {
    const restText = text.slice(login.length);

    const nickSpan = document.createElement("span");
    nickSpan.classList.add("system-nick");
    nickSpan.textContent = login;
    nickSpan.style.color = color;

    const restSpan = document.createElement("span");
    restSpan.classList.add("system-rest");
    restSpan.textContent = restText;

    li.appendChild(nickSpan);
    li.appendChild(restSpan);
  } else {
    li.textContent = text;
  }

  messagesList.appendChild(li);
  messagesList.scrollTop = messagesList.scrollHeight;
});

socket.on("userList", (users) => {
  lastUserList = Array.isArray(users) ? users : [];
  renderUserList();
});

function renderUserList() {
  if (!usersList) return;

  usersList.innerHTML = "";

  // реальные пользователи от сервера
  lastUserList.forEach((u) => {
    const name = typeof u === "string" ? u : u.login;
    const userColor =
      typeof u === "string" || !u.color ? getColorForLogin(name) : u.color;

    const li = document.createElement("li");
    li.textContent = name;

    const baseColor = userColor;
    li.style.borderColor = hexToRgba(baseColor, 0.7);
    li.style.color = baseColor;
    li.style.boxShadow = `0 0 0 1px ${hexToRgba(baseColor, 0.3)}`;

    usersList.appendChild(li);
  });

  // фейковые ники ботов для нагрузочного теста
  if (botsEnabled) {
    FAKE_BOT_NAMES.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      li.classList.add("fake-bot");

      const baseColor = getColorForLogin(name);
      li.style.borderColor = hexToRgba(baseColor, 0.5);
      li.style.color = baseColor;
      li.style.boxShadow = `0 0 0 1px ${hexToRgba(baseColor, 0.2)}`;

      usersList.appendChild(li);
    });
  }
}


function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function linkify(text) {
  const escaped = escapeHtml(text ?? "");

  // http/https, www., и голые домены вида something.tld[/...]
  const urlRegex =
    /((https?:\/\/|www\.)[^\s]+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/gi;

  return escaped.replace(urlRegex, (match) => {
    // отделяем возможные хвостовые знаки препинания: точка, запятая и т.п.
    const m = match.match(/^(.+?)([.,!?);:]*)$/);
    const urlPart = m ? m[1] : match;
    const trail = m ? m[2] : "";

    let href = urlPart;

    // если нет протокола — добавляем http://
    if (!/^https?:\/\//i.test(href)) {
      href = "http://" + href;
    }

    const safeHref = href.replace(/"/g, "&quot;");

    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${urlPart}</a>${trail}`;
  });
}
