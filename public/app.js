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

const avatarOptions = [
  { id: "cool", emoji: "😎", accent: "#38bdf8" },
  { id: "spark", emoji: "⚡", accent: "#a855f7" },
  { id: "heart", emoji: "❤️", accent: "#f97316" },
  { id: "leaf", emoji: "🌿", accent: "#22c55e" },
  { id: "sun", emoji: "🌞", accent: "#eab308" },
  { id: "music", emoji: "🎧", accent: "#f472b6" },
  { id: "bubble", emoji: "🫧", accent: "#2dd4bf" },
  { id: "star", emoji: "⭐", accent: "#fb7185" }
];

function buildAvatarDataUri({ emoji, accent }) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accent}"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#grad)"/>
      <text x="50" y="58" font-size="46" text-anchor="middle" dominant-baseline="middle"
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const avatarCatalog = avatarOptions.map((option) => ({
  ...option,
  uri: buildAvatarDataUri(option),
}));
const avatarMap = new Map(avatarCatalog.map((option) => [option.id, option.uri]));

function getAvatarById(id) {
  return (id && avatarMap.get(id)) || null;
}

function getAvatarForLogin(login) {
  const name = (login || "guest").toLowerCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % avatarCatalog.length;
  return avatarCatalog[index].uri;
}

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

const REACTION_EMOJIS = [
  "👍",
  "❤️",
  "🔥",
  "😁",
  "🤯",
  "😢",
  "👏",
  "🎉",
  "🤔",
  "👀",
];

const messageReactions = new Map();
const messageReactionSelections = new Map();
const messageElements = new Map();
const messageElementMap = new Map();
const readMessageIds = new Set();
let messageIdCounter = 0;
let activeReactionTarget = null;
const recipientHighlightQueue = new Map();
const recipientHighlightDone = new Set();

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
const avatarOptionsEl = document.getElementById("avatar-options");
const avatarUploadInput = document.getElementById("avatar-upload");
const avatarUploadPreview = document.getElementById("avatar-upload-preview");
const avatarUploadClear = document.getElementById("avatar-upload-clear");
const avatarCropModal = document.getElementById("avatar-crop-modal");
const avatarCropArea = document.getElementById("avatar-crop-area");
const avatarCropImage = document.getElementById("avatar-crop-image");
const avatarCropHandle = document.getElementById("avatar-crop-handle");
const avatarCropZoom = document.getElementById("avatar-crop-zoom");
const avatarCropCancel = document.getElementById("avatar-crop-cancel");
const avatarCropApply = document.getElementById("avatar-crop-apply");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const messagesList = document.getElementById("messages");
const usersList = document.getElementById("users-list");
const selfList = document.getElementById("self-user");
const directList = document.getElementById("direct-list");
const chatStatus = document.getElementById("chat-status");
const chatTitleText = document.getElementById("chat-title-text");
const chatContext = document.getElementById("chat-context");
const backToPublic = document.getElementById("back-to-public");
const muteToggle = document.getElementById("mute-toggle");
const zoomRange = document.getElementById("zoom-range");
const zoomLabel = document.querySelector(".zoom-label");
const botsToggle = document.getElementById("bots-toggle");
const attachButton = document.getElementById("attach-button");
const emojiButton = document.getElementById("emoji-button");
const emojiPanel = document.getElementById("emoji-panel");
const emojiSearch = document.getElementById("emoji-search");
const emojiGrid = document.getElementById("emoji-grid");
const stickerGrid = document.getElementById("sticker-grid");
const attachmentInput = document.getElementById("attachment-input");
const attachmentCount = document.getElementById("attachment-count");
const attachmentPreview = document.getElementById("attachment-preview");
const unreadIndicator = document.getElementById("unread-indicator");
const notificationStack = document.getElementById("chat-notifications");
const publicChatShortcut = document.getElementById("public-chat-shortcut");
const botsToggleLabel = document.querySelector(".bots-toggle");
const profileModal = document.getElementById("profile-modal");
const profileClose = document.getElementById("profile-close");
const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profilePrivateBtn = document.getElementById("profile-private");
const profilePublicBtn = document.getElementById("profile-public");
const profileAvatarView = document.getElementById("profile-avatar-view");
const profileAvatarFull = document.getElementById("profile-avatar-full");
const profileAvatarViewClose = document.getElementById("profile-avatar-view-close");
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
let currentAvatarId = null;
let currentAvatar = null;
let currentAvatarOriginal = null;
let selectedAvatarId = avatarCatalog[0]?.id || null;
let customAvatar = null;
let customAvatarOriginal = null;
let isPublicMuted = false;
let isPrivateMuted = false;
let audioCtx = null;

// по умолчанию боты включены только если режим разрешён
let botsEnabled = ENABLE_TEST_BOTS;
let lastUserList = [];
let replyTarget = null; // { login, text } или null
let isUploading = false;
let attachmentPreviewUrls = [];
let isChatActive = false;
let unreadMessages = [];
let firstUnreadMessage = null;
let activeChat = { type: "public", partner: null };
let mentionTarget = null;

function setChatActivity(active) {
  isChatActive = active;
  if (isChatActive) {
    maybeAutoDismissVisibleNotifications();
  }
}

const publicHistory = [];
const directHistories = new Map();
const directUnreadCounts = new Map();

const FAKE_BOT_NAMES = [
  "Аня", "Кирилл", "Сергей", "Марина", "Игорь",
  "Лена", "Дима", "Юля", "Павел", "Оля",
  "Никита", "Света", "Костя", "Вика", "Рома",
  "Надя", "Антон", "Катя", "Женя", "Маша"
];

function renderAvatarOptions() {
  if (!avatarOptionsEl) return;
  avatarOptionsEl.innerHTML = "";

  avatarCatalog.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-option";
    button.dataset.avatarId = option.id;

    const img = document.createElement("img");
    img.src = option.uri;
    img.alt = option.id;
    button.appendChild(img);

    if (!selectedAvatarId && index === 0) {
      selectedAvatarId = option.id;
    }
    if (option.id === selectedAvatarId) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      clearCustomAvatar();
      selectedAvatarId = option.id;
      currentAvatar = null;
      avatarOptionsEl
        .querySelectorAll(".avatar-option")
        .forEach((el) => el.classList.toggle("is-selected", el === button));
    });

    avatarOptionsEl.appendChild(button);
  });
}

let cropSourceImage = null;
let cropScale = 1;
let cropMinScale = 1;
let cropOffsetX = 0;
let cropOffsetY = 0;
let cropDragState = null;

function showReplyPreview() {
  if (!replyPreview || !replyAuthorEl || !replyTextEl || !replyTarget) return;
  const replyColor =
    replyTarget.color || getColorForLogin(replyTarget.login || "guest");
  replyAuthorEl.textContent = replyTarget.login;
  replyTextEl.textContent = truncateText(replyTarget.text, 120);
  replyPreview.style.setProperty("--reply-accent", replyColor);
  replyAuthorEl.style.color = replyColor;
  replyPreview.classList.remove("hidden");
}

function hideReplyPreview() {
  replyTarget = null;
  if (replyPreview) {
    replyPreview.classList.add("hidden");
  }
}

function setMessageChecks(checkEl, state) {
  if (!checkEl) return;
  const nextState = state === "read" ? "read" : "sent";
  checkEl.dataset.state = nextState;
  checkEl.textContent = nextState === "read" ? "✓✓" : "✓";
  checkEl.classList.toggle("is-read", nextState === "read");
  checkEl.classList.toggle("is-sent", nextState === "sent");
}

function markMessageRead(messageId) {
  if (!messageId || readMessageIds.has(messageId)) return;
  readMessageIds.add(messageId);
  socket.emit("messageRead", { messageId });
}

function ensureReactionState(messageId) {
  if (!messageReactions.has(messageId)) {
    messageReactions.set(messageId, new Map());
  }
  if (!messageReactionSelections.has(messageId)) {
    messageReactionSelections.set(messageId, new Set());
  }
}

function updateReactionDisplay(messageId) {
  const messageEntry = messageElements.get(messageId);
  if (!messageEntry) return;
  const { reactionsEl } = messageEntry;
  if (!reactionsEl) return;

  ensureReactionState(messageId);
  const reactionCounts = messageReactions.get(messageId);
  const selected = messageReactionSelections.get(messageId);

  reactionsEl.innerHTML = "";
  if (!reactionCounts || reactionCounts.size === 0) return;

  reactionCounts.forEach((count, emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reaction-chip";
    button.textContent = `${emoji} ${count}`;
    button.classList.toggle("is-selected", selected.has(emoji));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleReaction(messageId, emoji);
    });
    reactionsEl.appendChild(button);
  });
}

function toggleReaction(messageId, emoji) {
  ensureReactionState(messageId);
  const reactionCounts = messageReactions.get(messageId);
  const selected = messageReactionSelections.get(messageId);

  if (selected.has(emoji)) {
    selected.delete(emoji);
    const next = (reactionCounts.get(emoji) || 1) - 1;
    if (next <= 0) {
      reactionCounts.delete(emoji);
    } else {
      reactionCounts.set(emoji, next);
    }
  } else {
    selected.forEach((existingEmoji) => {
      const next = (reactionCounts.get(existingEmoji) || 1) - 1;
      if (next <= 0) {
        reactionCounts.delete(existingEmoji);
      } else {
        reactionCounts.set(existingEmoji, next);
      }
    });
    selected.clear();
    selected.add(emoji);
    reactionCounts.set(emoji, (reactionCounts.get(emoji) || 0) + 1);
  }

  updateReactionDisplay(messageId);
}

function createReactionPicker() {
  const picker = document.createElement("div");
  picker.className = "reaction-picker hidden";

  REACTION_EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reaction-option";
    button.textContent = emoji;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!activeReactionTarget) return;
      toggleReaction(activeReactionTarget.messageId, emoji);
      closeReactionPicker();
    });
    picker.appendChild(button);
  });

  document.body.appendChild(picker);
  return picker;
}

const reactionPicker = createReactionPicker();

function createDmPopup() {
  const popup = document.createElement("div");
  popup.className = "dm-popup hidden";
  popup.innerHTML = `
    <div class="dm-title"></div>
    <button type="button" class="dm-action dm-action--private">Личное сообщение</button>
    <button type="button" class="dm-action dm-action--public">Публичное сообщение</button>
  `;
  const actionButton = popup.querySelector(".dm-action--private");
  if (actionButton) {
    actionButton.addEventListener("click", () => {
      const login = popup.dataset.login;
      closeDmPopup();
      if (login) {
        setActiveChat("direct", login);
      }
    });
  }
  const publicButton = popup.querySelector(".dm-action--public");
  if (publicButton) {
    publicButton.addEventListener("click", () => {
      const login = popup.dataset.login;
      closeDmPopup();
      if (login) {
        setActiveChat("public");
        queuePublicMention(login);
      }
    });
  }
  document.body.appendChild(popup);
  return popup;
}

const dmPopup = createDmPopup();

function openReactionPicker(messageId, anchorEl) {
  if (!reactionPicker || !anchorEl) return;
  activeReactionTarget = { messageId, anchorEl };
  reactionPicker.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();
  const pickerRect = reactionPicker.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - pickerRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pickerRect.width - 8));

  let top = rect.top - pickerRect.height - 10;
  if (top < 8) {
    top = rect.bottom + 10;
  }

  reactionPicker.style.left = `${left}px`;
  reactionPicker.style.top = `${top}px`;
}

function closeReactionPicker() {
  if (!reactionPicker) return;
  reactionPicker.classList.add("hidden");
  activeReactionTarget = null;
}

function openDmPopup(login, anchorEl) {
  if (!dmPopup || !anchorEl || !login || login === currentLogin) return;
  const title = dmPopup.querySelector(".dm-title");
  if (title) {
    title.textContent = login;
  }
  dmPopup.dataset.login = login;
  dmPopup.classList.remove("hidden");

  const rect = anchorEl.getBoundingClientRect();
  const popupRect = dmPopup.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));
  let top = rect.bottom + 10;
  if (top + popupRect.height > window.innerHeight - 8) {
    top = rect.top - popupRect.height - 10;
  }
  dmPopup.style.left = `${left}px`;
  dmPopup.style.top = `${top}px`;
}

function closeDmPopup() {
  if (!dmPopup) return;
  dmPopup.classList.add("hidden");
  dmPopup.dataset.login = "";
}

function updatePublicShortcutVisibility() {
  const isDirect = activeChat.type === "direct";
  if (usersList) {
    usersList.classList.toggle("hidden", isDirect);
  }
  if (botsToggleLabel) {
    botsToggleLabel.classList.toggle("hidden", isDirect);
  }
  if (publicChatShortcut) {
    publicChatShortcut.classList.toggle("hidden", !isDirect);
  }
}

function closeProfileCard() {
  if (!profileModal) return;
  profileModal.classList.add("hidden");
  profileModal.dataset.login = "";
  profileModal.dataset.color = "";
  if (profileAvatarView) {
    profileAvatarView.classList.add("hidden");
  }
  if (profileAvatarFull) {
    profileAvatarFull.src = "";
  }
}

function openProfileCard({ name, color, avatarUrl, avatarOriginal }) {
  if (!profileModal || !name || name === currentLogin) return;
  closeProfileAvatarView();
  profileModal.dataset.login = name;
  profileModal.dataset.color = color || "";

  if (profileAvatar) {
    const resolvedAvatar = avatarUrl || getAvatarForLogin(name);
    const resolvedAvatarOriginal = avatarOriginal || resolvedAvatar;
    profileAvatar.src = resolvedAvatar;
    profileAvatar.dataset.full = resolvedAvatarOriginal;
    profileAvatar.style.setProperty("--profile-accent", color || "var(--accent)");
  }
  if (profileName) {
    profileName.textContent = name;
    profileName.style.color = color || "var(--text)";
  }

  profileModal.classList.remove("hidden");
}

function openProfileAvatarView() {
  if (!profileAvatar || !profileAvatarView || !profileAvatarFull) return;
  const fullSrc = profileAvatar.dataset.full;
  if (!fullSrc) return;
  profileAvatarFull.src = fullSrc;
  profileAvatarView.classList.remove("hidden");
}

function closeProfileAvatarView() {
  if (!profileAvatarView || !profileAvatarFull) return;
  profileAvatarView.classList.add("hidden");
  profileAvatarFull.src = "";
}

function queuePublicMention(login, { allowSelf = false } = {}) {
  if (!login) return;
  if (!allowSelf && login === currentLogin) return;
  mentionTarget = login;
  if (messageInput) {
    const trimmed = messageInput.value.trim();
    const mentionText = `${login}, `;
    if (!trimmed) {
      messageInput.value = mentionText;
    } else if (!trimmed.includes(login)) {
      messageInput.value = `${mentionText}${trimmed}`;
    }
    messageInput.focus();
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLeadingMention(text, mentionTo) {
  if (!text || !mentionTo) return null;
  const pattern = new RegExp(
    `^(@?${escapeRegExp(mentionTo)})(?=[\\s,.:!?]|$)`,
    "i"
  );
  const match = String(text).match(pattern);
  if (!match) return null;
  return {
    mentionText: match[1],
    remainder: text.slice(match[1].length),
  };
}

function detectMentionTarget(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;

  const candidates = Array.from(
    new Set(
      lastUserList
        .map((user) => normalizeUserName(user))
        .filter((login) => login && login !== currentLogin)
    )
  ).sort((a, b) => b.length - a.length);

  for (const login of candidates) {
    const pattern = new RegExp(`^@?${escapeRegExp(login)}([,.:\\s]|$)`, "i");
    if (pattern.test(trimmed)) {
      return login;
    }
  }

  return null;
}

function removeNotification(item) {
  if (!item) return;
  item.classList.add("is-leaving");
  setTimeout(() => item.remove(), 200);
}

function isMessageVisible(messageId) {
  if (!messagesList || !messageId) return false;
  const messageEl = messageElementMap.get(messageId);
  if (!messageEl) return false;
  const containerRect = messagesList.getBoundingClientRect();
  const messageRect = messageEl.getBoundingClientRect();
  return (
    messageRect.bottom > containerRect.top + 8 &&
    messageRect.top < containerRect.bottom - 8
  );
}

function scheduleNotificationDismiss(item, delayMs) {
  if (!item || item.dataset.dismissScheduled === "true") return;
  item.dataset.dismissScheduled = "true";
  const delay = Number(delayMs) || 0;
  setTimeout(() => removeNotification(item), delay);
}

function canAutoDismissNotification(item) {
  if (!item || item.dataset.autoDismissWhenVisible !== "true") return false;
  if (!isChatActive) return false;
  const chatType = item.dataset.chatType;
  const partner = item.dataset.partner;
  if (chatType) {
    if (activeChat.type !== chatType) return false;
    if (chatType === "direct" && partner && activeChat.partner !== partner) {
      return false;
    }
  }
  const messageId = item.dataset.messageId;
  if (messageId && !isMessageVisible(messageId)) return false;
  return true;
}

function maybeAutoDismissVisibleNotifications() {
  if (!notificationStack) return;
  Array.from(notificationStack.children).forEach((item) => {
    if (canAutoDismissNotification(item)) {
      const delay = Number(item.dataset.autoDismissMs) || 3000;
      scheduleNotificationDismiss(item, delay);
    }
  });
}

function pushChatNotification({
  title,
  body,
  actionLabel = "Перейти",
  onAction,
  autoDismissMs = 0,
  autoDismissWhenVisible = false,
  messageId = null,
  chatType = null,
  partner = null,
}) {
  if (!notificationStack) return;
  const item = document.createElement("div");
  item.className = "chat-notification";

  const content = document.createElement("div");
  content.className = "chat-notification__content";

  const titleEl = document.createElement("div");
  titleEl.className = "chat-notification__title";
  titleEl.textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "chat-notification__body";
  bodyEl.textContent = body;

  content.appendChild(titleEl);
  content.appendChild(bodyEl);

  const actions = document.createElement("div");
  actions.className = "chat-notification__actions";

  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "chat-notification__action";
  actionButton.textContent = actionLabel;
  actionButton.addEventListener("click", () => {
    if (typeof onAction === "function") {
      onAction();
    }
    removeNotification(item);
  });

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "chat-notification__close";
  closeButton.textContent = "✕";
  closeButton.addEventListener("click", () => removeNotification(item));

  actions.appendChild(actionButton);
  actions.appendChild(closeButton);

  item.appendChild(content);
  item.appendChild(actions);
  item.addEventListener("click", (event) => {
    if (event.target === actionButton || event.target === closeButton) return;
    if (typeof onAction === "function") {
      onAction();
    }
    removeNotification(item);
  });
  if (autoDismissWhenVisible) {
    item.dataset.autoDismissWhenVisible = "true";
    if (autoDismissMs) {
      item.dataset.autoDismissMs = String(autoDismissMs);
    }
  }
  if (messageId) item.dataset.messageId = messageId;
  if (chatType) item.dataset.chatType = chatType;
  if (partner) item.dataset.partner = partner;
  notificationStack.appendChild(item);
  maybeAutoDismissVisibleNotifications();
}

function highlightMessage(messageId, { durationMs = 2000, shouldScroll = true } = {}) {
  const messageEl = messageElementMap.get(messageId);
  if (!messageEl) return false;
  if (shouldScroll) {
    messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  highlightMessageRow(messageEl, { durationMs });
  return true;
}

const highlightFadeTimers = new WeakMap();
const highlightHoverHandlers = new WeakMap();
const HIGHLIGHT_FADE_MS = 600;
const HOVER_DISMISS_DELAY_MS = 3000;

function clearHighlightTimer(messageEl) {
  const existingTimer = highlightFadeTimers.get(messageEl);
  if (existingTimer) {
    clearTimeout(existingTimer);
    highlightFadeTimers.delete(messageEl);
  }
}

function removeHighlight(messageEl) {
  if (!messageEl) return;
  messageEl.classList.remove("message-highlight", "is-fading");
}

function fadeOutHighlight(messageEl) {
  if (!messageEl || !messageEl.classList.contains("message-highlight")) return;
  if (messageEl.classList.contains("is-fading")) return;
  messageEl.classList.add("is-fading");
  clearHighlightTimer(messageEl);
  const cleanupTimer = setTimeout(() => {
    removeHighlight(messageEl);
    highlightFadeTimers.delete(messageEl);
  }, HIGHLIGHT_FADE_MS);
  highlightFadeTimers.set(messageEl, cleanupTimer);
}

function attachHoverDismiss(messageEl) {
  if (!messageEl) return;
  if (highlightHoverHandlers.has(messageEl)) return;
  const handler = () => {
    clearHighlightTimer(messageEl);
    const timer = setTimeout(() => {
      fadeOutHighlight(messageEl);
    }, HOVER_DISMISS_DELAY_MS);
    highlightFadeTimers.set(messageEl, timer);
  };
  highlightHoverHandlers.set(messageEl, handler);
  messageEl.addEventListener("mouseenter", handler, { once: true });
}

function highlightMessageRow(
  messageEl,
  { durationMs = 2000, dismissOnHover = false, autoDismissMs = null } = {}
) {
  if (!messageEl) return;
  messageEl.classList.remove("is-fading");
  messageEl.classList.add("message-highlight");
  clearHighlightTimer(messageEl);
  if (dismissOnHover) {
    attachHoverDismiss(messageEl);
  } else {
    const existingHandler = highlightHoverHandlers.get(messageEl);
    if (existingHandler) {
      messageEl.removeEventListener("mouseenter", existingHandler);
      highlightHoverHandlers.delete(messageEl);
    }
  }
  const dismissDelay =
    typeof autoDismissMs === "number"
      ? autoDismissMs
      : typeof durationMs === "number"
        ? durationMs
        : null;
  if (dismissDelay && dismissDelay > 0) {
    const timer = setTimeout(() => fadeOutHighlight(messageEl), dismissDelay);
    highlightFadeTimers.set(messageEl, timer);
  }
}

function scheduleRecipientHighlight(messageId, messageEl, highlightColor) {
  if (!messageId || !messageEl) return;
  if (recipientHighlightDone.has(messageId)) return;
  const existing = recipientHighlightQueue.get(messageId);
  if (existing && existing.messageEl?.isConnected) return;
  recipientHighlightQueue.set(messageId, { messageEl, highlightColor });
  processRecipientHighlights();
}

function processRecipientHighlights() {
  recipientHighlightQueue.forEach((entry, messageId) => {
    const { messageEl, highlightColor } = entry;
    if (!messageEl || !messageEl.isConnected) {
      recipientHighlightQueue.delete(messageId);
      return;
    }
    if (!isMessageVisible(messageId)) return;
    messageEl.style.setProperty(
      "--highlight-bg",
      hexToRgba(highlightColor, 0.18)
    );
    messageEl.style.setProperty(
      "--highlight-border",
      hexToRgba(highlightColor, 0.35)
    );
    recipientHighlightQueue.delete(messageId);
    recipientHighlightDone.add(messageId);
    highlightMessageRow(messageEl, {
      autoDismissMs: 0,
      dismissOnHover: true,
    });
  });
}

function jumpToMessage(messageId, chatType = "public", partner = null) {
  if (!messageId) return;
  if (chatType === "direct" && partner) {
    if (activeChat.type !== "direct" || activeChat.partner !== partner) {
      setActiveChat("direct", partner);
    }
  } else if (chatType === "public" && activeChat.type !== "public") {
    setActiveChat("public");
  }
  requestAnimationFrame(() => {
    highlightMessage(messageId);
  });
}

if (replyCancelBtn) {
  replyCancelBtn.addEventListener("click", () => {
    hideReplyPreview();
  });
}

if (backToPublic) {
  backToPublic.addEventListener("click", () => {
    setActiveChat("public");
  });
}

if (publicChatShortcut) {
  publicChatShortcut.addEventListener("click", () => {
    setActiveChat("public");
  });
}

if (profileClose) {
  profileClose.addEventListener("click", () => {
    closeProfileCard();
  });
}

if (profileModal) {
  profileModal.addEventListener("click", (event) => {
    if (event.target === profileAvatarView) {
      closeProfileAvatarView();
      return;
    }
    if (event.target === profileModal) {
      closeProfileCard();
    }
  });
}

if (profileAvatar) {
  profileAvatar.addEventListener("click", (event) => {
    event.stopPropagation();
    openProfileAvatarView();
  });
}

if (profileAvatarViewClose) {
  profileAvatarViewClose.addEventListener("click", () => {
    closeProfileAvatarView();
  });
}

if (profilePrivateBtn) {
  profilePrivateBtn.addEventListener("click", () => {
    const login = profileModal?.dataset.login;
    if (!login) return;
    setActiveChat("direct", login);
    closeProfileCard();
  });
}

if (profilePublicBtn) {
  profilePublicBtn.addEventListener("click", () => {
    const login = profileModal?.dataset.login;
    if (!login) return;
    setActiveChat("public");
    queuePublicMention(login);
    closeProfileCard();
  });
}

renderAvatarOptions();

document.addEventListener("click", (event) => {
  if (!reactionPicker) return;
  if (reactionPicker.classList.contains("hidden")) return;
  if (reactionPicker.contains(event.target)) return;
  closeReactionPicker();
});

document.addEventListener("click", (event) => {
  if (dmPopup && !dmPopup.classList.contains("hidden")) {
    if (!dmPopup.contains(event.target)) {
      closeDmPopup();
    }
  }
  if (!replyTarget) return;
  if (event.target.closest(".message-bubble")) return;
  if (reactionPicker && reactionPicker.contains(event.target)) return;
  if (dmPopup && dmPopup.contains(event.target)) return;
  if (event.target.closest(".message-form")) return;
  if (replyPreview && replyPreview.contains(event.target)) return;
  hideReplyPreview();
});

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function updateCustomAvatarPreview(avatarUrl) {
  customAvatar = avatarUrl;
  if (avatarUploadPreview) {
    avatarUploadPreview.src = avatarUrl;
    avatarUploadPreview.classList.remove("hidden");
  }
  if (avatarUploadClear) {
    avatarUploadClear.classList.remove("hidden");
  }
  if (avatarOptionsEl) {
    avatarOptionsEl
      .querySelectorAll(".avatar-option")
      .forEach((el) => el.classList.remove("is-selected"));
  }
  selectedAvatarId = null;
}

function closeAvatarCropper() {
  if (avatarCropModal) {
    avatarCropModal.classList.add("hidden");
  }
  if (avatarCropImage) {
    avatarCropImage.src = "";
  }
  cropSourceImage = null;
  cropDragState = null;
}

function updateCropTransform() {
  if (!avatarCropImage) return;
  avatarCropImage.style.transform = `translate(${cropOffsetX}px, ${cropOffsetY}px) scale(${cropScale})`;
}

function clampCropOffsets() {
  if (!avatarCropArea || !cropSourceImage) return;
  const bounds = avatarCropArea.getBoundingClientRect();
  const areaSize = bounds.width;
  const scaledWidth = cropSourceImage.naturalWidth * cropScale;
  const scaledHeight = cropSourceImage.naturalHeight * cropScale;

  const minX = areaSize - scaledWidth;
  const minY = areaSize - scaledHeight;

  cropOffsetX = Math.min(0, Math.max(minX, cropOffsetX));
  cropOffsetY = Math.min(0, Math.max(minY, cropOffsetY));
}

function initCropper() {
  if (!avatarCropArea || !cropSourceImage) return;
  const bounds = avatarCropArea.getBoundingClientRect();
  const areaSize = bounds.width;
  const minScaleX = areaSize / cropSourceImage.naturalWidth;
  const minScaleY = areaSize / cropSourceImage.naturalHeight;
  cropMinScale = Math.max(minScaleX, minScaleY);
  cropScale = cropMinScale;
  cropOffsetX = (areaSize - cropSourceImage.naturalWidth * cropScale) / 2;
  cropOffsetY = (areaSize - cropSourceImage.naturalHeight * cropScale) / 2;
  clampCropOffsets();
  updateCropTransform();
  if (avatarCropZoom) {
    avatarCropZoom.min = String(Math.round(cropMinScale * 100));
    avatarCropZoom.max = String(Math.round(cropMinScale * 220));
    avatarCropZoom.value = String(Math.round(cropScale * 100));
  }
}

function openAvatarCropper(dataUrl) {
  if (!avatarCropModal || !avatarCropImage) {
    updateCustomAvatarPreview(dataUrl);
    return;
  }
  cropSourceImage = new Image();
  cropSourceImage.onload = () => {
    avatarCropImage.src = dataUrl;
    avatarCropModal.classList.remove("hidden");
    requestAnimationFrame(() => {
      initCropper();
    });
  };
  cropSourceImage.src = dataUrl;
}

function applyAvatarCrop() {
  if (!avatarCropArea || !cropSourceImage) return;
  const bounds = avatarCropArea.getBoundingClientRect();
  const areaSize = bounds.width;
  const outputSize = 200;

  const sourceX = -cropOffsetX / cropScale;
  const sourceY = -cropOffsetY / cropScale;
  const sourceSize = areaSize / cropScale;

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(
    cropSourceImage,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    outputSize,
    outputSize
  );

  const dataUrl = canvas.toDataURL("image/png");
  updateCustomAvatarPreview(dataUrl);
  closeAvatarCropper();
}

function clearCustomAvatar() {
  customAvatar = null;
  customAvatarOriginal = null;
  closeAvatarCropper();
  if (avatarUploadPreview) {
    avatarUploadPreview.src = "";
    avatarUploadPreview.classList.add("hidden");
  }
  if (avatarUploadClear) {
    avatarUploadClear.classList.add("hidden");
  }
  if (avatarUploadInput) {
    avatarUploadInput.value = "";
  }
  if (!selectedAvatarId) {
    selectedAvatarId = avatarCatalog[0]?.id || null;
  }
  if (avatarOptionsEl && selectedAvatarId) {
    avatarOptionsEl.querySelectorAll(".avatar-option").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.avatarId === selectedAvatarId);
    });
  }
}

if (avatarUploadClear) {
  avatarUploadClear.addEventListener("click", () => {
    clearCustomAvatar();
  });
}

if (avatarUploadInput) {
  avatarUploadInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Можно загружать только изображения.");
      avatarUploadInput.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      alert("Аватар не должен превышать 5 МБ.");
      avatarUploadInput.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        customAvatarOriginal = result;
        openAvatarCropper(result);
      }
    };
    reader.readAsDataURL(file);
  });
}

function startCropDrag(event, type) {
  if (!avatarCropArea) return;
  event.preventDefault();
  cropDragState = {
    type,
    startX: event.clientX,
    startY: event.clientY,
    startOffsetX: cropOffsetX,
    startOffsetY: cropOffsetY,
    startScale: cropScale,
  };
  document.addEventListener("pointermove", handleCropMove);
  document.addEventListener("pointerup", endCropDrag);
}

function handleCropMove(event) {
  if (!cropDragState || !avatarCropArea) return;
  const deltaX = event.clientX - cropDragState.startX;
  const deltaY = event.clientY - cropDragState.startY;

  if (cropDragState.type === "move") {
    cropOffsetX = cropDragState.startOffsetX + deltaX;
    cropOffsetY = cropDragState.startOffsetY + deltaY;
  } else if (cropDragState.type === "scale") {
    const scaleDelta = (deltaX + deltaY) / 250;
    cropScale = Math.max(cropMinScale, cropDragState.startScale + scaleDelta);
    if (avatarCropZoom) {
      avatarCropZoom.value = String(Math.round(cropScale * 100));
    }
  }

  clampCropOffsets();
  updateCropTransform();
}

function endCropDrag(event) {
  if (!cropDragState || !avatarCropArea) return;
  document.removeEventListener("pointermove", handleCropMove);
  document.removeEventListener("pointerup", endCropDrag);
  cropDragState = null;
}

if (avatarCropImage) {
  avatarCropImage.addEventListener("pointerdown", (event) => {
    startCropDrag(event, "move");
  });
}

if (avatarCropHandle) {
  avatarCropHandle.addEventListener("pointerdown", (event) => {
    startCropDrag(event, "scale");
  });
}

if (avatarCropZoom) {
  avatarCropZoom.addEventListener("input", () => {
    const value = Number(avatarCropZoom.value) / 100;
    if (!Number.isFinite(value)) return;
    cropScale = Math.max(cropMinScale, value);
    clampCropOffsets();
    updateCropTransform();
  });
}

if (avatarCropCancel) {
  avatarCropCancel.addEventListener("click", () => {
    closeAvatarCropper();
    if (avatarUploadInput) {
      avatarUploadInput.value = "";
    }
  });
}

if (avatarCropApply) {
  avatarCropApply.addEventListener("click", () => {
    applyAvatarCrop();
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

const EMOJI_GROUPS = [
  {
    name: "Смайлы",
    emojis: "😀 😁 😂 🤣 😃 😄 😅 😆 😉 😊 😋 😎 😍 🥰 😘 😗 😙 😚 🙂 🤗 🤩 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 😴 😌 😛 😜 😝 🤤 😒 😓 😔 😕 🙃 🫠 🥲 😖 😞 😟 😤 😢 😭 😦 😧 😨 😩 😬 😰 😱 😳 🤯 😵 😵‍💫 🥴 😡 😠 🤬 🤡 👻 💀 ☠️ 👽 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾".split(
      " "
    ),
  },
  {
    name: "Жесты",
    emojis: "👍 👎 👊 ✊ 🤛 🤜 🤞 ✌️ 🤟 🤘 🤙 🫶 🤲 👐 🙌 👏 🤝 🙏 ✋ 🤚 🖐️ 👋 🤗 🤝 🤌 👌 ✍️ 🤳 💪 🦾 🫱 🫲 🫳 🫴 🫵".split(
      " "
    ),
  },
  {
    name: "Люди",
    emojis: "👶 🧒 👦 👧 🧑 👱 👨 👩 🧔 🧑‍🦰 🧑‍🦱 🧑‍🦳 🧑‍🦲 👴 👵 🧓 👨‍⚕️ 👩‍⚕️ 👨‍🎓 👩‍🎓 👨‍🏫 👩‍🏫 👨‍💻 👩‍💻 👨‍🎨 👩‍🎨 👨‍🚀 👩‍🚀 👨‍🍳 👩‍🍳 👮 👷 💂 🕵️ 🧑‍💼 🧑‍🔧 🧑‍🚒 🧑‍🚜 🧑‍⚖️ 🧑‍✈️ 🧑‍🎤 🧑‍🎧 🧑‍🏭 🧑‍🔬 🧑‍🔭 🧑‍🏫 🧑‍🎓 🧑‍🍳".split(
      " "
    ),
  },
  {
    name: "Животные",
    emojis: "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐜 🪰 🪲 🪳 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🐠 🐟 🐡 🐬 🦈 🐳 🐋 🐊 🦭".split(
      " "
    ),
  },
  {
    name: "Еда",
    emojis: "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🫑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🍄 🥜 🌰 🍞 🥐 🥖 🫓 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🌮 🌯 🫔 🥗 🥘 🫕 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥡 🍢 🍡 🍧 🍨 🍦 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪".split(
      " "
    ),
  },
  {
    name: "Активности",
    emojis: "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🏒 🏑 🥍 🏏 🪃 🥅 ⛳ 🪁 🏹 🎣 🤿 🥊 🥋 🛹 🛼 🛷 ⛸️ 🥌 🪂 🏂 🏋️ 🤸 🤼 🤺 🤾 ⛹️ 🏌️ 🧘 🏄 🚣 🏊 🤽 🚴 🚵 🏇 🧗 🤹 🎯 🎮 🎲 🧩 🎹 🥁 🎸 🎻 🎺 🎷 🎤 🎧".split(
      " "
    ),
  },
  {
    name: "Путешествия",
    emojis: "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 ✈️ 🛫 🛬 🛩️ 🚁 🚀 🛸 🚢 ⛵ 🚤 🛥️ 🚂 🚆 🚇 🚊 🚉 🚝 🚄 🛰️ 🗺️ 🧭 ⛽ 🛣️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 🌋 🏔️ ⛰️ 🏝️ 🏜️ 🏖️".split(
      " "
    ),
  },
  {
    name: "Объекты",
    emojis: "⌚ 📱 💻 🖥️ 🖨️ 🖱️ ⌨️ 💽 💾 💿 📀 📷 📸 📹 🎥 📽️ 🎬 📺 📻 🎙️ 🎚️ 🎛️ ⏱️ ⏲️ ⏰ 🕰️ 🔋 🔌 💡 🔦 🕯️ 🪔 🔥 🧯 🛢️ 💸 💵 💴 💶 💷 💰 💳 🪙 💎 ⚖️ 🔧 🔨 ⚒️ 🛠️ ⛏️ 🪓 🪚 🔩 ⚙️ 🧰 🔪 🗡️ ⚔️ 🛡️ 🚬 🧨 💣 🔮 🧿 🪬 📿 💈 🧹 🧺 🧻 🪣 🧴 🧼 🧽 🪥 🧪 🧫 🧬 🔭 🔬 🩻 🩹 🩺 💊 🩼 🪒 🚪 🛏️ 🛋️ 🪑 🚽 🚿 🛁 🧸 🪆".split(
      " "
    ),
  },
  {
    name: "Символы",
    emojis: "❤️ 🧡 💛 💚 💙 💜 🤍 🤎 🖤 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ☮️ ✝️ ☪️ 🕉️ ☸️ ✡️ 🔯 🕎 ☯️ ☦️ ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ 🆔 🆕 🆓 🆒 🆙 🆗 ✅ ☑️ ✔️ ✖️ ➕ ➖ ➗ ➰ ➿ ♾️ ™️ ©️ ®️ 💯 🔥 ⚡ 🎵 🎶 💢 💥 💫 💤 ✨ 🌟 ⭐ 🌈 ☀️ 🌤️ ⛅ 🌧️ ⛈️ ❄️ ☃️ 🎉 🎊".split(
      " "
    ),
  },
];

const emojiCatalog = EMOJI_GROUPS.flatMap((group) =>
  group.emojis.map((symbol) => ({
    symbol,
    keywords: [group.name.toLowerCase()],
  }))
);

const STICKERS = [
  { id: "bro_heart", label: "Бро любит", emoji: "❤️", colors: ["#f43f5e", "#f97316"] },
  { id: "bro_cool", label: "Бро крут", emoji: "😎", colors: ["#38bdf8", "#6366f1"] },
  { id: "bro_party", label: "Бро пати", emoji: "🥳", colors: ["#f59e0b", "#ec4899"] },
  { id: "bro_lol", label: "Бро лол", emoji: "🤣", colors: ["#22c55e", "#16a34a"] },
  { id: "bro_fire", label: "Бро огонь", emoji: "🔥", colors: ["#f97316", "#ef4444"] },
  { id: "bro_thumb", label: "Бро ок", emoji: "👍", colors: ["#0ea5e9", "#14b8a6"] },
  { id: "bro_rocket", label: "Бро взлет", emoji: "🚀", colors: ["#8b5cf6", "#3b82f6"] },
  { id: "bro_ok", label: "Бро топ", emoji: "👌", colors: ["#10b981", "#06b6d4"] },
  { id: "bro_spark", label: "Бро вайб", emoji: "✨", colors: ["#eab308", "#facc15"] },
  { id: "bro_peace", label: "Бро мир", emoji: "✌️", colors: ["#22c55e", "#84cc16"] },
];

function createStickerSvg({ id, emoji, label, colors }) {
  const gradientId = `g-${id}`;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${colors[0]}" />
          <stop offset="100%" stop-color="${colors[1]}" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="48" fill="url(#${gradientId})" />
      <circle cx="60" cy="52" r="10" fill="rgba(255,255,255,0.2)" />
      <circle cx="190" cy="190" r="18" fill="rgba(255,255,255,0.12)" />
      <text x="50%" y="46%" text-anchor="middle" font-size="96" dominant-baseline="middle">${emoji}</text>
      <text x="50%" y="78%" text-anchor="middle" font-size="26" fill="#0f172a" font-family="Segoe UI, sans-serif" font-weight="700">
        ${label}
      </text>
    </svg>
  `;
}

const stickerData = STICKERS.map((sticker) => {
  const svg = createStickerSvg(sticker);
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return { ...sticker, uri };
});

const stickerMap = new Map(stickerData.map((sticker) => [sticker.id, sticker]));

function renderEmojiGrid(filter = "") {
  if (!emojiGrid) return;
  const query = filter.trim().toLowerCase();
  emojiGrid.innerHTML = "";

  const fragment = document.createDocumentFragment();
  emojiCatalog
    .filter((item) => {
      if (!query) return true;
      return (
        item.symbol.includes(query) ||
        item.keywords.some((keyword) => keyword.includes(query))
      );
    })
    .forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "emoji-item";
      button.textContent = item.symbol;
      button.addEventListener("click", () => {
        insertEmoji(item.symbol);
      });
      fragment.appendChild(button);
    });

  emojiGrid.appendChild(fragment);
}

function renderStickerGrid() {
  if (!stickerGrid) return;
  stickerGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  stickerData.forEach((sticker) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sticker-item";
    button.setAttribute("aria-label", sticker.label);
    const img = document.createElement("img");
    img.src = sticker.uri;
    img.alt = sticker.label;
    button.appendChild(img);
    button.addEventListener("click", () => {
      sendSticker(sticker.id);
    });
    fragment.appendChild(button);
  });

  stickerGrid.appendChild(fragment);
}

function insertEmoji(emoji) {
  if (!messageInput) return;
  messageInput.focus();
  const start = messageInput.selectionStart || 0;
  const end = messageInput.selectionEnd || 0;
  const value = messageInput.value || "";
  messageInput.value = value.slice(0, start) + emoji + value.slice(end);
  const cursor = start + emoji.length;
  messageInput.setSelectionRange(cursor, cursor);
  autoSizeTextarea();
}

function sendSticker(id) {
  if (!messageForm || !messageInput) return;
  messageInput.value = `[[sticker:${id}]]`;
  messageForm.requestSubmit();
}

function positionEmojiPanel() {
  if (!emojiPanel || !emojiButton) return;
  const chatContainer = document.querySelector(".chat");
  if (!chatContainer) return;
  const chatRect = chatContainer.getBoundingClientRect();
  const buttonRect = emojiButton.getBoundingClientRect();
  const panelWidth = emojiPanel.offsetWidth || 0;
  const padding = 16;
  const desiredLeft = buttonRect.left - chatRect.left;
  const maxLeft = Math.max(padding, chatRect.width - panelWidth - padding);
  const left = Math.min(Math.max(desiredLeft, padding), maxLeft);
  emojiPanel.style.left = `${left}px`;
  emojiPanel.style.right = "auto";
}

function showEmojiPanel() {
  if (!emojiPanel) return;
  emojiPanel.classList.remove("hidden");
  if (emojiSearch) {
    emojiSearch.value = "";
  }
  renderEmojiGrid("");
  renderStickerGrid();
  positionEmojiPanel();
}

function hideEmojiPanel() {
  if (!emojiPanel) return;
  emojiPanel.classList.add("hidden");
}

function setEmojiTab(tab) {
  if (!emojiPanel) return;
  const tabs = emojiPanel.querySelectorAll(".emoji-tab");
  tabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  if (emojiGrid) emojiGrid.classList.toggle("hidden", tab !== "emoji");
  if (stickerGrid) stickerGrid.classList.toggle("hidden", tab !== "stickers");
  if (emojiSearch) {
    emojiSearch.parentElement?.classList.toggle("hidden", tab !== "emoji");
  }
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
  if (event.key !== "Escape") return;
  if (lightbox && !lightbox.classList.contains("hidden")) {
    closeLightbox();
  }
  if (emojiPanel && !emojiPanel.classList.contains("hidden")) {
    hideEmojiPanel();
  }
  if (dmPopup && !dmPopup.classList.contains("hidden")) {
    closeDmPopup();
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
  messageInput.addEventListener("input", () => {
    autoSizeTextarea();
    if (!mentionTarget) return;
    const detected = detectMentionTarget(messageInput.value);
    if (!detected || !isSameLogin(detected, mentionTarget)) {
      mentionTarget = null;
    }
  });
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

if (messagesList) {
  messagesList.addEventListener("scroll", () => {
    closeReactionPicker();
    if (isMessagesNearBottom()) {
      clearUnreadMessages();
      maybeAutoDismissVisibleNotifications();
      processRecipientHighlights();
      return;
    }
    updateUnreadOnScroll();
    maybeAutoDismissVisibleNotifications();
    processRecipientHighlights();
  });

  messagesList.addEventListener("click", (event) => {
    if (event.target === messagesList) {
      mentionTarget = null;
    }
  });
}

if (unreadIndicator) {
  unreadIndicator.addEventListener("click", () => {
    if (firstUnreadMessage) {
      firstUnreadMessage.scrollIntoView({ behavior: "smooth", block: "start" });
      setTimeout(updateUnreadOnScroll, 200);
    } else {
      scrollMessagesToBottom();
    }
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

if (emojiButton && emojiPanel) {
  emojiButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (emojiPanel.classList.contains("hidden")) {
      showEmojiPanel();
    } else {
      hideEmojiPanel();
    }
  });
}

if (emojiSearch) {
  emojiSearch.addEventListener("input", () => {
    renderEmojiGrid(emojiSearch.value);
  });
}

if (emojiPanel) {
  const tabs = emojiPanel.querySelectorAll(".emoji-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setEmojiTab(tab.dataset.tab);
    });
  });
}

document.addEventListener("click", (event) => {
  if (!emojiPanel || emojiPanel.classList.contains("hidden")) return;
  if (emojiPanel.contains(event.target) || emojiButton?.contains(event.target)) {
    return;
  }
  hideEmojiPanel();
});
window.addEventListener("resize", () => {
  if (!emojiPanel || emojiPanel.classList.contains("hidden")) return;
  positionEmojiPanel();
});

// --- звук уведомлений ---
const MUTE_PUBLIC_KEY = "minichat_muted_public";
const MUTE_PRIVATE_KEY = "minichat_muted_private";
const MUTE_LEGACY_KEY = "minichat_muted";

function isChatMuted(chatType) {
  return chatType === "direct" ? isPrivateMuted : isPublicMuted;
}

function updateMuteToggle() {
  if (!muteToggle) return;
  const isDirect = activeChat.type === "direct";
  const isCurrentMuted = isDirect ? isPrivateMuted : isPublicMuted;
  const isEverywhereMuted = isPublicMuted && isPrivateMuted;
  let title = "";

  if (isEverywhereMuted) {
    title = "Звук отключен везде";
  } else if (isDirect) {
    title = isPrivateMuted ? "Звук ЛС выключен" : "Звук ЛС включен";
    if (isPublicMuted) {
      title += " (общий чат выключен)";
    }
  } else {
    title = isPublicMuted ? "Звук общего чата выключен" : "Звук общего чата включен";
    if (isPrivateMuted) {
      title += " (ЛС выключены)";
    }
  }

  muteToggle.textContent = isCurrentMuted ? "🔕" : "🔔";
  muteToggle.classList.toggle("muted", isCurrentMuted || isEverywhereMuted);
  muteToggle.title = title;
}

// --- звук уведомлений ---
function playNotification(chatType = "public") {
  if (isChatMuted(chatType)) return;

  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    const now = audioCtx.currentTime;

    const scheduleTone = (start, startFreq, endFreq, duration, peak = 0.18) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(startFreq, start);
      osc.frequency.linearRampToValueAtTime(endFreq, start + duration);

      gain.gain.setValueAtTime(0.0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    if (chatType === "direct") {
      scheduleTone(now, 980, 760, 0.12, 0.2);
      scheduleTone(now + 0.16, 1220, 920, 0.12, 0.18);
    } else {
      scheduleTone(now, 920, 680, 0.16, 0.18);
    }
  } catch (e) {
    // молча игнорируем
  }
}

// --- инициализация mute-кнопки ---
if (muteToggle) {
  const legacy = localStorage.getItem(MUTE_LEGACY_KEY);
  const savedPublic = localStorage.getItem(MUTE_PUBLIC_KEY);
  const savedPrivate = localStorage.getItem(MUTE_PRIVATE_KEY);

  if (savedPublic === "1") {
    isPublicMuted = true;
  }
  if (savedPrivate === "1") {
    isPrivateMuted = true;
  }
  if (legacy === "1" && savedPublic === null && savedPrivate === null) {
    isPublicMuted = true;
    isPrivateMuted = true;
  }

  updateMuteToggle();

  muteToggle.addEventListener("click", () => {
    if (activeChat.type === "direct") {
      isPrivateMuted = !isPrivateMuted;
      localStorage.setItem(MUTE_PRIVATE_KEY, isPrivateMuted ? "1" : "0");
    } else {
      isPublicMuted = !isPublicMuted;
      localStorage.setItem(MUTE_PUBLIC_KEY, isPublicMuted ? "1" : "0");
    }
    localStorage.setItem(MUTE_LEGACY_KEY, "0");
    updateMuteToggle();
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

function truncateText(text, limit) {
  const chars = Array.from(String(text ?? ""));
  if (chars.length <= limit) {
    return chars.join("");
  }
  return `${chars.slice(0, limit).join("")}…`;
}

function formatUnreadCount(count) {
  if (!count) return "";
  return count > 9 ? "9+" : String(count);
}

function getDirectHistory(partner) {
  if (!directHistories.has(partner)) {
    directHistories.set(partner, []);
  }
  return directHistories.get(partner);
}

function updateChatHeader() {
  if (!chatTitleText || !chatContext || !backToPublic) return;
  if (activeChat.type === "direct" && activeChat.partner) {
    chatTitleText.textContent = "Личное сообщение";
    chatContext.textContent = `с ${activeChat.partner}`;
    chatContext.classList.remove("hidden");
    chatContext.classList.add("is-direct");
    backToPublic.classList.remove("hidden");
  } else {
    chatTitleText.textContent = "БРО ЧАТ";
    chatContext.textContent = "";
    chatContext.classList.add("hidden");
    chatContext.classList.remove("is-direct");
    backToPublic.classList.add("hidden");
  }
}

function clearDirectUnread(partner) {
  if (!partner) return;
  directUnreadCounts.delete(partner);
}

function registerDirectUnread(partner) {
  if (!partner) return;
  const next = (directUnreadCounts.get(partner) || 0) + 1;
  directUnreadCounts.set(partner, next);
}

function renderActiveChat() {
  if (!messagesList) return;
  messagesList.innerHTML = "";
  messageElements.clear();
  messageElementMap.clear();
  clearUnreadMessages();
  const items =
    activeChat.type === "direct" && activeChat.partner
      ? getDirectHistory(activeChat.partner)
      : publicHistory;
  items.forEach((item) => {
    if (item.system) {
      appendMessageElement(buildSystemMessageElement(item.payload), {
        countUnread: false,
      });
      return;
    }
    renderMessage({
      ...item,
      chatType: item.chatType || activeChat.type,
      local: Boolean(item.local),
      silent: true,
    });
  });
  scrollMessagesToBottom();
}

function setActiveChat(type, partner = null) {
  const nextType = type === "direct" ? "direct" : "public";
  activeChat = { type: nextType, partner: nextType === "direct" ? partner : null };
  if (nextType === "direct" && partner) {
    clearDirectUnread(partner);
  }
  if (nextType !== "public") {
    mentionTarget = null;
  }
  updateChatHeader();
  updateMuteToggle();
  closeDmPopup();
  hideReplyPreview();
  renderActiveChat();
  updatePublicShortcutVisibility();
  if (typeof renderUserList === "function") {
    renderUserList();
  }
  maybeAutoDismissVisibleNotifications();
}

function getStickerPayload(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^\[\[sticker:([a-z0-9_-]+)\]\]$/i);
  if (!match) return null;
  return stickerMap.get(match[1]) || null;
}

const SCROLL_THRESHOLD = 40;

function isMessagesNearBottom() {
  if (!messagesList) return true;
  const distance =
    messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight;
  return distance <= SCROLL_THRESHOLD;
}

function scrollMessagesToBottom() {
  if (!messagesList) return;
  messagesList.scrollTop = messagesList.scrollHeight;
}

function updateUnreadIndicator() {
  if (!unreadIndicator) return;
  if (unreadMessages.length === 0) {
    unreadIndicator.classList.add("hidden");
    unreadIndicator.textContent = "";
    return;
  }
  unreadIndicator.textContent = `Новые сообщения: ${unreadMessages.length}`;
  unreadIndicator.classList.remove("hidden");
}

function registerUnreadMessage(messageEl) {
  if (!messageEl) return;
  messageEl.classList.add("is-unread");
  unreadMessages.push(messageEl);
  firstUnreadMessage = unreadMessages[0] || null;
  updateUnreadIndicator();
}

function clearUnreadMessages() {
  unreadMessages.forEach((messageEl) => {
    messageEl.classList.remove("is-unread");
  });
  unreadMessages = [];
  firstUnreadMessage = null;
  updateUnreadIndicator();
}

function updateUnreadOnScroll() {
  if (!messagesList || unreadMessages.length === 0) return;
  const containerRect = messagesList.getBoundingClientRect();
  const remaining = [];
  unreadMessages.forEach((messageEl) => {
    if (!messageEl.isConnected) return;
    const messageRect = messageEl.getBoundingClientRect();
    const isVisible = messageRect.top < containerRect.bottom - 12;
    if (isVisible) {
      messageEl.classList.remove("is-unread");
      return;
    }
    remaining.push(messageEl);
  });
  unreadMessages = remaining;
  firstUnreadMessage = unreadMessages[0] || null;
  if (unreadMessages.length === 0 && isMessagesNearBottom()) {
    clearUnreadMessages();
  } else {
    updateUnreadIndicator();
  }
}

function appendMessageElement(messageEl, { countUnread }) {
  if (!messagesList || !messageEl) return;
  const wasNearBottom = isMessagesNearBottom();
  messagesList.appendChild(messageEl);

  if (wasNearBottom) {
    scrollMessagesToBottom();
    clearUnreadMessages();
  } else if (countUnread) {
    registerUnreadMessage(messageEl);
  }
  processRecipientHighlights();
  maybeAutoDismissVisibleNotifications();
}

function buildSystemMessageElement(payload) {
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

  return li;
}

function renderMessage({
  login,
  color,
  text,
  timestamp,
  local,
  silent,
  replyTo,
  mentionTo,
  attachments,
  avatar,
  avatarId,
  messageId,
  readAll,
  chatType = "public",
}) {
  const li = document.createElement("li");
  li.classList.add("message");
  if (login === currentLogin) {
    li.classList.add("me");
  }
  const resolvedMessageId =
    messageId || `msg-${Date.now()}-${messageIdCounter++}`;
  li.dataset.messageId = resolvedMessageId;
  messageElementMap.set(resolvedMessageId, li);

  const time = new Date(timestamp);
  const timeStr = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // блок цитаты, если это ответ на другое сообщение
  let replyHtml = "";
  if (replyTo && replyTo.login && replyTo.text) {
    const raw = String(replyTo.text || "");
    const snippet = truncateText(raw, 120);
    const replyMessageId = replyTo.messageId ? escapeHtml(replyTo.messageId) : "";
    const replyDataAttr = replyMessageId ? `data-reply-id="${replyMessageId}"` : "";
    replyHtml = `
      <div class="reply-block" ${replyDataAttr}>
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

  const sticker = getStickerPayload(text);
  if (sticker) {
    li.classList.add("sticker");
  }

  const avatarUrl = avatar || getAvatarById(avatarId) || getAvatarForLogin(login);

  const isMine = login === currentLogin;
  const initialCheckState = readAll ? "read" : "sent";

  const statusHtml = `
    <div class="message-status">
      <span class="message-time">${timeStr}</span>
      <span class="message-checks ${
        initialCheckState === "read" ? "is-read" : "is-sent"
      }" data-state="${initialCheckState}">${
        initialCheckState === "read" ? "✓✓" : "✓"
      }</span>
    </div>
  `;

  li.innerHTML = `
    <img class="message-avatar" src="${avatarUrl}" alt="${escapeHtml(login)}" />
    <div class="message-bubble">
      <div class="meta">
        <button type="button" class="author" data-login="${escapeHtml(login)}">${escapeHtml(
          login
        )}</button>
      </div>
      ${replyHtml}
      <div class="message-body">
        <div class="text">${
          sticker
            ? `<div class="sticker-message"><img src="${sticker.uri}" alt="${escapeHtml(
                sticker.label
              )}" /></div>`
            : formatMessageText(text, { mentionTo })
        }</div>
        ${statusHtml}
      </div>
      ${attachmentsHtml}
      <div class="message-reactions" aria-label="Реакции"></div>
      <button type="button" class="reaction-trigger" title="Поставить реакцию">😊</button>
    </div>
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

  const bubbleEl = li.querySelector(".message-bubble");
  if (bubbleEl) {
    bubbleEl.style.setProperty("--bubble-border", border);
    bubbleEl.style.setProperty("--bubble-bg", bubbleBg);
    bubbleEl.style.boxShadow = `0 0 12px ${glow}`;
  }

  const authorEl = li.querySelector(".author");
  if (authorEl) {
    authorEl.style.color = baseColor;
    if (login && login !== currentLogin) {
      authorEl.classList.add("is-clickable");
      authorEl.addEventListener("click", (event) => {
        event.stopPropagation();
        queuePublicMention(login);
      });
    } else {
      authorEl.disabled = true;
    }
  }

  const avatarEl = li.querySelector(".message-avatar");
  if (avatarEl) {
    avatarEl.style.setProperty("--avatar-border", baseColor);
    avatarEl.style.setProperty("--avatar-glow", hexToRgba(baseColor, 0.45));
    if (login !== currentLogin) {
      avatarEl.classList.add("is-clickable");
      avatarEl.addEventListener("click", (event) => {
        event.stopPropagation();
        openDmPopup(login, avatarEl);
      });
    }
  }

  const replyBlock = li.querySelector(".reply-block");
  if (replyBlock && replyTo?.login) {
    const replyColor =
      replyTo.color || getColorForLogin(replyTo.login || "guest");
    replyBlock.style.setProperty("--reply-accent", replyColor);
    const replyAuthor = replyBlock.querySelector(".reply-author");
    if (replyAuthor) {
      replyAuthor.style.color = replyColor;
      replyAuthor.classList.add("is-clickable");
      replyAuthor.addEventListener("click", (event) => {
        event.stopPropagation();
        setActiveChat("public");
        queuePublicMention(replyTo.login, { allowSelf: true });
      });
    }
  }

  const mentionChip = li.querySelector(".mention-chip");
  if (mentionChip && mentionTo) {
    const mentionColor = getColorForLogin(mentionTo);
    mentionChip.style.setProperty("--mention-color", mentionColor);
    mentionChip.addEventListener("click", (event) => {
      event.stopPropagation();
      setActiveChat("public");
      queuePublicMention(mentionTo, { allowSelf: true });
    });
  }

  // клик по сообщению — выбрать его как цель для ответа
  if (bubbleEl) {
    bubbleEl.addEventListener("click", (event) => {
      event.stopPropagation();
      replyTarget = {
        login,
        text: String(text || ""),
        messageId: resolvedMessageId,
        color: baseColor,
      };
      showReplyPreview();
    });
  }

  if (replyBlock && replyTo?.messageId) {
    replyBlock.classList.add("is-clickable");
    replyBlock.addEventListener("click", (event) => {
      event.stopPropagation();
      const targetPartner = chatType === "direct" ? activeChat.partner : null;
      jumpToMessage(replyTo.messageId, chatType, targetPartner);
    });
  }

  const reactionsEl = li.querySelector(".message-reactions");
  const reactionTrigger = li.querySelector(".reaction-trigger");
  if (reactionTrigger) {
    reactionTrigger.addEventListener("click", (event) => {
      event.stopPropagation();
      openReactionPicker(resolvedMessageId, reactionTrigger);
    });
  }
  const checkEl = li.querySelector(".message-checks");
  messageElements.set(resolvedMessageId, { reactionsEl, checkEl });
  updateReactionDisplay(resolvedMessageId);

  if (!isMine && resolvedMessageId) {
    markMessageRead(resolvedMessageId);
  }

  appendMessageElement(li, { countUnread: !local && !silent });

  if (!silent && !local && login !== currentLogin) {
    playNotification(chatType);
  }

  const shouldHighlightForRecipient =
    !silent &&
    !local &&
    login !== currentLogin &&
    ((mentionTo && isSameLogin(mentionTo, currentLogin)) ||
      (replyTo?.login && isSameLogin(replyTo.login, currentLogin)));
  if (shouldHighlightForRecipient) {
    const highlightColor =
      color || getColorForLogin(login || "guest");
    scheduleRecipientHighlight(resolvedMessageId, li, highlightColor);
  }
}



loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const value = loginInput.value.trim();
  if (!value) return;

  currentLogin = value;
  currentColor = (colorInput && colorInput.value) || "#38bdf8";
  currentAvatar = customAvatar;
  currentAvatarOriginal = customAvatarOriginal || customAvatar;
  currentAvatarId = customAvatar ? null : selectedAvatarId || avatarCatalog[0]?.id || null;

  socket.emit("join", {
    login: value,
    color: currentColor,
    avatarId: currentAvatarId,
    avatar: currentAvatar,
    avatarOriginal: currentAvatarOriginal,
  });

  if (botsEnabled) {
    socket.emit("startBots");
  }

  loginScreen.classList.add("hidden");
  chatScreen.classList.remove("hidden");
  messageInput.focus();
  setChatActivity(!document.hidden);
  setActiveChat("public");
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
  const messageId = `msg-${Date.now()}-${messageIdCounter++}`;
  const isDirectChat =
    activeChat.type === "direct" && activeChat.partner && activeChat.partner !== currentLogin;
  const directPartner = isDirectChat ? activeChat.partner : null;
  const mentionFromText =
    !isDirectChat && !mentionTarget ? detectMentionTarget(text) : null;
  const mentionTo =
    !isDirectChat && mentionTarget && mentionTarget !== currentLogin
      ? mentionTarget
      : mentionFromText && mentionFromText !== currentLogin
        ? mentionFromText
      : null;

  // локально показываем сразу, с учётом reply
  const localPayload = {
    login: currentLogin || "Я",
    color: currentColor || "#38bdf8",
    avatarId: currentAvatarId,
    avatar: currentAvatar,
    avatarOriginal: currentAvatarOriginal,
    text,
    timestamp: ts,
    local: true,
    replyTo: replyTarget ? { ...replyTarget } : null,
    attachments: uploadedAttachments,
    messageId,
    readAll: false,
    chatType: isDirectChat ? "direct" : "public",
    mentionTo,
  };

  if (isDirectChat && directPartner) {
    getDirectHistory(directPartner).push(localPayload);
  } else {
    publicHistory.push(localPayload);
  }

  renderMessage(localPayload);

  // на сервер отправляем объект, а не голую строку
  if (isDirectChat && directPartner) {
    socket.emit("directMessage", {
      messageId,
      text,
      to: directPartner,
      replyTo: replyTarget ? { ...replyTarget } : null,
      attachments: uploadedAttachments,
    });
  } else {
    socket.emit("chatMessage", {
      messageId,
      text,
      replyTo: replyTarget ? { ...replyTarget } : null,
      attachments: uploadedAttachments,
      mentionTo,
    });
  }

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
  mentionTarget = null;
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

window.addEventListener("focus", () => setChatActivity(true));
window.addEventListener("blur", () => setChatActivity(false));
document.addEventListener("visibilitychange", () => {
  setChatActivity(!document.hidden);
});

socket.on("history", (items) => {
  publicHistory.length = 0;
  if (!Array.isArray(items)) return;

  items.forEach((msg) => {
    if (!botsEnabled && msg.isBot) return;
    publicHistory.push({
      messageId: msg.messageId,
      login: msg.login,
      color: msg.color,
      text: msg.text,
      timestamp: msg.timestamp,
      avatar: msg.avatar,
      avatarId: msg.avatarId,
      avatarOriginal: msg.avatarOriginal,
      attachments: msg.attachments || [],
      replyTo: msg.replyTo || null,
      mentionTo: msg.mentionTo || null,
      readAll: Boolean(msg.readAll),
      local: false,
      chatType: "public",
    });
  });

  if (activeChat.type === "public") {
    renderActiveChat();
  }
});


socket.on("chatMessage", (payload) => {
  const {
    login,
    text,
    timestamp,
    color,
    isBot,
    replyTo,
    attachments,
    avatar,
    avatarId,
    avatarOriginal,
    messageId,
    readAll,
    mentionTo,
  } = payload;

  if (login === currentLogin) return;
  if (!botsEnabled && isBot) return;
  const entry = {
    messageId,
    login,
    color,
    text,
    timestamp,
    avatar,
    avatarId,
    avatarOriginal,
    attachments: attachments || [],
    replyTo: replyTo || null,
    mentionTo: mentionTo || null,
    readAll: Boolean(readAll),
    local: false,
    chatType: "public",
  };
  publicHistory.push(entry);

  if (activeChat.type === "public") {
    renderMessage(entry);
  }

  if (login !== currentLogin && mentionTo && isSameLogin(mentionTo, currentLogin)) {
    pushChatNotification({
      title: "Вас выбрали в общем чате",
      body: `${login} написал(а) сообщение для вас.`,
      actionLabel: "Перейти к сообщению",
      onAction: () => jumpToMessage(messageId, "public"),
      autoDismissMs: 3000,
      autoDismissWhenVisible: true,
      messageId,
      chatType: "public",
    });
    if (activeChat.type !== "public") {
      playNotification("public");
    }
  }

  if (
    login !== currentLogin &&
    replyTo?.login &&
    isSameLogin(replyTo.login, currentLogin)
  ) {
    const targetMessageId = replyTo.messageId || messageId;
    pushChatNotification({
      title: "Вас процитировали",
      body: `${login} ответил(а) на ваше сообщение.`,
      actionLabel: replyTo.messageId ? "Показать цитату" : "Перейти к сообщению",
      onAction: () => jumpToMessage(targetMessageId, "public"),
      autoDismissMs: 3000,
      autoDismissWhenVisible: true,
      messageId,
      chatType: "public",
    });
  }
});

socket.on("directMessage", (payload) => {
  const {
    login,
    text,
    timestamp,
    color,
    replyTo,
    attachments,
    avatar,
    avatarId,
    avatarOriginal,
    messageId,
    to,
  } = payload || {};

  if (!login || login === currentLogin) return;
  if (to && to !== currentLogin) return;
  const partner = login === currentLogin ? to : login;
  if (!partner) return;

  const entry = {
    messageId,
    login,
    color,
    text,
    timestamp,
    avatar,
    avatarId,
    avatarOriginal,
    attachments: attachments || [],
    replyTo: replyTo || null,
    readAll: false,
    local: false,
    chatType: "direct",
  };

  getDirectHistory(partner).push(entry);

  if (activeChat.type === "direct" && activeChat.partner === partner) {
    renderMessage(entry);
  } else {
    registerDirectUnread(partner);
    renderUserList();
    playNotification("direct");
  }
});

socket.on("messageReadAll", (payload) => {
  const messageId = payload?.messageId;
  if (!messageId) return;
  const entry = messageElements.get(messageId);
  if (!entry?.checkEl) return;
  setMessageChecks(entry.checkEl, "read");
});


socket.on("systemMessage", (payload) => {
  publicHistory.push({ system: true, payload });
  if (activeChat.type === "public") {
    appendMessageElement(buildSystemMessageElement(payload), { countUnread: false });
  }
});

socket.on("userList", (users) => {
  lastUserList = Array.isArray(users) ? users : [];
  renderUserList();
});

function normalizeUserName(user) {
  return typeof user === "string" ? user : user?.login;
}

function isSameLogin(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function getOnlineUser(name) {
  return lastUserList.find((user) => normalizeUserName(user) === name) || null;
}

function getEntryTimestamp(entry) {
  const value = entry?.timestamp ? Date.parse(entry.timestamp) : 0;
  return Number.isFinite(value) ? value : 0;
}

function resolveUserVisuals({
  name,
  user,
  fallbackColor,
  fallbackAvatar,
  fallbackAvatarId,
  fallbackAvatarOriginal,
}) {
  const color =
    (user && user.color) || fallbackColor || getColorForLogin(name);
  const avatarUrl =
    fallbackAvatar ||
    (user && user.avatar) ||
    getAvatarById(fallbackAvatarId || (user && user.avatarId)) ||
    getAvatarForLogin(name);
  const avatarOriginal =
    fallbackAvatarOriginal || (user && user.avatarOriginal) || avatarUrl;
  return { color, avatarUrl, avatarOriginal };
}

function createUserListItem({
  name,
  color,
  avatarUrl,
  unreadCount = 0,
  isClickable = false,
  isActive = false,
  isSelf = false,
  isOnline = null,
}) {
  const li = document.createElement("li");
  if (isClickable) li.classList.add("is-clickable");
  if (isActive) li.classList.add("is-active");
  if (isSelf) li.classList.add("is-self");

  const avatar = document.createElement("img");
  avatar.className = "user-avatar";
  avatar.src = avatarUrl;
  avatar.alt = name;
  avatar.style.setProperty("--avatar-border", color);
  avatar.style.setProperty("--avatar-glow", hexToRgba(color, 0.35));

  const label = document.createElement("span");
  label.className = "user-name";
  label.textContent = name;

  li.appendChild(avatar);
  li.appendChild(label);

  if (isSelf) {
    const tag = document.createElement("span");
    tag.className = "user-tag";
    tag.textContent = "Вы";
    li.appendChild(tag);
  }

  if (typeof isOnline === "boolean") {
    const status = document.createElement("span");
    status.className = `user-status ${isOnline ? "is-online" : "is-offline"}`;
    status.title = isOnline ? "Онлайн" : "Офлайн";
    li.appendChild(status);
  }

  if (unreadCount > 0) {
    const unread = document.createElement("span");
    unread.className = "user-unread";
    unread.textContent = formatUnreadCount(unreadCount);
    li.appendChild(unread);
  }

  li.style.borderColor = hexToRgba(color, 0.7);
  li.style.color = color;
  li.style.boxShadow = `0 0 0 1px ${hexToRgba(color, 0.3)}`;

  return li;
}

function renderSelfUser() {
  if (!selfList) return;
  selfList.innerHTML = "";
  if (!currentLogin) return;

  const user = getOnlineUser(currentLogin);
  const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({
    name: currentLogin,
    user,
    fallbackColor: currentColor,
    fallbackAvatar: currentAvatar,
    fallbackAvatarId: currentAvatarId,
    fallbackAvatarOriginal: currentAvatarOriginal,
  });

  const li = createUserListItem({
    name: currentLogin,
    color,
    avatarUrl,
    isSelf: true,
  });

  selfList.appendChild(li);
}

function renderDirectList(onlineLogins) {
  if (!directList) return;
  directList.innerHTML = "";

  const partners = new Set([
    ...directHistories.keys(),
    ...directUnreadCounts.keys(),
  ]);
  if (activeChat.type === "direct" && activeChat.partner) {
    partners.add(activeChat.partner);
  }
  partners.delete(currentLogin);

  const items = Array.from(partners)
    .map((partner) => {
      const history = getDirectHistory(partner);
      const lastEntry = history[history.length - 1] || null;
      const onlineUser = getOnlineUser(partner);
  const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({
    name: partner,
    user: onlineUser,
    fallbackColor: lastEntry?.color,
    fallbackAvatar: lastEntry?.avatar,
    fallbackAvatarId: lastEntry?.avatarId,
    fallbackAvatarOriginal: lastEntry?.avatarOriginal,
  });
      return {
        partner,
        color,
        avatarUrl,
        lastTimestamp: lastEntry ? getEntryTimestamp(lastEntry) : 0,
      };
    })
    .sort((a, b) => b.lastTimestamp - a.lastTimestamp);

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Пока нет диалогов";
    directList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const unreadCount = directUnreadCounts.get(item.partner) || 0;
    const li = createUserListItem({
      name: item.partner,
      color: item.color,
      avatarUrl: item.avatarUrl,
      unreadCount,
      isClickable: true,
      isActive: activeChat.type === "direct" && activeChat.partner === item.partner,
      isOnline: onlineLogins.has(item.partner),
    });
    li.addEventListener("click", () => {
      setActiveChat("direct", item.partner);
    });
    directList.appendChild(li);
  });
}

function renderOnlineList() {
  if (!usersList) return;
  usersList.innerHTML = "";

  const onlineUsers = lastUserList
    .map((user) => (typeof user === "string" ? { login: user } : user))
    .filter((user) => user?.login && user.login !== currentLogin);

  onlineUsers.forEach((user) => {
    const name = user.login;
      const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({ name, user });
    const li = createUserListItem({
      name,
      color,
      avatarUrl,
      isClickable: true,
    });
    li.addEventListener("click", () => {
      openProfileCard({ name, color, avatarUrl, avatarOriginal });
    });
    usersList.appendChild(li);
  });

  // фейковые ники ботов для нагрузочного теста
  if (botsEnabled) {
    FAKE_BOT_NAMES.forEach((name, index) => {
      const li = document.createElement("li");
      li.classList.add("fake-bot");

      const baseColor = getColorForLogin(name);
      const avatarOption = avatarCatalog[index % avatarCatalog.length];
      const avatarUrl = avatarOption ? avatarOption.uri : getAvatarForLogin(name);

      const avatar = document.createElement("img");
      avatar.className = "user-avatar";
      avatar.src = avatarUrl;
      avatar.alt = name;
      avatar.style.setProperty("--avatar-border", baseColor);
      avatar.style.setProperty("--avatar-glow", hexToRgba(baseColor, 0.35));

      const label = document.createElement("span");
      label.className = "user-name";
      label.textContent = name;

      li.appendChild(avatar);
      li.appendChild(label);

      li.style.borderColor = hexToRgba(baseColor, 0.5);
      li.style.color = baseColor;
      li.style.boxShadow = `0 0 0 1px ${hexToRgba(baseColor, 0.2)}`;

      li.addEventListener("click", () => {
        openProfileCard({ name, color: baseColor, avatarUrl, avatarOriginal: avatarUrl });
      });

      usersList.appendChild(li);
    });
  }
}

function renderUserList() {
  const onlineLogins = new Set(
    lastUserList
      .map((user) => normalizeUserName(user))
      .filter(Boolean)
  );

  renderSelfUser();
  renderDirectList(onlineLogins);
  renderOnlineList();
  updatePublicShortcutVisibility();
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

const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

function wrapEmojisInHtml(html) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (part.startsWith("<")) return part;
      return part.replace(EMOJI_REGEX, '<span class="chat-emoji">$&</span>');
    })
    .join("");
}

function formatMessageText(text, { mentionTo } = {}) {
  if (!mentionTo) {
    return wrapEmojisInHtml(linkify(text));
  }
  const mentionMatch = getLeadingMention(text, mentionTo);
  if (!mentionMatch) {
    return wrapEmojisInHtml(linkify(text));
  }
  const mentionHtml = `<button type="button" class="mention-chip" data-mention="${escapeHtml(
    mentionTo
  )}">${escapeHtml(mentionMatch.mentionText)}</button>`;
  const remainderHtml = wrapEmojisInHtml(linkify(mentionMatch.remainder));
  return `${mentionHtml}${remainderHtml}`;
}
