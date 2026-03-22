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
  const rgb = hexToRgb(hex) || { r: 56, g: 189, b: 248 };
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const num = parseInt(normalized, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getReadableOwnBubblePalette(hexColor) {
  const rgb = hexToRgb(hexColor) || { r: 31, g: 79, b: 116 };
  const toLinear = (value) => {
    const channel = value / 255;
    if (channel <= 0.03928) return channel / 12.92;
    return Math.pow((channel + 0.055) / 1.055, 2.4);
  };
  const luminance =
    0.2126 * toLinear(rgb.r) +
    0.7152 * toLinear(rgb.g) +
    0.0722 * toLinear(rgb.b);
  const isLight = luminance > 0.5;

  if (isLight) {
    return {
      text: "#0f172a",
      muted: "rgba(15, 23, 42, 0.68)",
      link: "#1d4ed8",
      checks: "#0284c7",
    };
  }

  return {
    text: "#f8fafc",
    muted: "rgba(226, 232, 240, 0.78)",
    link: "#7dd3fc",
    checks: "#38bdf8",
  };
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
const reactionRequestInFlight = new Set();
const messageElements = new Map();
const messageElementMap = new Map();
const readMessageIds = new Set();
let messageIdCounter = 0;
let activeReactionTarget = null;
let messageDeleteConfirmResolver = null;
let memberDeleteConfirmResolver = null;
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
const editPreview = document.getElementById("edit-preview");
const editPreviewAuthorEl = editPreview
  ? editPreview.querySelector(".reply-author")
  : null;
const editPreviewTextEl = editPreview
  ? editPreview.querySelector(".reply-text")
  : null;
const editCancelBtn = document.getElementById("edit-cancel");

const loginScreen = document.getElementById("login-screen");
const chatScreen = document.getElementById("chat-screen");
const sidebarResizer = document.getElementById("sidebar-resizer");
const loginForm = document.getElementById("login-form");
const loginInput = document.getElementById("login");
const loginPasswordInput = document.getElementById("login-password");
const registerToggle = document.getElementById("register-toggle");
const registerForm = document.getElementById("register-form");
const registerLoginInput = document.getElementById("register-login");
const registerEmailInput = document.getElementById("register-email");
const registerPasswordInput = document.getElementById("register-password");
const registerPasswordConfirmInput = document.getElementById("register-password-confirm");
const verifyToggle = document.getElementById("verify-toggle");
const verifyForm = document.getElementById("verify-form");
const verifyLoginInput = document.getElementById("verify-login");
const verifyCodeInput = document.getElementById("verify-code");
const verifySendCodeButton = document.getElementById("verify-send-code");
const resetToggle = document.getElementById("reset-toggle");
const resetForm = document.getElementById("reset-form");
const resetEmailInput = document.getElementById("reset-email");
const resetCodeInput = document.getElementById("reset-code");
const resetPasswordInput = document.getElementById("reset-password");
const resetPasswordConfirmInput = document.getElementById("reset-password-confirm");
const resetSendCodeButton = document.getElementById("reset-send-code");
const resetSendCodeHint = document.getElementById("reset-send-code-hint");
const loginFeedback = document.getElementById("login-feedback");
const registerFeedback = document.getElementById("register-feedback");
const verifyFeedback = document.getElementById("verify-feedback");
const resetFeedback = document.getElementById("reset-feedback");
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
const chatMain = document.querySelector(".chat");
const messageInput = document.getElementById("message-input");
const sendButton = messageForm ? messageForm.querySelector(".send-button") : null;
const messagesList = document.getElementById("messages");
const homeView = document.getElementById("home-view");
const notesView = document.getElementById("notes-view");
const usersList = document.getElementById("users-list");
const onlineUsersList = document.getElementById("online-users-list");
const contactsSection = document.getElementById("contacts-section");
const selfList = document.getElementById("self-user");
const chatRoomsList = document.getElementById("chat-rooms-list");
const directDialogsSection = document.getElementById("direct-dialogs-section");
const directList = document.getElementById("direct-list");
const onlineUsersSection = document.getElementById("online-users-section");
const chatStatus = document.getElementById("chat-status");
const chatTitleText = document.getElementById("chat-title-text");
const chatContext = document.getElementById("chat-context");
const publicParticipantsTrigger = document.getElementById("public-participants-trigger");
const backToPublic = document.getElementById("back-to-public");
const contactSearchButton = document.getElementById("contact-search-button");
const contactsToggle = document.getElementById("contacts-toggle");
const dialogsToggle = document.getElementById("dialogs-toggle");
const onlineToggle = document.getElementById("online-toggle");
const muteToggle = document.getElementById("mute-toggle");
const zoomRange = document.getElementById("zoom-range");
const zoomLabel = document.querySelector(".zoom-label");
const botsToggle = document.getElementById("bots-toggle");
const attachButton = document.getElementById("attach-button");
const emojiButton = document.getElementById("emoji-button");
const clearMessageButton = document.getElementById("clear-message-button");
const emojiPanel = document.getElementById("emoji-panel");
const emojiSearch = document.getElementById("emoji-search");
const emojiGrid = document.getElementById("emoji-grid");
const stickerGrid = document.getElementById("sticker-grid");
const attachmentInput = document.getElementById("attachment-input");
const attachmentCount = document.getElementById("attachment-count");
const attachmentPreview = document.getElementById("attachment-preview");
const composerLinkPreview = document.getElementById("composer-link-preview");
const unreadIndicator = document.getElementById("unread-indicator");
const scrollToLatestButton = document.getElementById("scroll-to-latest");
const notificationStack = document.getElementById("chat-notifications");
const publicChatShortcut = document.getElementById("public-chat-shortcut");
const homeNavLinks = document.querySelectorAll("[data-home-nav]");
const botsToggleLabel = document.querySelector(".bots-toggle");
const profileButton = document.getElementById("profile-button");
const logoutButton = document.getElementById("logout-button");
const chatSettingsButton = document.getElementById("chat-settings-button");
const contactSearchModal = document.getElementById("contact-search-modal");
const contactSearchClose = document.getElementById("contact-search-close");
const contactSearchInput = document.getElementById("contact-search-input");
const contactSearchResults = document.getElementById("contact-search-results");
const contactSearchLoading = document.getElementById("contact-search-loading");
const chatSettingsModal = document.getElementById("chat-settings-modal");
const chatSettingsClose = document.getElementById("chat-settings-close");
const chatSettingsAvatarPreview = document.getElementById("chat-settings-avatar-preview");
const chatSettingsAvatarUpload = document.getElementById("chat-settings-avatar-upload");
const chatSettingsNameInput = document.getElementById("chat-settings-name");
const chatSettingsSave = document.getElementById("chat-settings-save");
const chatSettingsMembers = document.getElementById("chat-settings-members");
const chatMembersModal = document.getElementById("chat-members-modal");
const chatMembersClose = document.getElementById("chat-members-close");
const chatMembersList = document.getElementById("chat-members-list");
const participantsModal = document.getElementById("participants-modal");
const participantsClose = document.getElementById("participants-close");
const participantsList = document.getElementById("participants-list");
const messageDeleteConfirmModal = document.getElementById("message-delete-confirm-modal");
const messageDeleteConfirmCancel = document.getElementById("message-delete-confirm-cancel");
const messageDeleteConfirmAccept = document.getElementById("message-delete-confirm-accept");
const memberDeleteConfirmModal = document.getElementById("member-delete-confirm-modal");
const memberDeleteConfirmCancel = document.getElementById("member-delete-confirm-cancel");
const memberDeleteConfirmAccept = document.getElementById("member-delete-confirm-accept");
const selfProfileModal = document.getElementById("self-profile-modal");
const selfProfileClose = document.getElementById("self-profile-close");
const selfProfileAvatarPreview = document.getElementById("self-profile-avatar-preview");
const selfProfileAvatarOptions = document.getElementById("self-profile-avatar-options");
const selfProfileAvatarUpload = document.getElementById("self-profile-avatar-upload");
const selfProfileLoginInput = document.getElementById("self-profile-login");
const selfProfileColorInput = document.getElementById("self-profile-color");
const selfProfileBubbleColorInput = document.getElementById("self-profile-bubble-color");
const selfProfileBubbleColorReset = document.getElementById("self-profile-bubble-color-reset");
const selfProfileOwnMessageSideSelect = document.getElementById("self-profile-own-message-side");
const selfProfileCurrentPasswordInput = document.getElementById("self-profile-password-current");
const selfProfileNewPasswordInput = document.getElementById("self-profile-password-new");
const selfProfileConfirmPasswordInput = document.getElementById("self-profile-password-confirm");
const selfProfileChangePasswordButton = document.getElementById("self-profile-password-change");
const selfProfileSave = document.getElementById("self-profile-save");
const hiddenDialogsList = document.getElementById("hidden-dialogs-list");
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

if (notificationStack && notificationStack.parentElement !== document.body) {
  document.body.appendChild(notificationStack);
}

// общий флаг: есть ли вообще тестовые боты в этой сборке
const ENABLE_TEST_BOTS = false;
const AUTH_STORAGE_KEY = "minichat_auth_v2";
const ACTIVE_CHAT_STORAGE_KEY = "minichat_active_chat_v1";
const PUBLIC_HISTORY_PAGE_SIZE = 40;
const PUBLIC_HISTORY_TOP_THRESHOLD = 80;
const DIRECT_HISTORY_PAGE_SIZE = 40;
const DIRECT_HISTORY_TOP_THRESHOLD = 80;
const SEND_COOLDOWN_MS = 3000;
const HIDDEN_DIRECT_DIALOGS_STORAGE_PREFIX = "minichat_hidden_dialogs_v1";
const VISIBLE_DIRECT_DIALOGS_STORAGE_PREFIX = "minichat_visible_dialogs_v1";
const OWN_BUBBLE_COLOR_STORAGE_PREFIX = "minichat_own_bubble_color_v1";
const OWN_MESSAGE_SIDE_STORAGE_PREFIX = "minichat_own_message_side_v1";
const NOTES_STORAGE_PREFIX = "minichat_notes_v1";
const SIDEBAR_WIDTH_STORAGE_KEY = "minichat_sidebar_width_v1";
const DEFAULT_OWN_BUBBLE_COLOR = "#1f4f74";
const DEFAULT_OWN_MESSAGE_SIDE = "right";
const DEFAULT_CHAT_ROOM_ID = "bro_chat_main";
const DEFAULT_CHAT_ROOM_TITLE = "БРО ЧАТ";
const CONTACT_SEARCH_PAGE_SIZE = 30;
const PRESENCE_HEARTBEAT_MS = 8000;
const SIDEBAR_WIDTH_MIN = 360;
const SIDEBAR_WIDTH_MAX = 760;
const SIDEBAR_MIN_CHAT_WIDTH = 420;
const DEFAULT_MESSAGE_PLACEHOLDER = messageInput?.getAttribute("placeholder") || "Напиши сообщение...";
const COMPOSER_LINK_REGEX =
  /((https?:\/\/|www\.)[^\s]+|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?)/i;
const COMPOSER_LINK_PREVIEW_DEBOUNCE_MS = 220;
const COMPOSER_LINK_PREVIEW_FETCH_TIMEOUT_MS = 3200;
const COMPOSER_LINK_PREVIEW_CACHE_TTL_MS = 3 * 60 * 1000;
const COMPOSER_LINK_PREVIEW_MIN_SCORE_TO_CACHE = 4;

let currentLogin = null;
let currentColor = null;
let currentAvatarId = null;
let currentAvatar = null;
let currentAvatarOriginal = null;
let currentOwnBubbleColor = DEFAULT_OWN_BUBBLE_COLOR;
let currentOwnMessageSide = DEFAULT_OWN_MESSAGE_SIDE;
let currentSessionToken = null;
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
let editTarget = null; // { chatType, messageId, originalText, hasAttachments, partner }
let isUploading = false;
let attachmentPreviewUrls = [];
let chatFileDragDepth = 0;
let isChatActive = false;
let unreadMessages = [];
let firstUnreadMessage = null;
let publicUnreadCount = 0;
let activeChat = { type: "home", partner: null };
let mentionTarget = null;
let lastJoinSignature = "";
let lastSentMessageAt = 0;
const hiddenDirectDialogs = new Set();
const visibleDirectDialogs = new Set();
let selfProfileAvatarDraft = null;
let selfProfileAvatarOriginalDraft = null;
let selfProfileAvatarIdDraft = null;
let availableChatRooms = [];
let currentChatRoomId = DEFAULT_CHAT_ROOM_ID;
let contactEntries = [];
let personalNotes = [];
const contactSearchState = {
  query: "",
  nextCursor: 0,
  total: 0,
  loading: false,
  items: [],
  requestId: 0,
};
let contactSearchDebounceTimer = null;
let chatRoomAvatarDraft = null;
let chatRoomAvatarOriginalDraft = null;
let chatRoomAvatarIdDraft = null;
let chatSettingsSavePending = false;
let chatMembersLoading = false;
let activeChatRenderToken = 0;
let directUnreadNoticeShown = false;
let publicParticipantsCache = [];
let isPublicChatExcluded = false;
const sectionCollapsedState = {
  contacts: false,
  dialogs: false,
  online: false,
};
let currentSidebarWidth = SIDEBAR_WIDTH_MIN;
let sidebarResizeState = null;
let composerLinkPreviewTimer = null;
let composerLinkPreviewRequestId = 0;
let composerLinkPreviewActiveUrl = "";
let composerLinkPreviewDisabled = false;
const composerLinkPreviewCache = new Map();
let messageLinkPreviewRequestCounter = 0;
const avatarOriginalCache = new Map();
const avatarOriginalRequests = new Map();
let avatarLightboxRequestId = 0;
let profileAvatarViewRequestId = 0;
let historyAutoloadBlockedUntil = 0;

function setChatActivity(active) {
  isChatActive = active;
  syncPresenceActivity();
  if (typeof updatePublicShortcutVisibility === "function") {
    updatePublicShortcutVisibility();
  }
  if (isChatActive) {
    maybeAutoDismissVisibleNotifications();
  }
}

function isPresenceActiveNow() {
  return !document.hidden && document.hasFocus() && activeChat.type !== "home";
}

function syncPresenceActivity() {
  if (!socket?.connected || !currentLogin) return;
  socket.emit("setPresenceActivity", { active: isPresenceActiveNow() });
}

function normalizeLoginValue(value) {
  return String(value || "").trim().slice(0, 20);
}

function normalizeHexColor(value, fallback = DEFAULT_OWN_BUBBLE_COLOR) {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate;
  }
  return fallback;
}

function normalizeOwnMessageSide(value, fallback = DEFAULT_OWN_MESSAGE_SIDE) {
  return String(value || "").toLowerCase() === "left" ? "left" : fallback;
}

function normalizeKnownColor(value) {
  const candidate = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : null;
}

function getDirectDialogVisualKey(login) {
  return normalizeLoginValue(login).toLowerCase();
}

function setDirectDialogVisual(partner, visual = {}) {
  const key = getDirectDialogVisualKey(partner);
  if (!key) return;
  const previous = directDialogVisuals.get(key) || {};
  const normalizedColor = normalizeKnownColor(visual.color);
  const normalizedAvatar =
    typeof visual.avatar === "string" && visual.avatar.trim() ? visual.avatar : null;
  const normalizedAvatarId =
    typeof visual.avatarId === "string" && visual.avatarId.trim()
      ? visual.avatarId.trim()
      : null;
  const normalizedAvatarOriginal =
    typeof visual.avatarOriginal === "string" && visual.avatarOriginal.trim()
      ? visual.avatarOriginal
      : normalizedAvatar;
  directDialogVisuals.set(key, {
    color: normalizedColor || previous.color || null,
    avatar: normalizedAvatar || previous.avatar || null,
    avatarId: normalizedAvatarId || previous.avatarId || null,
    avatarOriginal:
      normalizedAvatarOriginal ||
      previous.avatarOriginal ||
      normalizedAvatar ||
      previous.avatar ||
      null,
  });
}

function getDirectDialogVisual(partner) {
  const key = getDirectDialogVisualKey(partner);
  if (!key) return null;
  return directDialogVisuals.get(key) || null;
}

function normalizeChatRoom(room) {
  if (!room || typeof room !== "object") return null;
  const id = String(room.id || "").trim() || DEFAULT_CHAT_ROOM_ID;
  const title = String(room.title || "").trim() || DEFAULT_CHAT_ROOM_TITLE;
  const avatar = typeof room.avatar === "string" && room.avatar.trim() ? room.avatar : null;
  const avatarOriginal =
    typeof room.avatarOriginal === "string" && room.avatarOriginal.trim()
      ? room.avatarOriginal
      : avatar;
  const avatarId =
    !avatar && typeof room.avatarId === "string" && room.avatarId.trim()
      ? room.avatarId.trim()
      : null;
  return {
    id,
    title,
    avatar,
    avatarOriginal,
    avatarId,
  };
}

function getFallbackChatRoom() {
  const avatar = getAvatarById("cool") || getAvatarForLogin(DEFAULT_CHAT_ROOM_TITLE);
  return {
    id: DEFAULT_CHAT_ROOM_ID,
    title: DEFAULT_CHAT_ROOM_TITLE,
    avatar,
    avatarOriginal: avatar,
    avatarId: "cool",
  };
}

function getChatRoomsSafe() {
  return availableChatRooms.length > 0 ? availableChatRooms : [getFallbackChatRoom()];
}

function getCurrentChatRoom() {
  const rooms = getChatRoomsSafe();
  return (
    rooms.find((room) => String(room.id || "") === String(currentChatRoomId || "")) ||
    rooms[0] ||
    getFallbackChatRoom()
  );
}

function applyChatRooms(rooms) {
  const normalized = Array.isArray(rooms)
    ? rooms.map((room) => normalizeChatRoom(room)).filter(Boolean)
    : [];
  availableChatRooms = normalized.length > 0 ? normalized : [getFallbackChatRoom()];
  if (!availableChatRooms.some((room) => room.id === currentChatRoomId)) {
    currentChatRoomId = availableChatRooms[0].id;
  }
}

function getHiddenDialogsStorageKey(login = currentLogin) {
  const normalized = normalizeLoginValue(login).toLowerCase();
  return `${HIDDEN_DIRECT_DIALOGS_STORAGE_PREFIX}:${normalized}`;
}

function getVisibleDialogsStorageKey(login = currentLogin) {
  const normalized = normalizeLoginValue(login).toLowerCase();
  return `${VISIBLE_DIRECT_DIALOGS_STORAGE_PREFIX}:${normalized}`;
}

function getOwnBubbleColorStorageKey(login = currentLogin) {
  const normalized = normalizeLoginValue(login).toLowerCase();
  return `${OWN_BUBBLE_COLOR_STORAGE_PREFIX}:${normalized}`;
}

function getOwnMessageSideStorageKey(login = currentLogin) {
  const normalized = normalizeLoginValue(login).toLowerCase();
  return `${OWN_MESSAGE_SIDE_STORAGE_PREFIX}:${normalized}`;
}

function getNotesStorageKey(login = currentLogin) {
  const normalized = normalizeLoginValue(login).toLowerCase();
  return `${NOTES_STORAGE_PREFIX}:${normalized}`;
}

function normalizeStoredNoteEntry(entry, login) {
  const messageId = entry?.messageId ? String(entry.messageId) : `note-${Date.now()}-${messageIdCounter++}`;
  return {
    messageId,
    login: login || currentLogin || "Вы",
    color: currentColor || "#38bdf8",
    text: String(entry?.text || ""),
    timestamp: entry?.timestamp || new Date().toISOString(),
    editedAt: entry?.editedAt || null,
    avatarId: currentAvatarId,
    avatar: currentAvatar,
    avatarOriginal: currentAvatarOriginal,
    attachments: Array.isArray(entry?.attachments) ? entry.attachments : [],
    replyTo: null,
    readAll: false,
    local: true,
    chatType: "notes",
  };
}

function loadPersonalNotes(login = currentLogin) {
  const normalizedLogin = normalizeLoginValue(login);
  if (!normalizedLogin) {
    personalNotes = [];
    return;
  }
  try {
    const raw = localStorage.getItem(getNotesStorageKey(normalizedLogin));
    if (!raw) {
      personalNotes = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      personalNotes = [];
      return;
    }
    personalNotes = parsed.map((entry) => normalizeStoredNoteEntry(entry, normalizedLogin));
  } catch (_) {
    personalNotes = [];
  }
}

function persistPersonalNotes(login = currentLogin) {
  const normalizedLogin = normalizeLoginValue(login);
  if (!normalizedLogin) return;
  const payload = personalNotes.map((entry) => ({
    messageId: entry.messageId || "",
    text: entry.text || "",
    timestamp: entry.timestamp || new Date().toISOString(),
    editedAt: entry.editedAt || null,
    attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
  }));
  try {
    localStorage.setItem(getNotesStorageKey(normalizedLogin), JSON.stringify(payload));
  } catch (_) {
    // ignore localStorage errors
  }
}

function getNotesHistory() {
  return Array.isArray(personalNotes) ? personalNotes : [];
}

function deleteOwnNoteMessage(messageId) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return false;
  const beforeLength = personalNotes.length;
  personalNotes = personalNotes.filter(
    (entry) => String(entry?.messageId || "") !== normalizedMessageId
  );
  if (personalNotes.length === beforeLength) return false;
  persistPersonalNotes();
  if (replyTarget?.messageId && String(replyTarget.messageId) === normalizedMessageId) {
    hideReplyPreview();
  }
  renderActiveChat();
  return true;
}

function editOwnNoteMessage(messageId, nextText) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return false;
  const normalizedText = String(nextText || "").trim();
  const target = personalNotes.find(
    (entry) => String(entry?.messageId || "") === normalizedMessageId
  );
  if (!target) return false;
  const hasAttachments = Array.isArray(target.attachments) && target.attachments.length > 0;
  if (!normalizedText && !hasAttachments) {
    pushChatNotification({
      title: "Редактирование",
      body: "Нельзя оставить сообщение пустым.",
      autoDismissMs: 2200,
      autoDismissWhenVisible: true,
    });
    return false;
  }
  if (normalizedText === String(target.text || "").trim()) return false;
  target.text = normalizedText;
  target.editedAt = new Date().toISOString();
  persistPersonalNotes();
  if (replyTarget?.messageId && String(replyTarget.messageId) === normalizedMessageId) {
    replyTarget.text = normalizedText;
    showReplyPreview();
  }
  if (activeChat.type === "notes") {
    updateRenderedEditedMessage(target, { chatType: "notes" });
  }
  return true;
}

function readOwnBubbleColor(login = currentLogin) {
  if (!normalizeLoginValue(login)) return DEFAULT_OWN_BUBBLE_COLOR;
  try {
    return normalizeHexColor(
      localStorage.getItem(getOwnBubbleColorStorageKey(login)),
      DEFAULT_OWN_BUBBLE_COLOR
    );
  } catch (_) {
    return DEFAULT_OWN_BUBBLE_COLOR;
  }
}

function setOwnBubbleColor(color, { persist = true, login = currentLogin } = {}) {
  currentOwnBubbleColor = normalizeHexColor(color, DEFAULT_OWN_BUBBLE_COLOR);
  if (!persist || !normalizeLoginValue(login)) return;
  try {
    localStorage.setItem(
      getOwnBubbleColorStorageKey(login),
      currentOwnBubbleColor
    );
  } catch (_) {
    // ignore localStorage errors
  }
}

function readOwnMessageSide(login = currentLogin) {
  if (!normalizeLoginValue(login)) return DEFAULT_OWN_MESSAGE_SIDE;
  try {
    return normalizeOwnMessageSide(
      localStorage.getItem(getOwnMessageSideStorageKey(login)),
      DEFAULT_OWN_MESSAGE_SIDE
    );
  } catch (_) {
    return DEFAULT_OWN_MESSAGE_SIDE;
  }
}

function applyOwnMessageSideClass() {
  if (!messagesList) return;
  messagesList.classList.toggle("is-own-left", currentOwnMessageSide === "left");
}

function setOwnMessageSide(side, { persist = true, login = currentLogin } = {}) {
  currentOwnMessageSide = normalizeOwnMessageSide(side, DEFAULT_OWN_MESSAGE_SIDE);
  applyOwnMessageSideClass();
  if (!persist || !normalizeLoginValue(login)) return;
  try {
    localStorage.setItem(
      getOwnMessageSideStorageKey(login),
      currentOwnMessageSide
    );
  } catch (_) {
    // ignore localStorage errors
  }
}

function readSidebarWidth() {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return SIDEBAR_WIDTH_MIN;
    return parsed;
  } catch (_) {
    return SIDEBAR_WIDTH_MIN;
  }
}

function getSidebarMaxWidth() {
  const panelWidth = Number(chatScreen?.clientWidth || window.innerWidth || 0);
  const availableMax = panelWidth - SIDEBAR_MIN_CHAT_WIDTH;
  return Math.max(
    SIDEBAR_WIDTH_MIN,
    Math.min(SIDEBAR_WIDTH_MAX, Number.isFinite(availableMax) ? availableMax : SIDEBAR_WIDTH_MAX)
  );
}

function clampSidebarWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SIDEBAR_WIDTH_MIN;
  return Math.max(SIDEBAR_WIDTH_MIN, Math.min(getSidebarMaxWidth(), Math.round(numeric)));
}

function applySidebarWidth(width, { persist = true } = {}) {
  const clamped = clampSidebarWidth(width);
  currentSidebarWidth = clamped;
  if (chatScreen) {
    chatScreen.style.setProperty("--sidebar-width", `${clamped}px`);
  }
  if (sidebarResizer) {
    sidebarResizer.setAttribute("aria-valuemin", String(SIDEBAR_WIDTH_MIN));
    sidebarResizer.setAttribute("aria-valuemax", String(getSidebarMaxWidth()));
    sidebarResizer.setAttribute("aria-valuenow", String(clamped));
  }
  if (!persist) return;
  try {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
  } catch (_) {
    // ignore localStorage errors
  }
}

function stopSidebarResize({ persist = true } = {}) {
  if (!sidebarResizeState) return;
  sidebarResizeState = null;
  if (sidebarResizer) {
    sidebarResizer.classList.remove("is-dragging");
  }
  document.body.classList.remove("is-sidebar-resizing");
  if (persist) {
    applySidebarWidth(currentSidebarWidth, { persist: true });
  }
}

function initializeSidebarResize() {
  applySidebarWidth(readSidebarWidth(), { persist: false });
  if (!sidebarResizer || !chatScreen) return;

  sidebarResizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (window.matchMedia("(max-width: 720px)").matches) return;
    event.preventDefault();
    sidebarResizeState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: currentSidebarWidth,
    };
    sidebarResizer.classList.add("is-dragging");
    document.body.classList.add("is-sidebar-resizing");
    sidebarResizer.setPointerCapture?.(event.pointerId);
  });

  sidebarResizer.addEventListener("keydown", (event) => {
    if (window.matchMedia("(max-width: 720px)").matches) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      applySidebarWidth(currentSidebarWidth + 20, { persist: true });
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      applySidebarWidth(currentSidebarWidth - 20, { persist: true });
    }
  });

  window.addEventListener("pointermove", (event) => {
    if (!sidebarResizeState) return;
    if (event.pointerId !== sidebarResizeState.pointerId) return;
    const nextWidth = sidebarResizeState.startWidth + (event.clientX - sidebarResizeState.startX);
    applySidebarWidth(nextWidth, { persist: false });
  });

  const finalizeResize = (event) => {
    if (!sidebarResizeState) return;
    if (event.pointerId !== sidebarResizeState.pointerId) return;
    stopSidebarResize({ persist: true });
  };

  window.addEventListener("pointerup", finalizeResize);
  window.addEventListener("pointercancel", finalizeResize);
}

initializeSidebarResize();

function persistHiddenDirectDialogs() {
  if (!currentLogin) return;
  try {
    localStorage.setItem(
      getHiddenDialogsStorageKey(),
      JSON.stringify(Array.from(hiddenDirectDialogs))
    );
  } catch (_) {
    // игнорируем ошибки localStorage
  }
}

function persistVisibleDirectDialogs() {
  if (!currentLogin) return;
  try {
    localStorage.setItem(
      getVisibleDialogsStorageKey(),
      JSON.stringify(Array.from(visibleDirectDialogs))
    );
  } catch (_) {
    // ignore localStorage errors
  }
}

function loadHiddenDirectDialogs() {
  hiddenDirectDialogs.clear();
  if (!currentLogin) return;
  const raw = localStorage.getItem(getHiddenDialogsStorageKey());
  if (!raw) return;
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return;
    items.forEach((entry) => {
      const partner = normalizeLoginValue(entry);
      if (!partner || isSameLogin(partner, currentLogin)) return;
      hiddenDirectDialogs.add(partner);
    });
  } catch (_) {
    // ignore
  }
}

function loadVisibleDirectDialogs() {
  visibleDirectDialogs.clear();
  if (!currentLogin) return;
  const raw = localStorage.getItem(getVisibleDialogsStorageKey());
  if (!raw) return;
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return;
    items.forEach((entry) => {
      const partner = normalizeLoginValue(entry);
      if (!partner || isSameLogin(partner, currentLogin)) return;
      visibleDirectDialogs.add(partner);
    });
  } catch (_) {
    // ignore
  }
}

function addVisibleDirectDialog(partner) {
  const normalized = normalizeLoginValue(partner);
  if (!normalized || isSameLogin(normalized, currentLogin)) return;
  if (Array.from(visibleDirectDialogs).some((item) => isSameLogin(item, normalized))) return;
  visibleDirectDialogs.add(normalized);
  persistVisibleDirectDialogs();
}

function removeVisibleDirectDialog(partner) {
  const normalized = normalizeLoginValue(partner);
  if (!normalized) return;
  for (const item of visibleDirectDialogs) {
    if (isSameLogin(item, normalized)) {
      visibleDirectDialogs.delete(item);
    }
  }
  persistVisibleDirectDialogs();
}

function findHiddenDialogKey(partner) {
  const normalized = normalizeLoginValue(partner);
  if (!normalized) return null;
  for (const item of hiddenDirectDialogs) {
    if (isSameLogin(item, normalized)) {
      return item;
    }
  }
  return null;
}

function isDirectDialogHidden(partner) {
  return Boolean(findHiddenDialogKey(partner));
}

function hideDirectDialog(partner) {
  const normalized = normalizeLoginValue(partner);
  if (!normalized || isSameLogin(normalized, currentLogin)) return;
  if (findHiddenDialogKey(normalized)) return;
  hiddenDirectDialogs.add(normalized);
  removeVisibleDirectDialog(normalized);
  persistHiddenDirectDialogs();
  renderHiddenDialogsList();
}

function restoreHiddenDialog(partner, { openChat = false, makeVisible = true } = {}) {
  const key = findHiddenDialogKey(partner);
  if (!key) return false;
  hiddenDirectDialogs.delete(key);
  if (makeVisible) {
    addVisibleDirectDialog(key);
  }
  persistHiddenDirectDialogs();
  renderHiddenDialogsList();
  renderUserList();
  if (openChat) {
    setActiveChat("direct", key);
  }
  return true;
}

function getJoinPayload() {
  return {
    sessionToken: currentSessionToken || null,
    active: isPresenceActiveNow(),
  };
}

function persistAuthState() {
  if (!currentLogin || !currentSessionToken) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  const payload = {
    login: currentLogin,
    sessionToken: currentSessionToken,
    color: currentColor || "#38bdf8",
    avatarId: currentAvatarId || null,
    avatar: currentAvatar || null,
    avatarOriginal: currentAvatarOriginal || null,
  };
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // игнорируем ошибки localStorage (например, quota exceeded)
  }
}

function readAuthState() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const login = normalizeLoginValue(data.login);
    const sessionToken =
      typeof data.sessionToken === "string" && data.sessionToken.trim()
        ? data.sessionToken.trim()
        : "";
    if (!login || !sessionToken) return null;
    const color = String(data.color || "#38bdf8").trim() || "#38bdf8";
    const avatar = typeof data.avatar === "string" && data.avatar.trim() ? data.avatar : null;
    const avatarOriginal =
      typeof data.avatarOriginal === "string" && data.avatarOriginal.trim()
        ? data.avatarOriginal
        : avatar;
    const avatarId =
      !avatar && typeof data.avatarId === "string" && data.avatarId.trim()
        ? data.avatarId.trim()
        : null;
    return { login, sessionToken, color, avatarId, avatar, avatarOriginal };
  } catch (_) {
    return null;
  }
}

function applyAuthToSession(authState) {
  currentLogin = authState.login;
  currentSessionToken = authState.sessionToken || null;
  currentColor = authState.color || "#38bdf8";
  currentAvatar = authState.avatar || null;
  currentAvatarOriginal = authState.avatarOriginal || authState.avatar || null;
  currentAvatarId = authState.avatar ? null : authState.avatarId || avatarCatalog[0]?.id || null;
  currentOwnBubbleColor = readOwnBubbleColor(currentLogin);
  currentOwnMessageSide = readOwnMessageSide(currentLogin);
  applyOwnMessageSideClass();
  loadHiddenDirectDialogs();
  loadVisibleDirectDialogs();
  loadPersonalNotes(currentLogin);
}

function applyAuthToLoginForm(authState) {
  if (loginInput) {
    loginInput.value = authState.login;
  }
  if (registerLoginInput) {
    registerLoginInput.value = authState.login;
  }
  if (colorInput) {
    colorInput.value = authState.color || "#38bdf8";
  }
  if (authState.avatar) {
    updateCustomAvatarPreview(authState.avatar);
    customAvatarOriginal = authState.avatarOriginal || authState.avatar;
    return;
  }
  selectedAvatarId = authState.avatarId || avatarCatalog[0]?.id || null;
  clearCustomAvatar();
  if (avatarOptionsEl && selectedAvatarId) {
    avatarOptionsEl.querySelectorAll(".avatar-option").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.avatarId === selectedAvatarId);
    });
  }
}

const authFeedbackByScope = {
  login: loginFeedback,
  register: registerFeedback,
  verify: verifyFeedback,
  reset: resetFeedback,
};

function clearAuthFeedback(scope) {
  const target = authFeedbackByScope[scope];
  if (!target) return;
  target.textContent = "";
  target.classList.remove("is-error", "is-success", "is-info");
  target.classList.add("hidden");
}

function clearAllAuthFeedback() {
  clearAuthFeedback("login");
  clearAuthFeedback("register");
  clearAuthFeedback("verify");
  clearAuthFeedback("reset");
}

function showAuthFeedback(scope, message, tone = "error") {
  const target = authFeedbackByScope[scope];
  if (!target) return;
  target.textContent = message || "";
  target.classList.remove("is-error", "is-success", "is-info", "hidden");
  if (tone === "success") {
    target.classList.add("is-success");
  } else if (tone === "info") {
    target.classList.add("is-info");
  } else {
    target.classList.add("is-error");
  }
}

function showAuthError(message, scope = "login") {
  showAuthFeedback(scope, message || "Ошибка авторизации.", "error");
}

function updateResetSendCodeAvailability() {
  if (!resetSendCodeButton) return;
  const hasNewPassword = String(resetPasswordInput?.value || "").trim().length > 0;
  const hasConfirmPassword = String(resetPasswordConfirmInput?.value || "").trim().length > 0;
  const shouldDisable = hasNewPassword && hasConfirmPassword;
  resetSendCodeButton.disabled = shouldDisable;
  if (resetSendCodeHint) {
    resetSendCodeHint.classList.toggle("hidden", !shouldDisable);
  }
  if (shouldDisable) {
    resetSendCodeButton.title =
      "Очистите оба поля нового пароля, чтобы снова отправить код.";
  } else {
    resetSendCodeButton.removeAttribute("title");
  }
}

function validateStrongPasswordClient(password) {
  const value = String(password || "");
  if (value.length < 8) return "Минимум 8 символов.";
  if (!/[A-Za-zА-Яа-яЁё]/.test(value)) return "Добавьте хотя бы одну букву.";
  if (!/\d/.test(value)) return "Добавьте хотя бы одну цифру.";
  return "";
}

function emitWithAck(eventName, payload, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, message: "Сервер не ответил вовремя. Повторите попытку." });
    }, timeoutMs);

    socket.emit(eventName, payload, (response) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!response || typeof response !== "object") {
        resolve({ ok: false, message: "Некорректный ответ сервера." });
        return;
      }
      resolve(response);
    });
  });
}

function getAvatarOriginalCacheKey(login) {
  return normalizeLoginValue(login).toLowerCase();
}

function clearAvatarOriginalCache() {
  avatarOriginalCache.clear();
  avatarOriginalRequests.clear();
}

async function fetchAvatarOriginalOnDemand(login) {
  const normalizedLogin = normalizeLoginValue(login);
  const key = getAvatarOriginalCacheKey(normalizedLogin);
  if (!key || !socket?.connected || !currentLogin) return null;
  const cached = avatarOriginalCache.get(key);
  if (cached) {
    return cached;
  }
  if (avatarOriginalRequests.has(key)) {
    return avatarOriginalRequests.get(key);
  }

  const request = (async () => {
    try {
      const response = await emitWithAck(
        "getUserAvatarOriginal",
        { login: normalizedLogin },
        16000
      );
      const avatarOriginal =
        typeof response?.avatarOriginal === "string" && response.avatarOriginal.trim()
          ? response.avatarOriginal
          : null;
      if (response?.ok && avatarOriginal) {
        avatarOriginalCache.set(key, avatarOriginal);
      }
      return avatarOriginal;
    } catch (error) {
      return null;
    } finally {
      avatarOriginalRequests.delete(key);
    }
  })();

  avatarOriginalRequests.set(key, request);
  return request;
}

async function openAvatarLightboxByLogin(login, fallbackSrc, alt) {
  const fallback =
    typeof fallbackSrc === "string" && fallbackSrc.trim() ? fallbackSrc : null;
  if (!fallback) return;

  openLightbox(fallback, alt);
  const requestId = avatarLightboxRequestId;
  const avatarOriginal = await fetchAvatarOriginalOnDemand(login);
  if (!avatarOriginal || avatarOriginal === fallback) return;
  if (!lightbox || !lightboxImage || lightbox.classList.contains("hidden")) return;
  if (requestId !== avatarLightboxRequestId) return;
  lightboxImage.src = avatarOriginal;
}

function applyServerUserToSession(user, { sessionToken = null } = {}) {
  if (sessionToken) {
    currentSessionToken = sessionToken;
  }
  currentLogin = normalizeLoginValue(user?.login || currentLogin);
  currentColor = user?.color || "#38bdf8";
  currentAvatar = user?.avatar || null;
  currentAvatarOriginal = user?.avatarOriginal || user?.avatar || null;
  currentAvatarId = currentAvatar ? null : user?.avatarId || avatarCatalog[0]?.id || null;
  currentOwnBubbleColor = readOwnBubbleColor(currentLogin);
  currentOwnMessageSide = readOwnMessageSide(currentLogin);
  applyOwnMessageSideClass();
  loadHiddenDirectDialogs();
  loadVisibleDirectDialogs();
  loadPersonalNotes(currentLogin);

  applyAuthToLoginForm({
    login: currentLogin || "",
    color: currentColor,
    avatarId: currentAvatarId,
    avatar: currentAvatar,
    avatarOriginal: currentAvatarOriginal,
  });
  updateCurrentUserAvatarInLoadedHistories();
  persistAuthState();
}

function readActiveChatState() {
  const raw = localStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    if (data.type === "direct") {
      const partner = String(data.partner || "").trim();
      if (partner) {
        return { type: "direct", partner };
      }
    }
    if (data.type === "public") {
      return { type: "public", partner: null };
    }
    if (data.type === "notes") {
      return { type: "notes", partner: null };
    }
    return { type: "home", partner: null };
  } catch (_) {
    return null;
  }
}

function persistActiveChatState() {
  const payload = activeChat.type === "direct" && activeChat.partner
    ? { type: "direct", partner: activeChat.partner }
    : activeChat.type === "public"
      ? { type: "public", partner: null }
      : activeChat.type === "notes"
        ? { type: "notes", partner: null }
      : { type: "home", partner: null };
  localStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, JSON.stringify(payload));
}

function joinCurrentUserIfNeeded(force = false) {
  if (!currentLogin || !currentSessionToken || !socket.connected) return;
  const signature = `${socket.id || ""}:${normalizeLoginValue(currentLogin).toLowerCase()}:${currentSessionToken.slice(0, 10)}`;
  if (!force && lastJoinSignature === signature) return;
  directUnreadNoticeShown = false;
  socket.emit("join", getJoinPayload(), (response) => {
    if (!response?.ok) {
      lastJoinSignature = "";
      if (response?.reason === "invalid_session") {
        performLogout({ skipServer: true });
        showAuthError(response?.message || "Сессия истекла. Войдите заново.", "login");
      }
      return;
    }
    if (response?.user) {
      applyServerUserToSession(response.user);
    }
    isPublicChatExcluded = Boolean(response?.publicChatExcluded);
    socket.emit("loadContacts", {}, (contactsResponse) => {
      if (!contactsResponse?.ok) return;
      applyContacts(contactsResponse.items);
      renderUserList();
    });
    lastJoinSignature = signature;
    syncPresenceActivity();
  });
}

function openChatScreen({ restoreLastChat = false } = {}) {
  if (loginScreen) {
    loginScreen.classList.add("hidden");
  }
  if (chatScreen) {
    chatScreen.classList.remove("hidden");
  }
  setChatActivity(!document.hidden);
  setActiveChat("home");
}

function performLogout({ skipServer = false } = {}) {
  const logoutToken = currentSessionToken;
  if (!skipServer && logoutToken && socket.connected) {
    socket.emit("logout", { sessionToken: logoutToken });
  }
  currentLogin = null;
  currentSessionToken = null;
  currentColor = null;
  currentAvatarId = null;
  currentAvatar = null;
  currentAvatarOriginal = null;
  currentOwnBubbleColor = DEFAULT_OWN_BUBBLE_COLOR;
  currentOwnMessageSide = DEFAULT_OWN_MESSAGE_SIDE;
  mentionTarget = null;
  lastJoinSignature = "";
  isPublicChatExcluded = false;

  publicHistory.length = 0;
  publicHistoryState.nextCursor = null;
  publicHistoryState.total = 0;
  publicHistoryState.isLoading = false;
  publicHistoryState.isInitialized = false;
  directHistories.clear();
  directUnreadCounts.clear();
  directHistoryState.clear();
  directDialogVisuals.clear();
  clearAvatarOriginalCache();
  avatarLightboxRequestId = 0;
  profileAvatarViewRequestId = 0;
  hiddenDirectDialogs.clear();
  visibleDirectDialogs.clear();
  directUnreadNoticeShown = false;
  publicUnreadCount = 0;
  personalNotes = [];
  lastSentMessageAt = 0;
  lastUserList = [];
  contactEntries = [];
  availableChatRooms = [];
  currentChatRoomId = DEFAULT_CHAT_ROOM_ID;
  contactSearchState.query = "";
  contactSearchState.nextCursor = 0;
  contactSearchState.total = 0;
  contactSearchState.loading = false;
  contactSearchState.items = [];
  contactSearchState.requestId = 0;
  chatRoomAvatarDraft = null;
  chatRoomAvatarOriginalDraft = null;
  chatRoomAvatarIdDraft = null;
  chatSettingsSavePending = false;
  if (contactSearchDebounceTimer) {
    clearTimeout(contactSearchDebounceTimer);
    contactSearchDebounceTimer = null;
  }

  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);

  if (messagesList) {
    messagesList.innerHTML = "";
  }
  if (usersList) {
    usersList.innerHTML = "";
  }
  if (onlineUsersList) {
    onlineUsersList.innerHTML = "";
  }
  if (directList) {
    directList.innerHTML = "";
  }
  if (chatRoomsList) {
    chatRoomsList.innerHTML = "";
  }
  if (selfList) {
    selfList.innerHTML = "";
  }
  if (contactSearchResults) {
    contactSearchResults.innerHTML = "";
  }

  clearUnreadMessages();
  closeDmPopup();
  hideReplyPreview();
  cancelMessageEdit({ clearInput: true });
  closeProfileCard();
  closeSelfProfileModal();
  closeProfileAvatarView();
  closeContactSearchModal();
  closeChatSettingsModal();
  closeMessageDeleteConfirmModal();
  closeMemberDeleteConfirmModal();
  hideEmojiPanel();
  closeReactionPicker();

  clearCustomAvatar();
  selectedAvatarId = avatarCatalog[0]?.id || null;
  if (avatarOptionsEl && selectedAvatarId) {
    avatarOptionsEl.querySelectorAll(".avatar-option").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.avatarId === selectedAvatarId);
    });
  }

  if (loginInput) {
    loginInput.value = "";
  }
  if (loginPasswordInput) {
    loginPasswordInput.value = "";
  }
  if (registerLoginInput) {
    registerLoginInput.value = "";
  }
  if (registerEmailInput) {
    registerEmailInput.value = "";
  }
  if (registerPasswordInput) {
    registerPasswordInput.value = "";
  }
  if (registerPasswordConfirmInput) {
    registerPasswordConfirmInput.value = "";
  }
  if (verifyLoginInput) {
    verifyLoginInput.value = "";
  }
  if (verifyCodeInput) {
    verifyCodeInput.value = "";
  }
  if (resetEmailInput) {
    resetEmailInput.value = "";
  }
  if (resetCodeInput) {
    resetCodeInput.value = "";
  }
  if (resetPasswordInput) {
    resetPasswordInput.value = "";
  }
  if (resetPasswordConfirmInput) {
    resetPasswordConfirmInput.value = "";
  }
  if (selfProfileOwnMessageSideSelect) {
    selfProfileOwnMessageSideSelect.value = DEFAULT_OWN_MESSAGE_SIDE;
  }
  clearAllAuthFeedback();
  applyOwnMessageSideClass();
  updateResetSendCodeAvailability();
  if (colorInput) {
    colorInput.value = "#38bdf8";
  }
  if (registerForm) {
    registerForm.classList.add("hidden");
  }
  if (registerToggle) {
    registerToggle.textContent = "Регистрация";
  }
  if (verifyForm) {
    verifyForm.classList.add("hidden");
  }
  if (verifyToggle) {
    verifyToggle.textContent = "Подтвердить почту";
  }
  if (resetForm) {
    resetForm.classList.add("hidden");
  }
  if (resetToggle) {
    resetToggle.textContent = "Восстановить пароль";
  }
  if (messageInput) {
    messageInput.value = "";
    autoSizeTextarea();
  }

  activeChat = { type: "home", partner: null };
  updatePublicShortcutVisibility();
  updateChatHeader();
  updateMuteToggle();

  if (chatScreen) {
    chatScreen.classList.add("hidden");
  }
  if (loginScreen) {
    loginScreen.classList.remove("hidden");
  }
  if (loginInput) {
    loginInput.focus();
  }

  if (socket.connected) {
    socket.disconnect();
  }
}

const publicHistory = [];
const publicHistoryState = {
  nextCursor: null,
  total: 0,
  isLoading: false,
  isInitialized: false,
};
const directHistories = new Map();
const directUnreadCounts = new Map();
const directHistoryState = new Map();
const directDialogVisuals = new Map();

const FAKE_BOT_NAMES = [
  "Аня", "Кирилл", "Сергей", "Марина", "Игорь",
  "Лена", "Дима", "Юля", "Павел", "Оля",
  "Никита", "Света", "Костя", "Вика", "Рома",
  "Надя", "Антон", "Катя", "Женя", "Маша"
];

if (lightbox && lightbox.parentElement !== document.body) {
  document.body.appendChild(lightbox);
}

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
let avatarCropTarget = "login";

function getResolvedSelfAvatarPreview() {
  if (selfProfileAvatarDraft) {
    return selfProfileAvatarDraft;
  }
  return (
    currentAvatar ||
    getAvatarById(selfProfileAvatarIdDraft || currentAvatarId) ||
    getAvatarForLogin(currentLogin || "guest")
  );
}

function syncSelfProfileAvatarPreview() {
  if (!selfProfileAvatarPreview) return;
  const preview = getResolvedSelfAvatarPreview();
  selfProfileAvatarPreview.src = preview;
  selfProfileAvatarPreview.dataset.full = selfProfileAvatarOriginalDraft || preview;
}

function getResolvedChatRoomAvatarPreview() {
  if (chatRoomAvatarDraft) {
    return chatRoomAvatarDraft;
  }
  const room = getCurrentChatRoom();
  return (
    room.avatar ||
    getAvatarById(chatRoomAvatarIdDraft || room.avatarId) ||
    getAvatarForLogin(room.title || DEFAULT_CHAT_ROOM_TITLE)
  );
}

function syncChatSettingsAvatarPreview() {
  if (!chatSettingsAvatarPreview) return;
  const preview = getResolvedChatRoomAvatarPreview();
  chatSettingsAvatarPreview.src = preview;
  chatSettingsAvatarPreview.dataset.full = chatRoomAvatarOriginalDraft || preview;
}

function updateCurrentUserAvatarInLoadedHistories() {
  if (!currentLogin) return;

  const applyToEntry = (entry) => {
    if (!entry || !isSameLogin(entry.login, currentLogin)) return;
    entry.avatar = currentAvatar || null;
    entry.avatarOriginal = currentAvatarOriginal || currentAvatar || null;
    entry.avatarId = currentAvatar ? null : currentAvatarId || null;
  };

  publicHistory.forEach((entry) => applyToEntry(entry));
  directHistories.forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((entry) => applyToEntry(entry));
  });
}

function renderSelfProfileAvatarOptions() {
  if (!selfProfileAvatarOptions) return;
  selfProfileAvatarOptions.innerHTML = "";

  avatarCatalog.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "avatar-option";
    button.dataset.avatarId = option.id;
    button.classList.toggle(
      "is-selected",
      !selfProfileAvatarDraft && option.id === selfProfileAvatarIdDraft
    );

    const img = document.createElement("img");
    img.src = option.uri;
    img.alt = option.id;
    button.appendChild(img);

    button.addEventListener("click", () => {
      selfProfileAvatarDraft = null;
      selfProfileAvatarOriginalDraft = null;
      selfProfileAvatarIdDraft = option.id;
      renderSelfProfileAvatarOptions();
      syncSelfProfileAvatarPreview();
    });

    selfProfileAvatarOptions.appendChild(button);
  });
}

function renderHiddenDialogsList() {
  if (!hiddenDialogsList) return;
  hiddenDialogsList.innerHTML = "";

  const items = Array.from(hiddenDirectDialogs).sort((a, b) =>
    a.localeCompare(b, "ru", { sensitivity: "base" })
  );
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hidden-dialog-empty";
    empty.textContent = "Нет скрытых диалогов";
    hiddenDialogsList.appendChild(empty);
    return;
  }

  items.forEach((partner) => {
    const row = document.createElement("li");
    row.className = "hidden-dialog-item";

    const nameEl = document.createElement("span");
    nameEl.textContent = partner;
    row.appendChild(nameEl);

    const restoreBtn = document.createElement("button");
    restoreBtn.type = "button";
    restoreBtn.textContent = "Просмотреть";
    restoreBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      restoreHiddenDialog(partner, { openChat: true });
      closeSelfProfileModal();
    });
    row.appendChild(restoreBtn);

    row.addEventListener("click", () => {
      restoreHiddenDialog(partner, { openChat: true });
      closeSelfProfileModal();
    });

    hiddenDialogsList.appendChild(row);
  });
}

function closeSelfProfileModal() {
  if (!selfProfileModal) return;
  selfProfileModal.classList.add("hidden");
  if (selfProfileCurrentPasswordInput) selfProfileCurrentPasswordInput.value = "";
  if (selfProfileNewPasswordInput) selfProfileNewPasswordInput.value = "";
  if (selfProfileConfirmPasswordInput) selfProfileConfirmPasswordInput.value = "";
}

function openSelfProfileModal() {
  if (!selfProfileModal || !currentLogin) return;
  closeProfileCard();
  loadHiddenDirectDialogs();
  selfProfileAvatarDraft = currentAvatar || null;
  selfProfileAvatarOriginalDraft = currentAvatarOriginal || currentAvatar || null;
  selfProfileAvatarIdDraft = currentAvatar ? null : currentAvatarId || avatarCatalog[0]?.id || null;
  if (selfProfileLoginInput) {
    selfProfileLoginInput.value = currentLogin;
  }
  if (selfProfileColorInput) {
    selfProfileColorInput.value = currentColor || "#38bdf8";
  }
  if (selfProfileBubbleColorInput) {
    selfProfileBubbleColorInput.value = normalizeHexColor(
      currentOwnBubbleColor,
      DEFAULT_OWN_BUBBLE_COLOR
    );
  }
  if (selfProfileOwnMessageSideSelect) {
    selfProfileOwnMessageSideSelect.value = normalizeOwnMessageSide(
      currentOwnMessageSide,
      DEFAULT_OWN_MESSAGE_SIDE
    );
  }
  if (selfProfileCurrentPasswordInput) selfProfileCurrentPasswordInput.value = "";
  if (selfProfileNewPasswordInput) selfProfileNewPasswordInput.value = "";
  if (selfProfileConfirmPasswordInput) selfProfileConfirmPasswordInput.value = "";
  renderSelfProfileAvatarOptions();
  syncSelfProfileAvatarPreview();
  renderHiddenDialogsList();
  selfProfileModal.classList.remove("hidden");
}

async function applySelfProfileChanges() {
  if (!currentLogin || !currentSessionToken) return;
  const nextLogin = normalizeLoginValue(selfProfileLoginInput?.value);
  if (!nextLogin) {
    pushChatNotification({
      title: "Профиль",
      body: "Ник не может быть пустым.",
      autoDismissMs: 2200,
      autoDismissWhenVisible: true,
    });
    return;
  }

  const previousLogin = currentLogin;
  const nextOwnBubbleColor = normalizeHexColor(
    selfProfileBubbleColorInput?.value,
    currentOwnBubbleColor || DEFAULT_OWN_BUBBLE_COLOR
  );
  const nextOwnMessageSide = normalizeOwnMessageSide(
    selfProfileOwnMessageSideSelect?.value,
    currentOwnMessageSide || DEFAULT_OWN_MESSAGE_SIDE
  );
  setOwnBubbleColor(nextOwnBubbleColor, { persist: true, login: currentLogin });
  setOwnMessageSide(nextOwnMessageSide, { persist: true, login: currentLogin });
  renderActiveChat();
  const nextAvatar = selfProfileAvatarDraft || null;
  const nextAvatarOriginal = nextAvatar
    ? selfProfileAvatarOriginalDraft || nextAvatar
    : null;
  const nextAvatarId = nextAvatar
    ? null
    : selfProfileAvatarIdDraft || avatarCatalog[0]?.id || null;

  const response = await emitWithAck("updateProfile", {
    sessionToken: currentSessionToken,
    login: nextLogin,
    color: selfProfileColorInput?.value || currentColor || "#38bdf8",
    avatarId: nextAvatarId,
    avatar: nextAvatar,
    avatarOriginal: nextAvatarOriginal,
  });

  if (!response?.ok) {
    if (response?.reason === "invalid_session") {
      performLogout({ skipServer: true });
      showAuthError(response?.message || "Сессия истекла. Войдите заново.", "login");
      return;
    }
    pushChatNotification({
      title: "Профиль",
      body: response?.message || "Не удалось обновить профиль.",
      autoDismissMs: 2600,
      autoDismissWhenVisible: true,
    });
    return;
  }

  applyServerUserToSession(response.user);

  if (!isSameLogin(previousLogin, currentLogin)) {
    localStorage.removeItem(getHiddenDialogsStorageKey(previousLogin));
    localStorage.removeItem(getVisibleDialogsStorageKey(previousLogin));
    localStorage.removeItem(getOwnBubbleColorStorageKey(previousLogin));
    localStorage.removeItem(getOwnMessageSideStorageKey(previousLogin));
  }
  setOwnBubbleColor(nextOwnBubbleColor, { persist: true, login: currentLogin });
  setOwnMessageSide(nextOwnMessageSide, { persist: true, login: currentLogin });
  persistHiddenDirectDialogs();
  persistVisibleDirectDialogs();
  updateCurrentUserAvatarInLoadedHistories();
  renderUserList();
  renderActiveChat();
  closeSelfProfileModal();
}

async function changeSelfPassword() {
  if (!currentSessionToken) return;
  const currentPassword = String(selfProfileCurrentPasswordInput?.value || "").trim();
  const newPassword = String(selfProfileNewPasswordInput?.value || "").trim();
  const confirmPassword = String(selfProfileConfirmPasswordInput?.value || "").trim();

  if (!currentPassword || !newPassword || !confirmPassword) {
    pushChatNotification({
      title: "Пароль",
      body: "Заполните все поля для смены пароля.",
      autoDismissMs: 2400,
      autoDismissWhenVisible: true,
    });
    return;
  }
  const passwordError = validateStrongPasswordClient(newPassword);
  if (passwordError) {
    pushChatNotification({
      title: "Пароль",
      body: `Пароль слишком слабый: ${passwordError}`,
      autoDismissMs: 2400,
      autoDismissWhenVisible: true,
    });
    return;
  }
  if (newPassword !== confirmPassword) {
    pushChatNotification({
      title: "Пароль",
      body: "Подтверждение нового пароля не совпадает.",
      autoDismissMs: 2400,
      autoDismissWhenVisible: true,
    });
    return;
  }

  const response = await emitWithAck("changePassword", {
    sessionToken: currentSessionToken,
    currentPassword,
    newPassword,
  });

  if (!response?.ok) {
    if (response?.reason === "invalid_session") {
      performLogout({ skipServer: true });
      showAuthError(response?.message || "Сессия истекла. Войдите заново.", "login");
      return;
    }
    pushChatNotification({
      title: "Пароль",
      body: response?.message || "Не удалось сменить пароль.",
      autoDismissMs: 2600,
      autoDismissWhenVisible: true,
    });
    return;
  }

  if (selfProfileCurrentPasswordInput) selfProfileCurrentPasswordInput.value = "";
  if (selfProfileNewPasswordInput) selfProfileNewPasswordInput.value = "";
  if (selfProfileConfirmPasswordInput) selfProfileConfirmPasswordInput.value = "";
  pushChatNotification({
    title: "Пароль",
    body: "Пароль успешно изменён.",
    autoDismissMs: 2200,
    autoDismissWhenVisible: true,
  });
}

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

function updateComposerModeUI() {
  const isEditing = Boolean(editTarget);
  if (messageForm) {
    messageForm.classList.toggle("is-editing", isEditing);
  }
  if (sendButton) {
    sendButton.textContent = isEditing ? "✓" : "➤";
    sendButton.title = isEditing ? "Сохранить изменение" : "Отправить";
    sendButton.classList.toggle("is-save-mode", isEditing);
  }
  if (messageInput) {
    messageInput.placeholder = isEditing
      ? "Редактируйте сообщение..."
      : DEFAULT_MESSAGE_PLACEHOLDER;
  }
}

function showEditPreview() {
  if (!editPreview || !editPreviewTextEl || !editTarget) return;
  if (editPreviewAuthorEl) {
    editPreviewAuthorEl.textContent = "Редактирование сообщения";
  }
  const previewText = String(editTarget.originalText || "").trim();
  editPreviewTextEl.textContent = previewText
    ? truncateText(previewText, 120)
    : editTarget.hasAttachments
      ? "Сообщение с вложением"
      : "Без текста";
  editPreview.style.setProperty("--reply-accent", "var(--accent)");
  editPreview.classList.remove("hidden");
  updateComposerModeUI();
}

function hideEditPreview() {
  editTarget = null;
  if (editPreview) {
    editPreview.classList.add("hidden");
  }
  updateComposerModeUI();
}

function cancelMessageEdit({ clearInput = false } = {}) {
  hideEditPreview();
  mentionTarget = null;
  if (clearInput && messageInput) {
    messageInput.value = "";
    resetComposerLinkPreview();
  } else {
    scheduleComposerLinkPreviewUpdate({ immediate: true });
  }
  autoSizeTextarea();
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

function applyReactionPayload(messageId, reactions, myReaction) {
  ensureReactionState(messageId);
  const reactionCounts = messageReactions.get(messageId);
  const selected = messageReactionSelections.get(messageId);
  if (!reactionCounts || !selected) return;

  reactionCounts.clear();
  if (reactions && typeof reactions === "object") {
    Object.entries(reactions).forEach(([emoji, count]) => {
      const nextCount = Number(count);
      if (!emoji || !Number.isFinite(nextCount) || nextCount <= 0) return;
      reactionCounts.set(emoji, Math.floor(nextCount));
    });
  }

  if (typeof myReaction === "string") {
    selected.clear();
    if (myReaction && reactionCounts.has(myReaction)) {
      selected.add(myReaction);
    }
  } else {
    selected.forEach((emoji) => {
      if (!reactionCounts.has(emoji)) {
        selected.delete(emoji);
      }
    });
  }

  updateReactionDisplay(messageId);
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

async function toggleReaction(messageId, emoji) {
  const messageEntry = messageElements.get(messageId);
  const chatType = messageEntry?.chatType || "public";
  if (!messageId || !emoji) return;
  if (chatType === "notes") return;
  if (reactionRequestInFlight.has(messageId)) return;
  reactionRequestInFlight.add(messageId);
  try {
    const response = await emitWithAck("messageReactionToggle", { messageId, emoji });
    if (!response?.ok) return;
    applyReactionPayload(messageId, response.reactions, response.myReaction ?? null);
  } finally {
    reactionRequestInFlight.delete(messageId);
  }
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
    <button type="button" class="dm-action dm-action--photo">Фото</button>
    <button type="button" class="dm-action dm-action--private">Личное сообщение</button>
    <button type="button" class="dm-action dm-action--public">Публичное сообщение</button>
  `;
  const photoButton = popup.querySelector(".dm-action--photo");
  if (photoButton) {
    photoButton.addEventListener("click", async () => {
      const login = popup.dataset.login || "";
      const photo = popup.dataset.photo || "";
      closeDmPopup();
      if (photo) {
        if (login) {
          await openAvatarLightboxByLogin(login, photo, `Аватар ${login}`);
        } else {
          openLightbox(photo, "Фото");
        }
      }
    });
  }
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
  const avatarFull = anchorEl?.dataset?.full || anchorEl?.getAttribute?.("src") || "";
  if (!dmPopup || !anchorEl || !login) return;
  const title = dmPopup.querySelector(".dm-title");
  const privateButton = dmPopup.querySelector(".dm-action--private");
  const publicButton = dmPopup.querySelector(".dm-action--public");
  if (title) {
    title.textContent = login;
  }
  dmPopup.dataset.login = login;
  dmPopup.dataset.photo = avatarFull;
  const isSelf = isSameLogin(login, currentLogin);
  if (privateButton) privateButton.classList.toggle("hidden", isSelf);
  if (publicButton) publicButton.classList.toggle("hidden", isSelf);
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
  dmPopup.dataset.photo = "";
}

function setSidebarSectionCollapsed(key, collapsed) {
  const isCollapsed = Boolean(collapsed);
  sectionCollapsedState[key] = isCollapsed;

  const map = {
    contacts: {
      section: contactsSection,
      list: usersList,
      toggle: contactsToggle,
    },
    dialogs: {
      section: directDialogsSection,
      list: directList,
      toggle: dialogsToggle,
    },
    online: {
      section: onlineUsersSection,
      list: onlineUsersList,
      toggle: onlineToggle,
    },
  };
  const target = map[key];
  if (!target) return;

  if (target.section) {
    target.section.classList.toggle("is-collapsed", isCollapsed);
  }
  if (target.list) {
    target.list.classList.toggle("hidden", isCollapsed);
  }
  if (target.toggle) {
    target.toggle.classList.toggle("is-collapsed", isCollapsed);
    target.toggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
  }
}

function toggleSidebarSection(key) {
  setSidebarSectionCollapsed(key, !sectionCollapsedState[key]);
}

function navigateFromHomeCard(key, targetId) {
  if (key === "contacts") {
    setSidebarSectionCollapsed("contacts", false);
  }
  const target = document.getElementById(targetId);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updatePublicShortcutVisibility() {
  const showDialogsSection = activeChat.type === "public";
  const showOnlineSection = activeChat.type === "public";
  if (directDialogsSection) {
    directDialogsSection.classList.toggle("hidden", !showDialogsSection);
  }
  if (onlineUsersSection) {
    onlineUsersSection.classList.toggle("hidden", !showOnlineSection);
  }
  if (botsToggleLabel) {
    botsToggleLabel.classList.toggle("hidden", true);
  }
  if (publicChatShortcut) {
    publicChatShortcut.classList.add("hidden");
  }
  setSidebarSectionCollapsed("contacts", sectionCollapsedState.contacts);
  setSidebarSectionCollapsed("dialogs", sectionCollapsedState.dialogs);
  setSidebarSectionCollapsed("online", sectionCollapsedState.online);
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
    profileAvatar.dataset.login = name;
    profileAvatar.dataset.full = resolvedAvatarOriginal;
    profileAvatar.style.setProperty("--profile-accent", color || "var(--accent)");
  }
  if (profileName) {
    profileName.textContent = name;
    profileName.style.color = color || "var(--text)";
  }

  profileModal.classList.remove("hidden");
}

async function openProfileAvatarView() {
  if (!profileAvatar || !profileAvatarView || !profileAvatarFull) return;
  const fallbackSrc = profileAvatar.dataset.full || profileAvatar.getAttribute("src");
  if (!fallbackSrc) return;
  profileAvatarFull.src = fallbackSrc;
  profileAvatarView.classList.remove("hidden");

  const login = profileModal?.dataset?.login || profileAvatar.dataset.login || "";
  if (!login) return;
  const requestId = ++profileAvatarViewRequestId;
  const avatarOriginal = await fetchAvatarOriginalOnDemand(login);
  if (!avatarOriginal) return;
  if (!profileAvatarView || profileAvatarView.classList.contains("hidden")) return;
  if (requestId !== profileAvatarViewRequestId) return;
  profileAvatarFull.src = avatarOriginal;
}

function closeProfileAvatarView() {
  if (!profileAvatarView || !profileAvatarFull) return;
  profileAvatarViewRequestId += 1;
  profileAvatarView.classList.add("hidden");
  profileAvatarFull.src = "";
}

function normalizeContactEntry(entry) {
  const login = normalizeLoginValue(entry?.login);
  if (!login || isSameLogin(login, currentLogin)) return null;
  const color = normalizeKnownColor(entry?.color) || getColorForLogin(login);
  const avatar = typeof entry?.avatar === "string" && entry.avatar.trim() ? entry.avatar : null;
  const avatarId =
    !avatar && typeof entry?.avatarId === "string" && entry.avatarId.trim()
      ? entry.avatarId.trim()
      : null;
  const avatarOriginal =
    typeof entry?.avatarOriginal === "string" && entry.avatarOriginal.trim()
      ? entry.avatarOriginal
      : avatar;
  return {
    login,
    color,
    avatar,
    avatarId,
    avatarOriginal,
  };
}

function applyContacts(items) {
  contactEntries = (Array.isArray(items) ? items : [])
    .map((item) => normalizeContactEntry(item))
    .filter(Boolean)
    .sort((a, b) => a.login.localeCompare(b.login, "ru", { sensitivity: "base" }));
}

function upsertContactEntry(entry) {
  const normalized = normalizeContactEntry(entry);
  if (!normalized) return;
  const index = contactEntries.findIndex((item) => isSameLogin(item.login, normalized.login));
  if (index >= 0) {
    contactEntries[index] = normalized;
  } else {
    contactEntries.push(normalized);
    contactEntries.sort((a, b) => a.login.localeCompare(b.login, "ru", { sensitivity: "base" }));
  }
}

function closeContactSearchModal() {
  if (!contactSearchModal) return;
  contactSearchModal.classList.add("hidden");
  if (contactSearchDebounceTimer) {
    clearTimeout(contactSearchDebounceTimer);
    contactSearchDebounceTimer = null;
  }
  contactSearchState.requestId += 1;
  setContactSearchLoading(false);
}

function setContactSearchLoading(loading) {
  contactSearchState.loading = Boolean(loading);
  if (!contactSearchLoading) return;
  contactSearchLoading.classList.toggle("hidden", !contactSearchState.loading);
}

async function addContactByLogin(login) {
  const normalizedLogin = normalizeLoginValue(login);
  if (!normalizedLogin) return false;
  const response = await emitWithAck("addContact", { login: normalizedLogin });
  if (!response?.ok) {
    pushChatNotification({
      title: "Контакты",
      body: response?.message || "Не удалось добавить контакт.",
      autoDismissMs: 2300,
      autoDismissWhenVisible: true,
    });
    return false;
  }
  if (Array.isArray(response?.items)) {
    applyContacts(response.items);
  } else if (response?.contact) {
    upsertContactEntry(response.contact);
  }
  renderUserList();
  return true;
}

async function removeContactByLogin(login) {
  const normalizedLogin = normalizeLoginValue(login);
  if (!normalizedLogin) return false;
  const response = await emitWithAck("removeContact", { login: normalizedLogin });
  if (!response?.ok) {
    pushChatNotification({
      title: "Контакты",
      body: response?.message || "Не удалось удалить контакт.",
      autoDismissMs: 2300,
      autoDismissWhenVisible: true,
    });
    return false;
  }
  if (Array.isArray(response?.items)) {
    applyContacts(response.items);
  }
  renderUserList();
  return true;
}

function sortContactSearchItems(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const aContact = Number(Boolean(a?.isContact));
    const bContact = Number(Boolean(b?.isContact));
    if (aContact !== bContact) {
      return bContact - aContact;
    }
    const aLogin = normalizeLoginValue(a?.login);
    const bLogin = normalizeLoginValue(b?.login);
    return aLogin.localeCompare(bLogin, "ru", { sensitivity: "base" });
  });
}

function renderContactSearchResults() {
  if (!contactSearchResults) return;
  contactSearchResults.innerHTML = "";
  const items = sortContactSearchItems(contactSearchState.items);
  if (items.length === 0) {
    if (contactSearchState.loading) return;
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Ничего не найдено";
    contactSearchResults.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const login = normalizeLoginValue(item?.login);
    if (!login || isSameLogin(login, currentLogin)) return;
    const color = normalizeKnownColor(item?.color) || getColorForLogin(login);
    const avatarUrl =
      (typeof item?.avatar === "string" && item.avatar.trim() && item.avatar) ||
      getAvatarById(item?.avatarId) ||
      getAvatarForLogin(login);
    const avatarOriginal =
      (typeof item?.avatarOriginal === "string" &&
        item.avatarOriginal.trim() &&
        item.avatarOriginal) ||
      avatarUrl;
    const li = document.createElement("li");
    li.className = "contact-search-result";
    li.innerHTML = `
      <img class="user-avatar" src="${avatarUrl}" alt="${escapeHtml(login)}" />
      <div class="contact-search-result-meta">
        <div class="contact-search-result-name" style="color:${escapeHtml(color)}">${escapeHtml(login)}</div>
        <div class="contact-search-result-status">${
          item?.isContact ? "Уже в контактах" : "Можно добавить"
        }</div>
      </div>
      <div class="contact-search-result-actions">
        <button type="button" class="contact-search-result-action ${
          item?.isContact ? "contact-search-result-action--remove" : ""
        }">${
          item?.isContact ? "Удалить" : "Добавить"
        }</button>
      </div>
    `;
    const avatar = li.querySelector(".user-avatar");
    if (avatar) {
      avatar.dataset.full = avatarOriginal;
      avatar.classList.add("is-clickable");
      avatar.style.setProperty("--avatar-border", color);
      avatar.style.setProperty("--avatar-glow", hexToRgba(color, 0.35));
      avatar.addEventListener("click", async (event) => {
        event.stopPropagation();
        const fallbackSrc = avatar.dataset.full || avatar.src;
        await openAvatarLightboxByLogin(login, fallbackSrc, `Аватар ${login}`);
      });
    }
    const action = li.querySelector(".contact-search-result-action");
    if (action) {
      if (item?.isContact) {
        action.addEventListener("click", async (event) => {
          event.stopPropagation();
          action.setAttribute("disabled", "disabled");
          const ok = await removeContactByLogin(login);
          if (!ok) {
            action.removeAttribute("disabled");
            return;
          }
          contactSearchState.items = contactSearchState.items.map((entry) =>
            isSameLogin(entry?.login, login) ? { ...entry, isContact: false } : entry
          );
          renderContactSearchResults();
        });
      } else {
        action.addEventListener("click", async (event) => {
          event.stopPropagation();
          action.setAttribute("disabled", "disabled");
          const ok = await addContactByLogin(login);
          if (!ok) {
            action.removeAttribute("disabled");
            return;
          }
          contactSearchState.items = contactSearchState.items.map((entry) =>
            isSameLogin(entry?.login, login) ? { ...entry, isContact: true } : entry
          );
          renderContactSearchResults();
        });
      }
    }
    contactSearchResults.appendChild(li);
  });
}

async function loadContactSearchPage({ reset = false } = {}) {
  if (!contactSearchModal || contactSearchModal.classList.contains("hidden")) return;
  if (contactSearchState.loading) return;
  if (!reset && contactSearchState.nextCursor === null) return;
  const cursor = reset ? 0 : Number(contactSearchState.nextCursor) || 0;
  const requestId = contactSearchState.requestId + 1;
  contactSearchState.requestId = requestId;
  if (reset) {
    contactSearchState.items = [];
    contactSearchState.nextCursor = 0;
    contactSearchState.total = 0;
    renderContactSearchResults();
  }

  setContactSearchLoading(true);
  const response = await emitWithAck("searchUsers", {
    query: contactSearchState.query,
    cursor,
    limit: CONTACT_SEARCH_PAGE_SIZE,
  });
  if (requestId !== contactSearchState.requestId) return;
  setContactSearchLoading(false);
  if (!response?.ok) {
    return;
  }

  const incoming = Array.isArray(response?.items) ? response.items : [];
  const merged = reset ? [] : [...contactSearchState.items];
  incoming.forEach((item) => {
    const login = normalizeLoginValue(item?.login);
    if (!login) return;
    if (merged.some((entry) => isSameLogin(entry?.login, login))) return;
    merged.push(item);
  });
  contactSearchState.items = sortContactSearchItems(merged);
  const cursorValue = Number(response?.nextCursor);
  contactSearchState.nextCursor =
    Number.isInteger(cursorValue) && cursorValue >= 0 ? cursorValue : null;
  contactSearchState.total = Number(response?.total || merged.length) || merged.length;
  renderContactSearchResults();
}

function openContactSearchModal() {
  if (!contactSearchModal) return;
  contactSearchModal.classList.remove("hidden");
  if (contactSearchInput) {
    contactSearchInput.value = "";
    contactSearchInput.focus();
  }
  contactSearchState.query = "";
  contactSearchState.nextCursor = 0;
  contactSearchState.total = 0;
  contactSearchState.items = [];
  contactSearchState.requestId += 1;
  setContactSearchLoading(false);
  renderContactSearchResults();
  void loadContactSearchPage({ reset: true });
}

function closeChatSettingsModal() {
  if (!chatSettingsModal) return;
  chatSettingsModal.classList.add("hidden");
  closeChatMembersModal();
  chatSettingsSavePending = false;
  if (chatSettingsSave) {
    chatSettingsSave.removeAttribute("disabled");
  }
}

function openChatSettingsModal() {
  const room = getCurrentChatRoom();
  if (!chatSettingsModal || !room) return;
  chatRoomAvatarDraft = room.avatar || null;
  chatRoomAvatarOriginalDraft = room.avatarOriginal || room.avatar || null;
  chatRoomAvatarIdDraft = room.avatar ? null : room.avatarId || null;
  chatSettingsSavePending = false;
  if (chatSettingsSave) {
    chatSettingsSave.removeAttribute("disabled");
  }
  if (chatSettingsAvatarUpload) {
    chatSettingsAvatarUpload.value = "";
  }
  if (chatSettingsNameInput) {
    chatSettingsNameInput.value = room.title || "";
    chatSettingsNameInput.focus();
  }
  syncChatSettingsAvatarPreview();
  chatSettingsModal.classList.remove("hidden");
}

function closeChatMembersModal() {
  if (!chatMembersModal) return;
  chatMembersModal.classList.add("hidden");
}

function renderChatMembersList(items) {
  if (!chatMembersList) return;
  chatMembersList.innerHTML = "";
  const source = Array.isArray(items) ? items : [];
  const sorted = source
    .map((item) => ({
      ...item,
      login: normalizeLoginValue(item?.login),
    }))
    .filter((item) => Boolean(item.login))
    .sort((a, b) => {
      const aSelf = Boolean(a?.isSelf) || isSameLogin(a?.login, currentLogin);
      const bSelf = Boolean(b?.isSelf) || isSameLogin(b?.login, currentLogin);
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      return String(a.login).localeCompare(String(b.login), "ru", { sensitivity: "base" });
    });

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Список участников пуст";
    chatMembersList.appendChild(empty);
    return;
  }

  sorted.forEach((item) => {
    const login = item.login;
    const onlineUser = getOnlineUser(login);
    const { color, avatarUrl } = resolveUserVisuals({
      name: login,
      user: onlineUser,
      fallbackColor: item?.color,
      fallbackAvatar: item?.avatar,
      fallbackAvatarId: item?.avatarId,
      fallbackAvatarOriginal: item?.avatarOriginal,
    });

    const row = document.createElement("li");
    row.className = "chat-members-row";

    const avatar = document.createElement("img");
    avatar.className = "user-avatar";
    avatar.src = avatarUrl;
    avatar.alt = login;
    avatar.style.setProperty("--avatar-border", color);
    avatar.style.setProperty("--avatar-glow", hexToRgba(color, 0.35));

    const meta = document.createElement("div");
    meta.className = "chat-members-meta";

    const name = document.createElement("div");
    name.className = "chat-members-name";
    name.style.color = color;
    name.textContent = login;

    const role = document.createElement("div");
    role.className = "chat-members-role";
    role.textContent = item?.role || "Участник";

    meta.appendChild(name);
    meta.appendChild(role);

    const actions = document.createElement("div");
    actions.className = "chat-members-actions";

    const status = document.createElement("span");
    status.className = `user-status ${item?.isOnline ? "is-online" : "is-offline"}`;
    status.title = item?.isOnline ? "Онлайн" : "Офлайн";
    actions.appendChild(status);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "chat-members-remove";
    removeButton.textContent = "Исключить";
    if (item?.isSelf) {
      removeButton.disabled = true;
      removeButton.title = "Нельзя исключить самого себя";
    } else {
      removeButton.addEventListener("click", async () => {
        const confirmed = await openMemberDeleteConfirmModal();
        if (!confirmed) return;
        const room = getCurrentChatRoom();
        const response = await emitWithAck("removeChatRoomMember", {
          roomId: room?.id || DEFAULT_CHAT_ROOM_ID,
          login,
        });
        if (!response?.ok) {
          pushChatNotification({
            title: "Участники",
            body: response?.message || "Не удалось исключить участника.",
            autoDismissMs: 2300,
            autoDismissWhenVisible: true,
          });
          return;
        }
        await loadChatMembersForCurrentRoom({ silent: true });
        void refreshPublicParticipants({ silent: true });
      });
    }
    actions.appendChild(removeButton);

    row.appendChild(avatar);
    row.appendChild(meta);
    row.appendChild(actions);
    chatMembersList.appendChild(row);
  });
}

async function loadChatMembersForCurrentRoom({ silent = false } = {}) {
  const room = getCurrentChatRoom();
  if (!room || !socket.connected) return false;
  if (chatMembersLoading) return false;
  chatMembersLoading = true;
  const response = await emitWithAck("getChatRoomMembers", {
    roomId: room.id,
  });
  chatMembersLoading = false;
  if (!response?.ok) {
    if (!silent) {
      pushChatNotification({
        title: "Участники",
        body: response?.message || "Не удалось загрузить участников.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
    }
    return false;
  }
  renderChatMembersList(response.items);
  return true;
}

async function openChatMembersModal() {
  if (!chatMembersModal) return;
  const loaded = await loadChatMembersForCurrentRoom({ silent: false });
  if (!loaded) return;
  chatMembersModal.classList.remove("hidden");
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

if (editCancelBtn) {
  editCancelBtn.addEventListener("click", () => {
    cancelMessageEdit({ clearInput: true });
  });
}

if (backToPublic) {
  backToPublic.addEventListener("click", () => {
    setActiveChat("home");
  });
}

if (publicChatShortcut) {
  publicChatShortcut.addEventListener("click", () => {
    setActiveChat("public");
  });
}

if (contactSearchButton) {
  contactSearchButton.addEventListener("click", () => {
    openContactSearchModal();
  });
}

if (contactsToggle) {
  contactsToggle.addEventListener("click", () => {
    toggleSidebarSection("contacts");
  });
}

if (dialogsToggle) {
  dialogsToggle.addEventListener("click", () => {
    toggleSidebarSection("dialogs");
  });
}

if (onlineToggle) {
  onlineToggle.addEventListener("click", () => {
    toggleSidebarSection("online");
  });
}

if (homeNavLinks.length > 0) {
  homeNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      const key = link.dataset.homeNav || "";
      const targetId = link.dataset.targetId || "";
      if (!key || !targetId) return;
      navigateFromHomeCard(key, targetId);
    });
  });
}

if (contactSearchClose) {
  contactSearchClose.addEventListener("click", () => {
    closeContactSearchModal();
  });
}

if (contactSearchModal) {
  contactSearchModal.addEventListener("click", (event) => {
    if (event.target === contactSearchModal) {
      closeContactSearchModal();
    }
  });
}

if (contactSearchInput) {
  contactSearchInput.addEventListener("input", () => {
    contactSearchState.query = normalizeLoginValue(contactSearchInput.value);
    if (contactSearchDebounceTimer) {
      clearTimeout(contactSearchDebounceTimer);
      contactSearchDebounceTimer = null;
    }
    contactSearchDebounceTimer = setTimeout(() => {
      contactSearchDebounceTimer = null;
      void loadContactSearchPage({ reset: true });
    }, 250);
  });
}

if (contactSearchResults) {
  contactSearchResults.addEventListener("scroll", () => {
    const threshold = 80;
    const reachedBottom =
      contactSearchResults.scrollTop + contactSearchResults.clientHeight >=
      contactSearchResults.scrollHeight - threshold;
    if (reachedBottom) {
      void loadContactSearchPage({ reset: false });
    }
  });
}

if (publicParticipantsTrigger) {
  publicParticipantsTrigger.addEventListener("click", () => {
    void openParticipantsModal();
  });
}

if (participantsClose) {
  participantsClose.addEventListener("click", () => {
    closeParticipantsModal();
  });
}

if (participantsModal) {
  participantsModal.addEventListener("click", (event) => {
    if (event.target === participantsModal) {
      closeParticipantsModal();
    }
  });
}

if (messageDeleteConfirmCancel) {
  messageDeleteConfirmCancel.addEventListener("click", () => {
    closeMessageDeleteConfirmModal({ confirmed: false });
  });
}

if (messageDeleteConfirmAccept) {
  messageDeleteConfirmAccept.addEventListener("click", () => {
    closeMessageDeleteConfirmModal({ confirmed: true });
  });
}

if (messageDeleteConfirmModal) {
  messageDeleteConfirmModal.addEventListener("click", (event) => {
    if (event.target === messageDeleteConfirmModal) {
      closeMessageDeleteConfirmModal({ confirmed: false });
    }
  });
}

if (memberDeleteConfirmCancel) {
  memberDeleteConfirmCancel.addEventListener("click", () => {
    closeMemberDeleteConfirmModal({ confirmed: false });
  });
}

if (memberDeleteConfirmAccept) {
  memberDeleteConfirmAccept.addEventListener("click", () => {
    closeMemberDeleteConfirmModal({ confirmed: true });
  });
}

if (memberDeleteConfirmModal) {
  memberDeleteConfirmModal.addEventListener("click", (event) => {
    if (event.target === memberDeleteConfirmModal) {
      closeMemberDeleteConfirmModal({ confirmed: false });
    }
  });
}

if (chatSettingsButton) {
  chatSettingsButton.addEventListener("click", () => {
    openChatSettingsModal();
  });
}

if (chatSettingsClose) {
  chatSettingsClose.addEventListener("click", () => {
    closeChatSettingsModal();
  });
}

if (chatSettingsModal) {
  chatSettingsModal.addEventListener("click", (event) => {
    if (event.target === chatSettingsModal) {
      closeChatSettingsModal();
    }
  });
}

if (chatSettingsMembers) {
  chatSettingsMembers.addEventListener("click", () => {
    void openChatMembersModal();
  });
}

if (chatMembersClose) {
  chatMembersClose.addEventListener("click", () => {
    closeChatMembersModal();
  });
}

if (chatMembersModal) {
  chatMembersModal.addEventListener("click", (event) => {
    if (event.target === chatMembersModal) {
      closeChatMembersModal();
    }
  });
}

if (chatSettingsAvatarPreview) {
  chatSettingsAvatarPreview.addEventListener("click", () => {
    const full = chatSettingsAvatarPreview.dataset.full || chatSettingsAvatarPreview.src;
    if (!full) return;
    openLightbox(full, "Аватар чата");
  });
}

if (chatSettingsAvatarUpload) {
  chatSettingsAvatarUpload.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushChatNotification({
        title: "Настройки чата",
        body: "Можно загружать только изображения.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
      chatSettingsAvatarUpload.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      pushChatNotification({
        title: "Настройки чата",
        body: "Аватар не должен превышать 5 МБ.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
      chatSettingsAvatarUpload.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        chatRoomAvatarOriginalDraft = result;
        openAvatarCropper(result, { target: "chat-room" });
      }
      chatSettingsAvatarUpload.value = "";
    };
    reader.readAsDataURL(file);
  });
}

if (chatSettingsNameInput) {
  chatSettingsNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      chatSettingsSave?.click();
    }
  });
}

if (chatSettingsSave) {
  chatSettingsSave.addEventListener("click", async () => {
    if (chatSettingsSavePending) return;
    const room = getCurrentChatRoom();
    if (!room) return;
    const title = String(chatSettingsNameInput?.value || "").trim().slice(0, 60);
    if (!title) {
      pushChatNotification({
        title: "Настройки чата",
        body: "Введите название чата.",
        autoDismissMs: 2300,
        autoDismissWhenVisible: true,
      });
      return;
    }
    chatSettingsSavePending = true;
    chatSettingsSave.setAttribute("disabled", "disabled");
    const response = await emitWithAck("updateChatRoomSettings", {
      id: room.id,
      title,
      avatar: chatRoomAvatarDraft || null,
      avatarId: chatRoomAvatarDraft ? null : chatRoomAvatarIdDraft || null,
      avatarOriginal: chatRoomAvatarOriginalDraft || chatRoomAvatarDraft || null,
    });
    chatSettingsSavePending = false;
    chatSettingsSave.removeAttribute("disabled");
    if (!response?.ok) {
      pushChatNotification({
        title: "Настройки чата",
        body: response?.message || "Не удалось сохранить настройки чата.",
        autoDismissMs: 2500,
        autoDismissWhenVisible: true,
      });
      return;
    }

    if (Array.isArray(response?.rooms)) {
      applyChatRooms(response.rooms);
    } else {
      const updated = normalizeChatRoom(response?.room);
      if (updated) {
        const currentRooms = getChatRoomsSafe().map((item) => normalizeChatRoom(item)).filter(Boolean);
        const index = currentRooms.findIndex((item) => String(item.id) === String(updated.id));
        if (index >= 0) {
          currentRooms[index] = updated;
        } else {
          currentRooms.push(updated);
        }
        applyChatRooms(currentRooms);
      }
    }
    if (response?.room?.id) {
      currentChatRoomId = String(response.room.id);
    }

    renderUserList();
    updateChatHeader();
    closeChatSettingsModal();
    pushChatNotification({
      title: "Настройки чата",
      body: "Параметры чата обновлены.",
      autoDismissMs: 2000,
      autoDismissWhenVisible: true,
    });
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

if (profileButton) {
  profileButton.addEventListener("click", () => {
    openSelfProfileModal();
  });
}

if (selfProfileClose) {
  selfProfileClose.addEventListener("click", () => {
    closeSelfProfileModal();
  });
}

if (selfProfileModal) {
  selfProfileModal.addEventListener("click", (event) => {
    if (event.target === selfProfileModal) {
      closeSelfProfileModal();
    }
  });
}

if (selfProfileSave) {
  selfProfileSave.addEventListener("click", () => {
    void applySelfProfileChanges();
  });
}

if (selfProfileBubbleColorReset) {
  selfProfileBubbleColorReset.addEventListener("click", () => {
    if (selfProfileBubbleColorInput) {
      selfProfileBubbleColorInput.value = DEFAULT_OWN_BUBBLE_COLOR;
    }
    pushChatNotification({
      title: "Профиль",
      body: "Цвет сброшен к значению по умолчанию. Нажмите «Сохранить».",
      autoDismissMs: 2200,
      autoDismissWhenVisible: true,
    });
  });
}

if (selfProfileLoginInput) {
  selfProfileLoginInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void applySelfProfileChanges();
    }
  });
}

if (selfProfileChangePasswordButton) {
  selfProfileChangePasswordButton.addEventListener("click", () => {
    void changeSelfPassword();
  });
}

if (selfProfileConfirmPasswordInput) {
  selfProfileConfirmPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void changeSelfPassword();
    }
  });
}

if (selfProfileAvatarUpload) {
  selfProfileAvatarUpload.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      pushChatNotification({
        title: "Профиль",
        body: "Можно загружать только изображения.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
      selfProfileAvatarUpload.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      pushChatNotification({
        title: "Профиль",
        body: "Аватар не должен превышать 5 МБ.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
      selfProfileAvatarUpload.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        selfProfileAvatarOriginalDraft = result;
        openAvatarCropper(result, { target: "profile" });
      }
      selfProfileAvatarUpload.value = "";
    };
    reader.readAsDataURL(file);
  });
}

if (selfProfileAvatarPreview) {
  selfProfileAvatarPreview.addEventListener("click", () => {
    const full = selfProfileAvatarPreview.dataset.full || selfProfileAvatarPreview.src;
    if (!full) return;
    openLightbox(full, "Ваш аватар");
  });
}

renderAvatarOptions();

function toggleAuthPanel(panel, toggle, openText, closeText) {
  if (!panel || !toggle) return;
  const isHidden = panel.classList.toggle("hidden");
  toggle.textContent = isHidden ? openText : closeText;
}

if (registerToggle && registerForm) {
  registerToggle.addEventListener("click", () => {
    toggleAuthPanel(registerForm, registerToggle, "Регистрация", "Скрыть регистрацию");
  });
}
if (verifyToggle && verifyForm) {
  verifyToggle.addEventListener("click", () => {
    toggleAuthPanel(verifyForm, verifyToggle, "Подтвердить почту", "Скрыть подтверждение");
  });
}
if (resetToggle && resetForm) {
  resetToggle.addEventListener("click", () => {
    toggleAuthPanel(resetForm, resetToggle, "Восстановить пароль", "Скрыть восстановление");
  });
}
if (resetPasswordInput) {
  resetPasswordInput.addEventListener("input", updateResetSendCodeAvailability);
}
if (resetPasswordConfirmInput) {
  resetPasswordConfirmInput.addEventListener("input", updateResetSendCodeAvailability);
}
updateResetSendCodeAvailability();

const restoredAuthState = readAuthState();
if (restoredAuthState) {
  applyAuthToSession(restoredAuthState);
  applyAuthToLoginForm(restoredAuthState);
  loadHiddenDirectDialogs();
  loadVisibleDirectDialogs();
  persistAuthState();
  openChatScreen({ restoreLastChat: true });
  joinCurrentUserIfNeeded(true);
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    performLogout();
  });
}

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

function updateSelfProfileAvatarPreview(avatarUrl) {
  selfProfileAvatarDraft = avatarUrl;
  if (!selfProfileAvatarOriginalDraft) {
    selfProfileAvatarOriginalDraft = avatarUrl;
  }
  selfProfileAvatarIdDraft = null;
  renderSelfProfileAvatarOptions();
  syncSelfProfileAvatarPreview();
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
  avatarCropTarget = "login";
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

function openAvatarCropper(dataUrl, { target = "login" } = {}) {
  avatarCropTarget =
    target === "profile" || target === "chat-room" ? target : "login";
  if (!avatarCropModal || !avatarCropImage) {
    if (avatarCropTarget === "profile") {
      updateSelfProfileAvatarPreview(dataUrl);
    } else if (avatarCropTarget === "chat-room") {
      chatRoomAvatarOriginalDraft = dataUrl;
      chatRoomAvatarDraft = dataUrl;
      chatRoomAvatarIdDraft = null;
      syncChatSettingsAvatarPreview();
    } else {
      updateCustomAvatarPreview(dataUrl);
    }
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
  if (avatarCropTarget === "profile") {
    updateSelfProfileAvatarPreview(dataUrl);
  } else if (avatarCropTarget === "chat-room") {
    chatRoomAvatarOriginalDraft = cropSourceImage?.src || dataUrl;
    chatRoomAvatarDraft = dataUrl;
    chatRoomAvatarIdDraft = null;
    syncChatSettingsAvatarPreview();
  } else {
    updateCustomAvatarPreview(dataUrl);
  }
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
    const target = avatarCropTarget;
    closeAvatarCropper();
    if (target === "profile" && selfProfileAvatarUpload) {
      selfProfileAvatarUpload.value = "";
    } else if (target === "chat-room" && chatSettingsAvatarUpload) {
      chatSettingsAvatarUpload.value = "";
    } else if (avatarUploadInput) {
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

function setComposerAttachments(files) {
  if (!attachmentInput) return false;
  const nextFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (typeof DataTransfer !== "function") {
    if (nextFiles.length === 0) {
      attachmentInput.value = "";
      return true;
    }
    return false;
  }
  const transfer = new DataTransfer();
  nextFiles.forEach((file) => transfer.items.add(file));
  attachmentInput.files = transfer.files;
  return true;
}

function clearComposerAttachments() {
  if (!attachmentInput) return;
  attachmentInput.value = "";
  updateAttachmentCount();
  clearAttachmentPreview();
}

function removeComposerAttachmentAt(index) {
  if (!attachmentInput) return;
  const files = Array.from(attachmentInput.files || []);
  if (!Number.isInteger(index) || index < 0 || index >= files.length) return;
  files.splice(index, 1);
  if (!setComposerAttachments(files)) {
    return;
  }
  updateAttachmentCount();
  renderAttachmentPreview(Array.from(attachmentInput.files || []));
}

function renderAttachmentPreview(files) {
  if (!attachmentPreview) return;
  clearAttachmentPreview();
  if (!files.length) return;

  const fragment = document.createDocumentFragment();

  files.forEach((file, index) => {
    if (!file) return;
    if (file.type && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      attachmentPreviewUrls.push(url);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "attachment-thumb";
      button.setAttribute("aria-label", `Убрать вложение ${file.name}`);
      button.title = `Убрать вложение ${file.name}`;
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name || "Изображение";
      img.dataset.full = url;
      img.classList.add("attachment-image");
      button.appendChild(img);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        removeComposerAttachmentAt(index);
      });
      fragment.appendChild(button);
    } else {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "attachment-file";
      item.textContent = `${file.name} (${formatBytes(file.size)})`;
      item.setAttribute("aria-label", `Убрать вложение ${file.name}`);
      item.title = `Убрать вложение ${file.name}`;
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        removeComposerAttachmentAt(index);
      });
      fragment.appendChild(item);
    }
  });

  attachmentPreview.appendChild(fragment);
  attachmentPreview.classList.remove("hidden");
}

function normalizeComposerPreviewText(value, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (!Number.isInteger(maxLength) || maxLength < 4 || normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function normalizeComposerPreviewImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return "";
}

function getPreviewImageProxyUrl(value) {
  const normalized = normalizeComposerPreviewImageUrl(value);
  if (!normalized) return "";
  return `/api/link-preview-image?url=${encodeURIComponent(normalized)}`;
}

function extractFirstComposerLink(text) {
  const source = String(text || "");
  const match = source.match(COMPOSER_LINK_REGEX);
  if (!match || !match[1]) return null;
  const rawMatch = String(match[1]).trim();
  if (!rawMatch) return null;
  const sanitizedMatch = rawMatch.replace(/[.,!?);:\]]+$/g, "");
  if (!sanitizedMatch) return null;
  const href = /^https?:\/\//i.test(sanitizedMatch)
    ? sanitizedMatch
    : `http://${sanitizedMatch}`;
  try {
    const parsed = new URL(href);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
}

function buildComposerLinkFallback(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "") || parsed.host || parsed.hostname;
    const path = `${parsed.pathname || ""}${parsed.search || ""}`;
    const normalizedPath = path && path !== "/" ? normalizeComposerPreviewText(path, 90) : "";
    const imageHost = parsed.hostname || host;
    return {
      url: parsed.toString(),
      siteName: host || "Ссылка",
      title: host || parsed.toString(),
      description: normalizedPath || "Открыть ссылку",
      imageUrl: imageHost
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(imageHost)}&sz=64`
        : "",
    };
  } catch (_) {
    const safeUrl = String(url || "").trim();
    return {
      url: safeUrl,
      siteName: "Ссылка",
      title: safeUrl || "Ссылка",
      description: "Открыть ссылку",
      imageUrl: "",
    };
  }
}

function mergeComposerLinkPreviewData(fallback, remote) {
  if (!remote || typeof remote !== "object") return fallback;
  return {
    url: String(remote.url || fallback.url || ""),
    siteName:
      normalizeComposerPreviewText(remote.siteName || remote.providerName || remote.authorName, 72) ||
      fallback.siteName,
    title:
      normalizeComposerPreviewText(remote.title || remote.siteName || remote.providerName, 120) ||
      fallback.title,
    description: normalizeComposerPreviewText(remote.description, 170) || fallback.description,
    imageUrl: normalizeComposerPreviewImageUrl(remote.imageUrl) || fallback.imageUrl,
  };
}

function estimateLinkPreviewQuality(preview) {
  if (!preview || typeof preview !== "object") return 0;
  const title = String(preview.title || "").trim();
  const description = String(preview.description || "").trim();
  const imageUrl = String(preview.imageUrl || "").trim();
  let score = 0;

  if (title.length >= 8) {
    if (/^[a-z0-9.-]+$/i.test(title)) {
      score += 1;
    } else {
      score += 3;
    }
  }
  if (description.length >= 22) {
    score += 2;
  } else if (description.length >= 8) {
    score += 1;
  }
  if (imageUrl) {
    score += /google\.com\/s2\/favicons/i.test(imageUrl) ? 1 : 3;
  }

  return score;
}

function renderComposerLinkPreviewCard(data, { loading = false } = {}) {
  if (!composerLinkPreview) return;
  composerLinkPreview.innerHTML = "";
  const card = document.createElement("a");
  card.className = "composer-link-preview-card";
  if (loading) {
    card.classList.add("is-loading");
  }
  card.href = String(data?.url || "#");
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const media = document.createElement("div");
  media.className = "composer-link-preview-media";
  const imageUrl = normalizeComposerPreviewImageUrl(data?.imageUrl);
  if (imageUrl) {
    const image = document.createElement("img");
    const proxyImageUrl = getPreviewImageProxyUrl(imageUrl) || imageUrl;
    let triedDirectImageUrl = false;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => {
      if (!triedDirectImageUrl && proxyImageUrl !== imageUrl) {
        triedDirectImageUrl = true;
        image.src = imageUrl;
        return;
      }
      media.innerHTML = "";
      media.classList.add("is-fallback");
      media.textContent = "🔗";
    });
    image.src = proxyImageUrl;
    media.appendChild(image);
  } else {
    media.classList.add("is-fallback");
    media.textContent = "🔗";
  }

  const meta = document.createElement("div");
  meta.className = "composer-link-preview-meta";

  const siteEl = document.createElement("div");
  siteEl.className = "composer-link-preview-site";
  siteEl.textContent = normalizeComposerPreviewText(data?.siteName, 72) || "Ссылка";

  const titleEl = document.createElement("div");
  titleEl.className = "composer-link-preview-title";
  titleEl.textContent = normalizeComposerPreviewText(data?.title, 120) || "Ссылка";

  const descEl = document.createElement("div");
  descEl.className = "composer-link-preview-desc";
  descEl.textContent = loading
    ? "Загружаем превью..."
    : normalizeComposerPreviewText(data?.description, 170) || "Открыть ссылку";

  meta.appendChild(siteEl);
  meta.appendChild(titleEl);
  meta.appendChild(descEl);

  card.appendChild(media);
  card.appendChild(meta);
  composerLinkPreview.appendChild(card);
  composerLinkPreview.classList.remove("hidden");
  composerLinkPreview.dataset.state = loading ? "loading" : "ready";
  composerLinkPreview.dataset.url = String(data?.url || "");
}

function resetComposerLinkPreview() {
  if (composerLinkPreviewTimer) {
    clearTimeout(composerLinkPreviewTimer);
    composerLinkPreviewTimer = null;
  }
  composerLinkPreviewRequestId += 1;
  composerLinkPreviewActiveUrl = "";
  if (!composerLinkPreview) return;
  composerLinkPreview.innerHTML = "";
  composerLinkPreview.classList.add("hidden");
  composerLinkPreview.removeAttribute("data-state");
  composerLinkPreview.removeAttribute("data-url");
}

async function fetchComposerLinkPreviewData(url) {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl || typeof fetch !== "function") return null;
  const cachedEntry = composerLinkPreviewCache.get(normalizedUrl);
  if (cachedEntry && typeof cachedEntry === "object") {
    if (cachedEntry.payload && Number(cachedEntry.expiresAt) > Date.now()) {
      return cachedEntry.payload;
    }
    composerLinkPreviewCache.delete(normalizedUrl);
  }

  let abortController = null;
  let timeoutId = null;
  try {
    if (typeof AbortController === "function") {
      abortController = new AbortController();
      timeoutId = setTimeout(() => {
        try {
          abortController.abort();
        } catch (_) {
          // ignore
        }
      }, COMPOSER_LINK_PREVIEW_FETCH_TIMEOUT_MS);
    }
    const response = await fetch(
      `/api/link-preview?url=${encodeURIComponent(normalizedUrl)}`,
      {
        method: "GET",
        signal: abortController ? abortController.signal : undefined,
        headers: { Accept: "application/json" },
      }
    );
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || !payload.ok) return null;
    const result = {
      url: String(payload.url || normalizedUrl),
      title: normalizeComposerPreviewText(payload.title, 120),
      providerName: normalizeComposerPreviewText(payload.providerName, 72),
      siteName: normalizeComposerPreviewText(payload.siteName, 72),
      description: normalizeComposerPreviewText(payload.description, 170),
      imageUrl: normalizeComposerPreviewImageUrl(payload.imageUrl),
    };
    const qualityScore = estimateLinkPreviewQuality(result);
    if (qualityScore >= COMPOSER_LINK_PREVIEW_MIN_SCORE_TO_CACHE) {
      composerLinkPreviewCache.set(normalizedUrl, {
        payload: result,
        expiresAt: Date.now() + COMPOSER_LINK_PREVIEW_CACHE_TTL_MS,
      });
    } else {
      composerLinkPreviewCache.delete(normalizedUrl);
    }
    return result;
  } catch (_) {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function updateComposerLinkPreview() {
  if (!composerLinkPreview || !messageInput) return;
  if (editTarget) {
    resetComposerLinkPreview();
    return;
  }
  const nextUrl = extractFirstComposerLink(messageInput.value);
  if (!nextUrl) {
    resetComposerLinkPreview();
    return;
  }

  const requestId = ++composerLinkPreviewRequestId;
  composerLinkPreviewActiveUrl = nextUrl;
  const fallback = buildComposerLinkFallback(nextUrl);
  renderComposerLinkPreviewCard(fallback, { loading: true });

  const metadata = await fetchComposerLinkPreviewData(nextUrl);
  if (requestId !== composerLinkPreviewRequestId) return;
  if (composerLinkPreviewActiveUrl !== nextUrl) return;

  const merged = mergeComposerLinkPreviewData(fallback, metadata);
  renderComposerLinkPreviewCard(merged, { loading: false });
}

async function updateComposerLinkPreviewSafe() {
  if (composerLinkPreviewDisabled) return;
  try {
    await updateComposerLinkPreview();
  } catch (error) {
    composerLinkPreviewDisabled = true;
    resetComposerLinkPreview();
    console.error("[composer-link-preview] disabled due runtime error", error);
  }
}

function scheduleComposerLinkPreviewUpdate({ immediate = false } = {}) {
  if (!composerLinkPreview || !messageInput || composerLinkPreviewDisabled) return;
  if (composerLinkPreviewTimer) {
    clearTimeout(composerLinkPreviewTimer);
    composerLinkPreviewTimer = null;
  }
  if (immediate) {
    void updateComposerLinkPreviewSafe();
    return;
  }
  composerLinkPreviewTimer = setTimeout(() => {
    composerLinkPreviewTimer = null;
    void updateComposerLinkPreviewSafe();
  }, COMPOSER_LINK_PREVIEW_DEBOUNCE_MS);
}

function hideMessageLinkPreview(container) {
  if (!container) return;
  container.innerHTML = "";
  container.classList.add("hidden");
  container.removeAttribute("data-state");
  container.removeAttribute("data-url");
  container.removeAttribute("data-request-id");
}

function renderMessageLinkPreviewCard(container, data, { loading = false } = {}) {
  if (!container) return;
  container.innerHTML = "";
  const card = document.createElement("a");
  card.className = "message-link-preview-card";
  if (loading) {
    card.classList.add("is-loading");
  }
  card.href = String(data?.url || "#");
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  const meta = document.createElement("div");
  meta.className = "message-link-preview-meta";

  const siteEl = document.createElement("div");
  siteEl.className = "message-link-preview-site";
  siteEl.textContent = normalizeComposerPreviewText(data?.siteName, 72) || "Ссылка";

  const titleEl = document.createElement("div");
  titleEl.className = "message-link-preview-title";
  titleEl.textContent = normalizeComposerPreviewText(data?.title, 120) || "Ссылка";

  const descEl = document.createElement("div");
  descEl.className = "message-link-preview-desc";
  descEl.textContent = loading
    ? "Загружаем превью…"
    : normalizeComposerPreviewText(data?.description, 220) || "Открыть ссылку";

  meta.appendChild(siteEl);
  meta.appendChild(titleEl);
  meta.appendChild(descEl);
  card.appendChild(meta);

  const imageUrl = normalizeComposerPreviewImageUrl(data?.imageUrl);
  if (imageUrl && !loading) {
    const isWeakImage =
      /google\.com\/s2\/favicons|favicon|touch-icon|apple-touch-icon|logo(?:\.|%2e)/i.test(
        imageUrl
      );
    if (isWeakImage) {
      const iconWrap = document.createElement("div");
      iconWrap.className = "message-link-preview-image-wrap is-icon";
      card.classList.add("has-icon");
      const icon = document.createElement("img");
      const proxyImageUrl = getPreviewImageProxyUrl(imageUrl) || imageUrl;
      let triedDirectImageUrl = false;
      icon.className = "message-link-preview-image";
      icon.alt = normalizeComposerPreviewText(data?.siteName, 72) || "Иконка сайта";
      icon.loading = "lazy";
      icon.decoding = "async";
      icon.referrerPolicy = "no-referrer";
      icon.addEventListener("error", () => {
        if (!triedDirectImageUrl && proxyImageUrl !== imageUrl) {
          triedDirectImageUrl = true;
          icon.src = imageUrl;
          return;
        }
        iconWrap.remove();
        card.classList.remove("has-icon");
        card.classList.add("has-no-image");
      });
      icon.src = proxyImageUrl;
      iconWrap.appendChild(icon);
      card.insertBefore(iconWrap, meta);
    } else {
      const imageWrap = document.createElement("div");
      imageWrap.className = "message-link-preview-image-wrap";
      card.classList.add("has-image");
      const image = document.createElement("img");
      const proxyImageUrl = getPreviewImageProxyUrl(imageUrl) || imageUrl;
      let triedDirectImageUrl = false;
      image.className = "message-link-preview-image";
      image.alt = normalizeComposerPreviewText(data?.title, 120) || "Превью ссылки";
      image.loading = "lazy";
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("error", () => {
        if (!triedDirectImageUrl && proxyImageUrl !== imageUrl) {
          triedDirectImageUrl = true;
          image.src = imageUrl;
          return;
        }
        imageWrap.remove();
      });
      image.src = proxyImageUrl;
      imageWrap.appendChild(image);
      card.appendChild(imageWrap);
    }
  } else {
    card.classList.add("has-no-image");
  }

  container.appendChild(card);
  container.classList.remove("hidden");
  container.dataset.state = loading ? "loading" : "ready";
  container.dataset.url = String(data?.url || "");
}

function updateMessageLinkPreviewForElement(messageEl, textValue, { isSticker = false } = {}) {
  try {
    if (!messageEl) return;
    const container = messageEl.querySelector(".message-link-preview");
    if (!container) return;
    if (isSticker) {
      hideMessageLinkPreview(container);
      return;
    }

    const normalizedText = String(textValue || "");
    const previewUrl = extractFirstComposerLink(normalizedText);
    if (!previewUrl) {
      hideMessageLinkPreview(container);
      return;
    }

    const fallback = buildComposerLinkFallback(previewUrl);
    const requestId = String(++messageLinkPreviewRequestCounter);
    container.dataset.requestId = requestId;
    renderMessageLinkPreviewCard(container, fallback, { loading: true });

    void fetchComposerLinkPreviewData(previewUrl)
      .then((metadata) => {
        if (!container.isConnected) return;
        if (container.dataset.requestId !== requestId) return;
        if ((container.dataset.url || "") !== previewUrl) return;
        const merged = mergeComposerLinkPreviewData(fallback, metadata);
        renderMessageLinkPreviewCard(container, merged, { loading: false });
      })
      .catch(() => {
        if (!container.isConnected) return;
        if (container.dataset.requestId !== requestId) return;
        renderMessageLinkPreviewCard(container, fallback, { loading: false });
      });
  } catch (error) {
    console.error("[message-link-preview] runtime error", error);
  }
}

function isChatComposerAvailable() {
  return Boolean(
    chatScreen &&
      !chatScreen.classList.contains("hidden") &&
      messageForm &&
      !messageForm.classList.contains("hidden") &&
      attachmentInput
  );
}

function hasTransferFiles(dataTransfer) {
  if (!dataTransfer) return false;
  if (Array.from(dataTransfer.types || []).includes("Files")) return true;
  if (!dataTransfer.items || dataTransfer.items.length === 0) return false;
  return Array.from(dataTransfer.items).some((item) => item?.kind === "file");
}

function createAttachmentFileName(file, source, index) {
  const mime = String(file?.type || "").toLowerCase();
  const rawExtension = mime.includes("/") ? mime.split("/")[1] : "";
  const extension = rawExtension
    ? rawExtension.split("+")[0].split(";")[0].replace(/[^a-z0-9]/g, "")
    : "bin";
  return `${source}-${Date.now()}-${index + 1}.${extension || "bin"}`;
}

function withGuaranteedFileName(file, source, index) {
  if (!file) return null;
  if (String(file.name || "").trim()) return file;
  const generatedName = createAttachmentFileName(file, source, index);
  if (typeof File !== "function") return null;
  try {
    return new File([file], generatedName, {
      type: file.type || "application/octet-stream",
      lastModified: Date.now(),
    });
  } catch (_) {
    return null;
  }
}

function collectFilesFromTransfer(dataTransfer, { source = "drop" } = {}) {
  if (!dataTransfer) return [];
  const collected = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    Array.from(dataTransfer.items).forEach((item) => {
      if (!item || item.kind !== "file") return;
      const file = item.getAsFile();
      const prepared = withGuaranteedFileName(file, source, collected.length);
      if (!prepared || !prepared.name) return;
      collected.push(prepared);
    });
  }

  if (collected.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    Array.from(dataTransfer.files).forEach((file) => {
      const prepared = withGuaranteedFileName(file, source, collected.length);
      if (!prepared || !prepared.name) return;
      collected.push(prepared);
    });
  }

  return collected;
}

function appendIncomingAttachments(incomingFiles) {
  if (!attachmentInput) return 0;
  const files = Array.isArray(incomingFiles) ? incomingFiles.filter(Boolean) : [];
  if (files.length === 0) return 0;
  if (typeof DataTransfer !== "function") {
    pushChatNotification({
      title: "Вложения",
      body: "Ваш браузер не поддерживает добавление файлов из буфера/перетаскивания.",
      autoDismissMs: 2200,
      autoDismissWhenVisible: true,
    });
    return 0;
  }

  const transfer = new DataTransfer();
  const existingFiles = Array.from(attachmentInput.files || []);
  existingFiles.forEach((file) => transfer.items.add(file));
  files.forEach((file) => transfer.items.add(file));

  attachmentInput.files = transfer.files;
  const mergedFiles = Array.from(attachmentInput.files || []);
  updateAttachmentCount();
  renderAttachmentPreview(mergedFiles);
  return files.length;
}

function setChatDragState(active) {
  if (!chatMain) return;
  chatMain.classList.toggle("is-file-drag", Boolean(active));
}

function resetChatDragState() {
  chatFileDragDepth = 0;
  setChatDragState(false);
}

function isNativeFileDropTarget(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input[type="file"], .avatar-upload-label, .self-profile-upload-label, .chat-settings-upload-label'
    )
  );
}

function handleClipboardFilePaste(event) {
  if (!isChatComposerAvailable()) return false;
  const clipboardData = event?.clipboardData;
  const files = collectFilesFromTransfer(clipboardData, { source: "clipboard" });
  if (files.length === 0) return false;
  event.preventDefault();
  const addedCount = appendIncomingAttachments(files);
  if (addedCount > 0 && messageInput) {
    messageInput.focus();
  }
  return addedCount > 0;
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
  avatarLightboxRequestId += 1;
  lightboxImage.src = src;
  lightboxImage.alt = alt || "Просмотр изображения";
  lightbox.classList.remove("hidden");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  if (!lightbox || !lightboxImage) return;
  lightbox.classList.add("hidden");
  lightboxImage.src = "";
  document.body.classList.remove("lightbox-open");
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

if (lightboxImage) {
  lightboxImage.addEventListener("click", () => {
    closeLightbox();
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
  if (participantsModal && !participantsModal.classList.contains("hidden")) {
    closeParticipantsModal();
  }
  if (chatMembersModal && !chatMembersModal.classList.contains("hidden")) {
    closeChatMembersModal();
  }
  if (messageDeleteConfirmModal && !messageDeleteConfirmModal.classList.contains("hidden")) {
    closeMessageDeleteConfirmModal({ confirmed: false });
  }
  if (memberDeleteConfirmModal && !memberDeleteConfirmModal.classList.contains("hidden")) {
    closeMemberDeleteConfirmModal({ confirmed: false });
  }
  if (editTarget) {
    cancelMessageEdit({ clearInput: true });
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
    if (mentionTarget) {
      const detected = detectMentionTarget(messageInput.value);
      if (!detected || !isSameLogin(detected, mentionTarget)) {
        mentionTarget = null;
      }
    }
    scheduleComposerLinkPreviewUpdate();
  });
  autoSizeTextarea();
  scheduleComposerLinkPreviewUpdate({ immediate: true });

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Enter — отправка
      e.preventDefault();
      messageForm.requestSubmit();
    }
    // Shift+Enter — обычная новая строка, ничего не трогаем
  });
  messageInput.addEventListener("paste", (event) => {
    handleClipboardFilePaste(event);
  });
}
updateComposerModeUI();

document.addEventListener("paste", (event) => {
  if (event.defaultPrevented) return;
  if (!isChatComposerAvailable()) return;
  const target = event.target;
  const isEditableTarget =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);
  const isMessageInputTarget =
    messageInput && target instanceof Node && (target === messageInput || messageInput.contains(target));
  if (isEditableTarget && !isMessageInputTarget) return;
  handleClipboardFilePaste(event);
});

if (clearMessageButton) {
  clearMessageButton.addEventListener("click", () => {
    clearComposerAttachments();
    if (!messageInput) return;
    if (editTarget) {
      cancelMessageEdit({ clearInput: true });
      messageInput.focus();
      return;
    }
    messageInput.value = "";
    mentionTarget = null;
    resetComposerLinkPreview();
    autoSizeTextarea();
    messageInput.focus();
  });
}

if (messagesList) {
  messagesList.addEventListener("scroll", () => {
    closeReactionPicker();
    maybeLoadOlderPublicHistory();
    maybeLoadOlderDirectHistory();
    if (isMessagesNearBottom()) {
      clearUnreadMessages();
      maybeAutoDismissVisibleNotifications();
      processRecipientHighlights();
      updateScrollToLatestButton();
      return;
    }
    updateUnreadOnScroll();
    maybeAutoDismissVisibleNotifications();
    processRecipientHighlights();
    updateScrollToLatestButton();
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

if (scrollToLatestButton) {
  scrollToLatestButton.addEventListener("click", () => {
    scrollMessagesToBottom();
    clearUnreadMessages();
    requestAnimationFrame(updateScrollToLatestButton);
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
  applySidebarWidth(currentSidebarWidth, { persist: false });
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
      wrapper.setAttribute("hidden", "");
    }
  } else {
    if (wrapper) {
      wrapper.classList.remove("hidden");
      wrapper.removeAttribute("hidden");
    }
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

function getPublicEntryKey(entry) {
  if (entry?.messageId) {
    return `id:${entry.messageId}`;
  }
  return `fallback:${entry?.login || ""}:${entry?.timestamp || ""}:${entry?.text || ""}`;
}

function toPublicHistoryEntry(payload) {
  const login = normalizeLoginValue(payload?.login);
  if (!login) {
    return null;
  }
  const isCurrentUserMessage = currentLogin && isSameLogin(login, currentLogin);
  const resolvedAvatar = isCurrentUserMessage
    ? currentAvatar || payload?.avatar || null
    : payload?.avatar || null;
  const resolvedAvatarOriginal = isCurrentUserMessage
    ? currentAvatarOriginal || currentAvatar || payload?.avatarOriginal || payload?.avatar || null
    : payload?.avatarOriginal || payload?.avatar || null;
  const resolvedAvatarId = isCurrentUserMessage
    ? currentAvatar
      ? null
      : currentAvatarId || payload?.avatarId || null
    : payload?.avatarId || null;
  return {
    messageId: payload?.messageId ? String(payload.messageId) : "",
    login,
    color: payload?.color || null,
    text: String(payload?.text || ""),
    timestamp: payload?.timestamp || new Date().toISOString(),
    editedAt: payload?.editedAt || null,
    avatar: resolvedAvatar,
    avatarId: resolvedAvatarId,
    avatarOriginal: resolvedAvatarOriginal,
    attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
    replyTo: payload?.replyTo || null,
    mentionTo: payload?.mentionTo || null,
    reactions:
      payload?.reactions && typeof payload.reactions === "object" ? payload.reactions : {},
    myReaction: typeof payload?.myReaction === "string" ? payload.myReaction : null,
    readAll: Boolean(payload?.readAll),
    local: false,
    chatType: "public",
  };
}

function mergePublicHistoryEntries(items, { mode = "append", reset = false } = {}) {
  if (reset) {
    publicHistory.length = 0;
  }

  const existingKeys = new Set(publicHistory.map((entry) => getPublicEntryKey(entry)));
  const source = Array.isArray(items) ? items : [];
  const uniqueIncoming = [];

  source.forEach((item) => {
    const entry = toPublicHistoryEntry(item);
    if (!entry) return;
    const entryKey = getPublicEntryKey(entry);
    if (existingKeys.has(entryKey)) return;
    existingKeys.add(entryKey);
    uniqueIncoming.push(entry);
  });

  if (uniqueIncoming.length === 0) {
    return publicHistory;
  }

  if (mode === "prepend") {
    publicHistory.unshift(...uniqueIncoming);
  } else {
    publicHistory.push(...uniqueIncoming);
  }

  publicHistory.sort((a, b) => getEntryTimestamp(a) - getEntryTimestamp(b));
  return publicHistory;
}

function updatePublicHistoryPaging(meta, { markInitialized = false } = {}) {
  const totalValue = Number(meta?.total);
  if (Number.isFinite(totalValue) && totalValue >= 0) {
    publicHistoryState.total = totalValue;
  } else {
    publicHistoryState.total = publicHistory.length;
  }

  const cursorValue = Number(meta?.nextCursor);
  publicHistoryState.nextCursor =
    Number.isInteger(cursorValue) && cursorValue > 0 ? cursorValue : null;
  if (markInitialized) {
    publicHistoryState.isInitialized = true;
  }
}

function requestPublicHistoryPage({ before = null, limit = PUBLIC_HISTORY_PAGE_SIZE } = {}) {
  return new Promise((resolve) => {
    if (!socket.connected || !currentLogin) {
      resolve({ ok: false, message: "Нет подключения к серверу." });
      return;
    }

    const payload = {
      limit: Math.max(1, Number(limit) || PUBLIC_HISTORY_PAGE_SIZE),
    };
    if (before !== null && before !== undefined) {
      payload.before = before;
    }

    socket.emit("loadPublicHistory", payload, (response) => {
      if (!response || typeof response !== "object") {
        resolve({ ok: false, message: "Некорректный ответ сервера." });
        return;
      }
      resolve(response);
    });
  });
}

if (chatMain) {
  chatMain.addEventListener("dragenter", (event) => {
    if (!isChatComposerAvailable()) return;
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    chatFileDragDepth += 1;
    setChatDragState(true);
  });

  chatMain.addEventListener("dragover", (event) => {
    if (!isChatComposerAvailable()) return;
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    setChatDragState(true);
  });

  chatMain.addEventListener("dragleave", (event) => {
    if (!hasTransferFiles(event.dataTransfer)) return;
    if (!(event.relatedTarget instanceof Node) || !chatMain.contains(event.relatedTarget)) {
      resetChatDragState();
      return;
    }
    chatFileDragDepth = Math.max(0, chatFileDragDepth - 1);
    if (chatFileDragDepth === 0) {
      setChatDragState(false);
    }
  });

  chatMain.addEventListener("drop", (event) => {
    if (!isChatComposerAvailable()) return;
    if (!hasTransferFiles(event.dataTransfer)) return;
    event.preventDefault();
    const files = collectFilesFromTransfer(event.dataTransfer, { source: "drop" });
    const addedCount = appendIncomingAttachments(files);
    if (addedCount > 0 && messageInput) {
      messageInput.focus();
    }
    resetChatDragState();
  });
}

document.addEventListener("dragover", (event) => {
  if (!isChatComposerAvailable()) return;
  if (!hasTransferFiles(event.dataTransfer)) return;
  if (isNativeFileDropTarget(event.target)) return;
  event.preventDefault();
});

document.addEventListener("drop", (event) => {
  if (!hasTransferFiles(event.dataTransfer)) return;
  if (isNativeFileDropTarget(event.target)) return;
  if (!(event.target instanceof Node) || !chatMain || !chatMain.contains(event.target)) {
    event.preventDefault();
    resetChatDragState();
  }
});

window.addEventListener("blur", () => {
  resetChatDragState();
});

async function loadOlderPublicHistory() {
  if (!messagesList || publicHistoryState.isLoading) return;
  if (publicHistoryState.nextCursor === null || publicHistoryState.nextCursor <= 0) return;

  publicHistoryState.isLoading = true;
  const previousHeight = messagesList.scrollHeight;
  const previousTop = messagesList.scrollTop;
  let response = null;
  try {
    response = await requestPublicHistoryPage({
      before: publicHistoryState.nextCursor,
      limit: PUBLIC_HISTORY_PAGE_SIZE,
    });
  } finally {
    publicHistoryState.isLoading = false;
  }

  if (!response?.ok) return;

  mergePublicHistoryEntries(response.items, { mode: "prepend", reset: false });
  updatePublicHistoryPaging(response, { markInitialized: true });
  if (activeChat.type === "public") {
    renderActiveChat({
      preserveScrollPosition: true,
      previousHeight,
      previousTop,
      scrollToBottom: false,
    });
  }
}

function maybeLoadOlderPublicHistory() {
  if (!messagesList) return;
  if (activeChat.type !== "public") return;
  if (Date.now() < historyAutoloadBlockedUntil) return;
  if (messagesList.scrollTop > PUBLIC_HISTORY_TOP_THRESHOLD) return;
  void loadOlderPublicHistory();
}

function getDirectHistory(partner) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) {
    return [];
  }
  if (!directHistories.has(normalizedPartner)) {
    directHistories.set(normalizedPartner, []);
  }
  return directHistories.get(normalizedPartner);
}

function getDirectHistoryPaging(partner) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) {
    return null;
  }
  if (!directHistoryState.has(normalizedPartner)) {
    directHistoryState.set(normalizedPartner, {
      nextCursor: null,
      total: 0,
      isLoading: false,
      isInitialized: false,
    });
  }
  return directHistoryState.get(normalizedPartner);
}

function getDirectEntryKey(entry) {
  if (entry?.messageId) {
    return `id:${entry.messageId}`;
  }
  return `fallback:${entry?.login || ""}:${entry?.timestamp || ""}:${entry?.text || ""}`;
}

function toDirectHistoryEntry(payload) {
  const login = normalizeLoginValue(payload?.login);
  if (!login) {
    return null;
  }
  const isCurrentUserMessage = currentLogin && isSameLogin(login, currentLogin);
  const resolvedAvatar = isCurrentUserMessage
    ? currentAvatar || payload?.avatar || null
    : payload?.avatar || null;
  const resolvedAvatarOriginal = isCurrentUserMessage
    ? currentAvatarOriginal || currentAvatar || payload?.avatarOriginal || payload?.avatar || null
    : payload?.avatarOriginal || payload?.avatar || null;
  const resolvedAvatarId = isCurrentUserMessage
    ? currentAvatar
      ? null
      : currentAvatarId || payload?.avatarId || null
    : payload?.avatarId || null;

  return {
    messageId: payload?.messageId ? String(payload.messageId) : "",
    login,
    color: payload?.color || null,
    text: String(payload?.text || ""),
    timestamp: payload?.timestamp || new Date().toISOString(),
    editedAt: payload?.editedAt || null,
    avatar: resolvedAvatar,
    avatarId: resolvedAvatarId,
    avatarOriginal: resolvedAvatarOriginal,
    attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
    replyTo: payload?.replyTo || null,
    reactions:
      payload?.reactions && typeof payload.reactions === "object" ? payload.reactions : {},
    myReaction: typeof payload?.myReaction === "string" ? payload.myReaction : null,
    readAll: Boolean(payload?.readAll),
    local: false,
    chatType: "direct",
  };
}

function mergeDirectHistoryEntries(partner, items, { mode = "append", reset = false } = {}) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) {
    return [];
  }

  const history = getDirectHistory(normalizedPartner);
  if (reset) {
    history.length = 0;
  }

  const existingKeys = new Set(history.map((entry) => getDirectEntryKey(entry)));
  const incoming = Array.isArray(items) ? items : [];
  const uniqueIncoming = [];

  incoming.forEach((item) => {
    const entry = toDirectHistoryEntry(item);
    if (!entry) return;
    const entryKey = getDirectEntryKey(entry);
    if (existingKeys.has(entryKey)) return;
    existingKeys.add(entryKey);
    uniqueIncoming.push(entry);
  });

  if (uniqueIncoming.length === 0) {
    return history;
  }

  if (mode === "prepend") {
    history.unshift(...uniqueIncoming);
  } else {
    history.push(...uniqueIncoming);
  }

  history.sort((a, b) => getEntryTimestamp(a) - getEntryTimestamp(b));
  return history;
}

function rerenderActiveChatPreservingScroll() {
  if (!messagesList) {
    renderActiveChat({ scrollToBottom: false });
    return;
  }
  const previousHeight = messagesList.scrollHeight;
  const previousTop = messagesList.scrollTop;
  renderActiveChat({
    preserveScrollPosition: true,
    previousHeight,
    previousTop,
    scrollToBottom: false,
  });
}

function updateHistoryEntryByMessageId(entries, messageId, updater) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId || !Array.isArray(entries)) return null;
  const target = entries.find(
    (entry) => String(entry?.messageId || "") === normalizedMessageId
  );
  if (!target) return null;
  if (typeof updater === "function") {
    updater(target);
  }
  return target;
}

function removeHistoryEntryByMessageId(entries, messageId) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId || !Array.isArray(entries)) return null;
  const index = entries.findIndex(
    (entry) => String(entry?.messageId || "") === normalizedMessageId
  );
  if (index < 0) return null;
  const [removed] = entries.splice(index, 1);
  return removed || null;
}

function removeRenderedMessageById(messageId) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return;

  if (
    activeReactionTarget &&
    String(activeReactionTarget.messageId || "") === normalizedMessageId
  ) {
    closeReactionPicker();
  }

  const messageEl = messageElementMap.get(normalizedMessageId);
  if (messageEl && messageEl.isConnected) {
    messageEl.remove();
  }

  messageElementMap.delete(normalizedMessageId);
  messageElements.delete(normalizedMessageId);
  messageReactions.delete(normalizedMessageId);
  messageReactionSelections.delete(normalizedMessageId);
  reactionRequestInFlight.delete(normalizedMessageId);
  readMessageIds.delete(normalizedMessageId);
  recipientHighlightQueue.delete(normalizedMessageId);
  recipientHighlightDone.delete(normalizedMessageId);

  unreadMessages = unreadMessages.filter(
    (messageNode) => messageNode && messageNode.isConnected && messageNode !== messageEl
  );
  firstUnreadMessage = unreadMessages[0] || null;
  updateUnreadIndicator();
  updateScrollToLatestButton();
}

function cleanupAfterMessageDeleted(messageId) {
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return;
  if (
    replyTarget?.messageId &&
    String(replyTarget.messageId) === normalizedMessageId
  ) {
    hideReplyPreview();
  }
  if (
    editTarget?.messageId &&
    String(editTarget.messageId) === normalizedMessageId
  ) {
    cancelMessageEdit({ clearInput: true });
  }
  removeRenderedMessageById(normalizedMessageId);
}

function updateRenderedEditedMessage(entry, { chatType = "public", partner = null } = {}) {
  const normalizedMessageId = String(entry?.messageId || "").trim();
  if (!normalizedMessageId) return false;

  if (chatType === "public" && activeChat.type !== "public") return false;
  if (chatType === "notes" && activeChat.type !== "notes") return false;
  if (chatType === "direct") {
    if (activeChat.type !== "direct") return false;
    if (!isSameLogin(activeChat.partner, partner || "")) return false;
  }

  const messageEl = messageElementMap.get(normalizedMessageId);
  if (!messageEl || !messageEl.isConnected) return false;

  const textEl = messageEl.querySelector(".message-body .text");
  let isStickerMessage = false;
  const textValue = String(entry?.text || "");
  if (textEl) {
    const sticker = getStickerPayload(textValue);
    isStickerMessage = Boolean(sticker);
    if (sticker) {
      textEl.innerHTML = `<div class="sticker-message"><img src="${sticker.uri}" alt="${escapeHtml(
        sticker.label
      )}" /></div>`;
    } else {
      textEl.innerHTML = formatMessageText(textValue, { mentionTo: entry?.mentionTo || null });
    }
  } else {
    isStickerMessage = Boolean(getStickerPayload(textValue));
  }
  updateMessageLinkPreviewForElement(messageEl, textValue, { isSticker: isStickerMessage });

  const mentionChip = messageEl.querySelector(".mention-chip");
  if (mentionChip && entry?.mentionTo) {
    mentionChip.style.setProperty("--mention-color", getColorForLogin(entry.mentionTo));
    mentionChip.addEventListener("click", (event) => {
      event.stopPropagation();
      setActiveChat("public");
      queuePublicMention(entry.mentionTo, { allowSelf: true });
    });
  }

  const statusEl = messageEl.querySelector(".message-status");
  if (statusEl) {
    let editedBadge = statusEl.querySelector(".message-edited-badge");
    if (entry?.editedAt) {
      if (!editedBadge) {
        editedBadge = document.createElement("span");
        editedBadge.className = "message-edited-badge";
        editedBadge.textContent = "изменено";
        const timeEl = statusEl.querySelector(".message-time");
        if (timeEl) {
          statusEl.insertBefore(editedBadge, timeEl);
        } else {
          statusEl.prepend(editedBadge);
        }
      }
    } else if (editedBadge) {
      editedBadge.remove();
    }
  }

  return true;
}

function applyPublicMessageEdited(payload) {
  const updated = updateHistoryEntryByMessageId(publicHistory, payload?.messageId, (entry) => {
    entry.text = String(payload?.text || "");
    entry.editedAt = payload?.editedAt || new Date().toISOString();
    entry.mentionTo = payload?.mentionTo || null;
  });
  if (!updated) return false;
  if (replyTarget?.messageId && String(replyTarget.messageId) === String(updated.messageId)) {
    replyTarget.text = updated.text;
    showReplyPreview();
  }
  updateRenderedEditedMessage(updated, { chatType: "public" });
  return true;
}

function getDirectPartnerFromPayload(payload) {
  const login = normalizeLoginValue(payload?.login);
  const to = normalizeLoginValue(payload?.to);
  if (!login || !currentLogin) return "";
  if (isSameLogin(login, currentLogin)) {
    return to;
  }
  return login;
}

function applyDirectMessageEdited(payload) {
  const partner = getDirectPartnerFromPayload(payload);
  if (!partner) return false;
  const history = getDirectHistory(partner);
  const updated = updateHistoryEntryByMessageId(history, payload?.messageId, (entry) => {
    entry.text = String(payload?.text || "");
    entry.editedAt = payload?.editedAt || new Date().toISOString();
  });
  if (!updated) return false;
  if (replyTarget?.messageId && String(replyTarget.messageId) === String(updated.messageId)) {
    replyTarget.text = updated.text;
    showReplyPreview();
  }
  updateRenderedEditedMessage(updated, { chatType: "direct", partner });
  return true;
}

function applyPublicMessageDeleted(payload) {
  const removed = removeHistoryEntryByMessageId(publicHistory, payload?.messageId);
  if (!removed) return false;
  if (publicHistoryState.isInitialized) {
    publicHistoryState.total = Math.max(0, publicHistoryState.total - 1);
  }
  cleanupAfterMessageDeleted(removed.messageId);
  return true;
}

function applyDirectMessageDeleted(payload) {
  const partner = getDirectPartnerFromPayload(payload);
  if (!partner) return false;
  const history = getDirectHistory(partner);
  const removed = removeHistoryEntryByMessageId(history, payload?.messageId);
  if (!removed) return false;
  const state = getDirectHistoryPaging(partner);
  if (state?.isInitialized) {
    state.total = Math.max(0, state.total - 1);
  }
  cleanupAfterMessageDeleted(removed.messageId);
  renderUserList();
  return true;
}

function startMessageEdit({ chatType, messageId, currentText, hasAttachments }) {
  if (!messageInput) return false;
  const normalizedChatType =
    chatType === "direct" ? "direct" : chatType === "notes" ? "notes" : "public";
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return false;
  if (normalizedChatType === "direct" && !activeChat.partner) return false;

  editTarget = {
    chatType: normalizedChatType,
    messageId: normalizedMessageId,
    originalText: String(currentText || ""),
    hasAttachments: Boolean(hasAttachments),
    partner: normalizedChatType === "direct" ? activeChat.partner : null,
  };

  hideReplyPreview();
  mentionTarget = null;
  if (attachmentInput) {
    attachmentInput.value = "";
    updateAttachmentCount();
    clearAttachmentPreview();
  }

  messageInput.value = editTarget.originalText;
  resetComposerLinkPreview();
  autoSizeTextarea();
  showEditPreview();
  messageInput.focus();
  const caret = messageInput.value.length;
  messageInput.setSelectionRange(caret, caret);
  return true;
}

async function submitMessageEditFromComposer() {
  if (!editTarget || !messageInput) return false;
  const normalizedChatType =
    editTarget.chatType === "direct"
      ? "direct"
      : editTarget.chatType === "notes"
        ? "notes"
        : "public";

  if (
    normalizedChatType === "direct" &&
    (!activeChat.partner || !isSameLogin(activeChat.partner, editTarget.partner))
  ) {
    cancelMessageEdit({ clearInput: true });
    return false;
  }

  if (attachmentInput && attachmentInput.files && attachmentInput.files.length > 0) {
    pushChatNotification({
      title: "Редактирование",
      body: "Для редактирования сначала очистите новые вложения.",
      autoDismissMs: 2500,
      autoDismissWhenVisible: true,
    });
    return false;
  }

  const nextText = String(messageInput.value || "").trim();
  const previousText = String(editTarget.originalText || "").trim();
  if (nextText === previousText) {
    cancelMessageEdit({ clearInput: true });
    return false;
  }
  if (!nextText && !editTarget.hasAttachments) {
    pushChatNotification({
      title: "Редактирование",
      body: "Нельзя оставить сообщение пустым.",
      autoDismissMs: 2200,
      autoDismissWhenVisible: true,
    });
    return false;
  }

  let updatedLocally = false;
  if (normalizedChatType === "notes") {
    updatedLocally = editOwnNoteMessage(editTarget.messageId, nextText);
  } else {
    const response = await emitWithAck(
      normalizedChatType === "direct" ? "editDirectMessage" : "editPublicMessage",
      {
        messageId: editTarget.messageId,
        text: nextText,
      }
    );
    if (!response?.ok) {
      pushChatNotification({
        title: "Редактирование",
        body: response?.message || "Не удалось изменить сообщение.",
        autoDismissMs: 2600,
        autoDismissWhenVisible: true,
      });
      return false;
    }
    const updatedPayload = response?.message;
    if (updatedPayload && typeof updatedPayload === "object") {
      if (normalizedChatType === "direct") {
        applyDirectMessageEdited(updatedPayload);
      } else {
        applyPublicMessageEdited(updatedPayload);
      }
      updatedLocally = true;
    }
  }

  if (!updatedLocally) return false;

  cancelMessageEdit({ clearInput: true });
  mentionTarget = null;
  return true;
}

function requestMessageEdit({ chatType, messageId, currentText, hasAttachments }) {
  return startMessageEdit({ chatType, messageId, currentText, hasAttachments });
}

async function requestMessageDelete({ chatType, messageId }) {
  const normalizedChatType = chatType === "direct" ? "direct" : chatType === "notes" ? "notes" : "public";
  const normalizedMessageId = String(messageId || "").trim();
  if (!normalizedMessageId) return false;

  const confirmed = await openMessageDeleteConfirmModal();
  if (!confirmed) return false;

  if (normalizedChatType === "notes") {
    return deleteOwnNoteMessage(normalizedMessageId);
  }

  const response = await emitWithAck(
    normalizedChatType === "direct" ? "deleteDirectMessage" : "deletePublicMessage",
    { messageId: normalizedMessageId }
  );
  if (!response?.ok) {
    pushChatNotification({
      title: "Удаление",
      body: response?.message || "Не удалось удалить сообщение.",
      autoDismissMs: 2400,
      autoDismissWhenVisible: true,
    });
    return false;
  }

  const deletedPayload = response?.message;
  if (deletedPayload && typeof deletedPayload === "object") {
    if (normalizedChatType === "direct") {
      return applyDirectMessageDeleted(deletedPayload);
    }
    return applyPublicMessageDeleted(deletedPayload);
  }

  return false;
}

function updateDirectPagingFromResponse(partner, response) {
  const state = getDirectHistoryPaging(partner);
  if (!state) return;

  const totalValue = Number(response?.total);
  state.total =
    Number.isFinite(totalValue) && totalValue >= 0
      ? totalValue
      : getDirectHistory(partner).length;

  const cursorValue = Number(response?.nextCursor);
  state.nextCursor =
    Number.isInteger(cursorValue) && cursorValue >= 0 ? cursorValue : null;
  state.isInitialized = true;
}

function requestDirectHistoryPage(partner, { before = null, limit = DIRECT_HISTORY_PAGE_SIZE } = {}) {
  return new Promise((resolve) => {
    if (!socket.connected || !currentLogin) {
      resolve({ ok: false, message: "Нет подключения к серверу." });
      return;
    }

    const payload = {
      partner,
      limit: Math.max(1, Number(limit) || DIRECT_HISTORY_PAGE_SIZE),
    };
    if (before !== null && before !== undefined) {
      payload.before = before;
    }

    socket.emit("loadDirectHistory", payload, (response) => {
      if (!response || typeof response !== "object") {
        resolve({ ok: false, message: "Некорректный ответ сервера." });
        return;
      }
      resolve(response);
    });
  });
}

async function loadDirectHistoryPage(
  partner,
  { before = null, mode = "append", reset = false } = {}
) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) {
    return false;
  }

  const state = getDirectHistoryPaging(normalizedPartner);
  if (!state || state.isLoading) {
    return false;
  }

  state.isLoading = true;
  let response = null;
  try {
    response = await requestDirectHistoryPage(normalizedPartner, {
      before,
      limit: DIRECT_HISTORY_PAGE_SIZE,
    });
  } finally {
    state.isLoading = false;
  }

  if (!response?.ok) {
    return false;
  }

  const responsePartner = normalizeLoginValue(response.partner || normalizedPartner) || normalizedPartner;
  setDirectDialogVisual(responsePartner, {
    color: response?.partnerColor,
    avatar: response?.partnerAvatar,
    avatarId: response?.partnerAvatarId,
    avatarOriginal: response?.partnerAvatarOriginal,
  });
  mergeDirectHistoryEntries(responsePartner, response.items, { mode, reset });
  updateDirectPagingFromResponse(responsePartner, response);
  return true;
}

async function ensureDirectHistoryLoaded(partner, { force = false } = {}) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) return;

  const state = getDirectHistoryPaging(normalizedPartner);
  if (!state) return;
  if (!force && (state.isInitialized || state.isLoading)) {
    return;
  }

  const loaded = await loadDirectHistoryPage(normalizedPartner, {
    before: null,
    mode: "append",
    reset: true,
  });
  if (!loaded) return;

  renderUserList();
  if (activeChat.type === "direct" && isSameLogin(activeChat.partner, normalizedPartner)) {
    renderActiveChat();
  }
}

async function loadOlderDirectHistory(partner) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner || !messagesList) return;

  const state = getDirectHistoryPaging(normalizedPartner);
  if (!state || state.isLoading) return;
  if (state.nextCursor === null || state.nextCursor <= 0) return;

  const previousHeight = messagesList.scrollHeight;
  const previousTop = messagesList.scrollTop;
  const loaded = await loadDirectHistoryPage(normalizedPartner, {
    before: state.nextCursor,
    mode: "prepend",
    reset: false,
  });
  if (!loaded) return;

  renderUserList();
  if (activeChat.type === "direct" && isSameLogin(activeChat.partner, normalizedPartner)) {
    renderActiveChat({
      preserveScrollPosition: true,
      previousHeight,
      previousTop,
      scrollToBottom: false,
    });
  }
}

function maybeLoadOlderDirectHistory() {
  if (!messagesList) return;
  if (activeChat.type !== "direct" || !activeChat.partner) return;
  if (Date.now() < historyAutoloadBlockedUntil) return;
  if (messagesList.scrollTop > DIRECT_HISTORY_TOP_THRESHOLD) return;
  void loadOlderDirectHistory(activeChat.partner);
}

function getSendCooldownRemainingMs() {
  const elapsed = Date.now() - lastSentMessageAt;
  return Math.max(0, SEND_COOLDOWN_MS - elapsed);
}

function syncSendCooldown(remainingMs) {
  const safeRemaining = Math.max(0, Number(remainingMs) || 0);
  lastSentMessageAt = Date.now() - (SEND_COOLDOWN_MS - safeRemaining);
}

function showSendCooldownNotice(remainingMs) {
  const seconds = Math.max(1, Math.ceil((Number(remainingMs) || 0) / 1000));
  pushChatNotification({
    title: "Ограничение отправки",
    body: `Следующее сообщение можно отправить через ${seconds} сек.`,
    autoDismissMs: 1800,
    autoDismissWhenVisible: true,
  });
}

function closeParticipantsModal() {
  if (!participantsModal) return;
  participantsModal.classList.add("hidden");
}

function resolveMessageDeleteConfirm(result) {
  const resolver = messageDeleteConfirmResolver;
  messageDeleteConfirmResolver = null;
  if (typeof resolver === "function") {
    resolver(Boolean(result));
  }
}

function closeMessageDeleteConfirmModal({ confirmed = false } = {}) {
  if (messageDeleteConfirmModal) {
    messageDeleteConfirmModal.classList.add("hidden");
  }
  resolveMessageDeleteConfirm(confirmed);
}

function openMessageDeleteConfirmModal() {
  return new Promise((resolve) => {
    if (!messageDeleteConfirmModal) {
      resolve(false);
      return;
    }
    if (typeof messageDeleteConfirmResolver === "function") {
      messageDeleteConfirmResolver(false);
      messageDeleteConfirmResolver = null;
    }
    messageDeleteConfirmResolver = resolve;
    messageDeleteConfirmModal.classList.remove("hidden");
    requestAnimationFrame(() => {
      messageDeleteConfirmAccept?.focus();
    });
  });
}

function resolveMemberDeleteConfirm(result) {
  const resolver = memberDeleteConfirmResolver;
  memberDeleteConfirmResolver = null;
  if (typeof resolver === "function") {
    resolver(Boolean(result));
  }
}

function closeMemberDeleteConfirmModal({ confirmed = false } = {}) {
  if (memberDeleteConfirmModal) {
    memberDeleteConfirmModal.classList.add("hidden");
  }
  resolveMemberDeleteConfirm(confirmed);
}

function openMemberDeleteConfirmModal() {
  return new Promise((resolve) => {
    if (!memberDeleteConfirmModal) {
      resolve(false);
      return;
    }
    if (typeof memberDeleteConfirmResolver === "function") {
      memberDeleteConfirmResolver(false);
      memberDeleteConfirmResolver = null;
    }
    memberDeleteConfirmResolver = resolve;
    memberDeleteConfirmModal.classList.remove("hidden");
    requestAnimationFrame(() => {
      memberDeleteConfirmAccept?.focus();
    });
  });
}

function renderParticipantsModalList() {
  if (!participantsList) return;
  participantsList.innerHTML = "";
  const onlineLogins = new Set(
    lastUserList
      .map((user) => normalizeUserName(user))
      .filter(Boolean)
      .map((login) => String(login).toLowerCase())
  );
  const source = Array.isArray(publicParticipantsCache) ? publicParticipantsCache : [];
  const sorted = source
    .map((item) => ({
      ...item,
      login: normalizeLoginValue(item?.login),
    }))
    .filter((item) => Boolean(item.login))
    .sort((a, b) => {
      const aSelf = isSameLogin(a?.login, currentLogin);
      const bSelf = isSameLogin(b?.login, currentLogin);
      if (aSelf !== bSelf) return aSelf ? -1 : 1;
      return String(a.login).localeCompare(String(b.login), "ru", { sensitivity: "base" });
    });

  if (sorted.length === 0) {
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Участники не найдены";
    participantsList.appendChild(empty);
    return;
  }

  sorted.forEach((item) => {
    const name = item.login;
    const onlineUser = getOnlineUser(name);
    const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({
      name,
      user: onlineUser,
      fallbackColor: item?.color,
      fallbackAvatar: item?.avatar,
      fallbackAvatarId: item?.avatarId,
      fallbackAvatarOriginal: item?.avatarOriginal,
    });
    const isOnline = onlineLogins.has(String(name).toLowerCase());
    const li = createUserListItem({
      name,
      color,
      avatarUrl,
      avatarOriginal,
      avatarLogin: name,
      isClickable: true,
      isOnline,
      isSelf: isSameLogin(name, currentLogin),
    });
    li.addEventListener("click", () => {
      if (isSameLogin(name, currentLogin)) return;
      openProfileCard({ name, color, avatarUrl, avatarOriginal });
    });
    participantsList.appendChild(li);
  });
}

async function refreshPublicParticipants({ silent = true } = {}) {
  if (!socket.connected || !currentLogin) return null;
  const response = await emitWithAck("getPublicParticipants", {});
  if (!response?.ok) {
    if (!silent) {
      pushChatNotification({
        title: "Участники",
        body: response?.message || "Не удалось загрузить участников.",
        autoDismissMs: 2200,
        autoDismissWhenVisible: true,
      });
    }
    return null;
  }
  publicParticipantsCache = Array.isArray(response.items) ? response.items : [];
  if (publicParticipantsTrigger) {
    publicParticipantsTrigger.textContent = `(${publicParticipantsCache.length}) участников`;
  }
  renderParticipantsModalList();
  return publicParticipantsCache;
}

async function openParticipantsModal() {
  if (!participantsModal) return;
  await refreshPublicParticipants({ silent: false });
  participantsModal.classList.remove("hidden");
}

function updateChatHeader() {
  if (!chatTitleText || !chatContext || !backToPublic) return;
  const header = chatTitleText.closest(".chat-header");
  const room = getCurrentChatRoom();
  if (activeChat.type === "direct" && activeChat.partner) {
    if (header) header.classList.remove("has-public-participants");
    chatTitleText.textContent = "Личное сообщение";
    chatTitleText.classList.remove("is-public-title");
    chatContext.textContent = `с ${activeChat.partner}`;
    chatContext.classList.remove("hidden");
    chatContext.classList.add("is-direct");
    backToPublic.classList.add("hidden");
    if (chatSettingsButton) {
      chatSettingsButton.classList.add("hidden");
    }
    if (publicParticipantsTrigger) {
      publicParticipantsTrigger.classList.add("hidden");
    }
    closeParticipantsModal();
    return;
  }

  if (activeChat.type === "notes") {
    if (header) header.classList.remove("has-public-participants");
    chatTitleText.textContent = "Личные заметки";
    chatTitleText.classList.remove("is-public-title");
    chatContext.textContent = "";
    chatContext.classList.add("hidden");
    chatContext.classList.remove("is-direct");
    backToPublic.classList.add("hidden");
    if (chatSettingsButton) {
      chatSettingsButton.classList.add("hidden");
    }
    if (publicParticipantsTrigger) {
      publicParticipantsTrigger.classList.add("hidden");
    }
    closeParticipantsModal();
    return;
  }

  if (activeChat.type === "public") {
    if (header) header.classList.add("has-public-participants");
    chatTitleText.textContent = room?.title || DEFAULT_CHAT_ROOM_TITLE;
    chatTitleText.classList.add("is-public-title");
    chatContext.textContent = "";
    chatContext.classList.add("hidden");
    chatContext.classList.remove("is-direct");
    backToPublic.classList.add("hidden");
    if (chatSettingsButton) {
      chatSettingsButton.classList.remove("hidden");
    }
    if (publicParticipantsTrigger) {
      publicParticipantsTrigger.classList.remove("hidden");
      publicParticipantsTrigger.textContent = `(${publicParticipantsCache.length}) участников`;
    }
    void refreshPublicParticipants({ silent: true });
    return;
  }

  if (header) header.classList.remove("has-public-participants");
  chatTitleText.textContent = "Контакты";
  chatTitleText.classList.remove("is-public-title");
  chatContext.textContent = "";
  chatContext.classList.add("hidden");
  chatContext.classList.remove("is-direct");
  backToPublic.classList.add("hidden");
  if (chatSettingsButton) {
    chatSettingsButton.classList.add("hidden");
  }
  if (publicParticipantsTrigger) {
    publicParticipantsTrigger.classList.add("hidden");
  }
  closeParticipantsModal();
}

function clearDirectUnread(partner) {
  if (!partner) return;
  directUnreadCounts.delete(partner);
}

function clearPublicUnread() {
  publicUnreadCount = 0;
}

function registerPublicUnread() {
  publicUnreadCount += 1;
}

function registerDirectUnread(partner) {
  if (!partner) return;
  const next = (directUnreadCounts.get(partner) || 0) + 1;
  directUnreadCounts.set(partner, next);
}

async function markDirectDialogReadOnServer(partner) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner || !socket.connected || !currentLogin) return;
  try {
    await emitWithAck("markDirectDialogRead", { partner: normalizedPartner });
  } catch (_) {
    // ignore transient socket errors
  }
}

function notifyDirectUnreadSummary() {
  if (directUnreadNoticeShown) return;
  const unreadEntries = Array.from(directUnreadCounts.entries()).filter(([, count]) => count > 0);
  if (unreadEntries.length === 0) return;
  directUnreadNoticeShown = true;
  unreadEntries.sort((a, b) => b[1] - a[1]);
  const [topPartner] = unreadEntries[0];
  const totalUnread = unreadEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const dialogCount = unreadEntries.length;
  const body =
    dialogCount === 1
      ? `У вас ${totalUnread} непрочитанных сообщений от ${topPartner}.`
      : `У вас ${totalUnread} непрочитанных личных сообщений в ${dialogCount} диалогах.`;
  pushChatNotification({
    title: "Личные сообщения",
    body,
    actionLabel: "Открыть",
    onAction: () => setActiveChat("direct", topPartner),
    autoDismissMs: 6000,
    autoDismissWhenVisible: false,
    chatType: "direct",
    partner: topPartner,
  });
}

function updateChatViewMode() {
  const isHome = activeChat.type === "home";
  const isNotes = activeChat.type === "notes";
  const hasNotesMessages = getNotesHistory().length > 0;
  if (homeView) {
    homeView.classList.toggle("hidden", !isHome);
  }
  if (notesView) {
    notesView.classList.toggle("hidden", !(isNotes && !hasNotesMessages));
  }
  if (messagesList) {
    messagesList.classList.toggle("hidden", isHome || (isNotes && !hasNotesMessages));
  }
  if (messageForm) {
    messageForm.classList.toggle("hidden", isHome);
  }
  if (replyPreview) {
    replyPreview.classList.toggle("hidden", isHome || isNotes || !replyTarget);
  }
  if (unreadIndicator && isHome) {
    unreadIndicator.classList.add("hidden");
  }
  if (attachmentPreview && isHome) {
    attachmentPreview.classList.add("hidden");
  }
  if (composerLinkPreview && isHome) {
    composerLinkPreview.classList.add("hidden");
  }
  if (scrollToLatestButton) {
    if (isHome) {
      scrollToLatestButton.classList.add("hidden");
    } else {
      updateScrollToLatestButton();
    }
  }
}

function renderActiveChat({
  preserveScrollPosition = false,
  previousHeight = 0,
  previousTop = 0,
  scrollToBottom = true,
} = {}) {
  const renderToken = ++activeChatRenderToken;
  updateChatViewMode();
  if (activeChat.type === "home") {
    clearUnreadMessages();
    return;
  }
  if (!messagesList) return;
  messagesList.innerHTML = "";
  messageElements.clear();
  messageElementMap.clear();
  clearUnreadMessages();
  const items =
    activeChat.type === "direct" && activeChat.partner
      ? getDirectHistory(activeChat.partner)
      : activeChat.type === "notes"
        ? getNotesHistory()
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

  if (preserveScrollPosition) {
    const nextHeight = messagesList.scrollHeight;
    const delta = nextHeight - previousHeight;
    messagesList.scrollTop = Math.max(0, previousTop + delta);
    updateScrollToLatestButton();
    return;
  }

  if (scrollToBottom) {
    stabilizeScrollToBottom(renderToken);
  }
  requestAnimationFrame(updateScrollToLatestButton);
}

function setActiveChat(type, partner = null) {
  let nextType =
    type === "direct" ? "direct" : type === "notes" ? "notes" : type === "home" ? "home" : "public";
  const normalizedPartner = nextType === "direct" ? normalizeLoginValue(partner) : null;
  if (nextType === "direct" && !normalizedPartner) {
    nextType = "home";
  }
  if (nextType === "public" && isPublicChatExcluded) {
    nextType = "home";
    pushChatNotification({
      title: "Публичный чат",
      body: "Вы исключены из публичного чата.",
      autoDismissMs: 2600,
      autoDismissWhenVisible: true,
    });
  }

  activeChat = {
    type: nextType,
    partner: nextType === "direct" ? normalizedPartner : null,
  };

  if (nextType === "public") {
    clearPublicUnread();
  }

  if (nextType === "direct" && normalizedPartner) {
    getDirectHistory(normalizedPartner);
    getDirectHistoryPaging(normalizedPartner);
    clearDirectUnread(normalizedPartner);
    void markDirectDialogReadOnServer(normalizedPartner);
    void ensureDirectHistoryLoaded(normalizedPartner);
  }
  if (nextType !== "public") {
    mentionTarget = null;
  }
  updateChatHeader();
  updateMuteToggle();
  closeDmPopup();
  hideReplyPreview();
  cancelMessageEdit({ clearInput: true });
  renderActiveChat();
  updatePublicShortcutVisibility();
  if (typeof renderUserList === "function") {
    renderUserList();
  }
  persistActiveChatState();
  syncPresenceActivity();
  maybeAutoDismissVisibleNotifications();
}

function getStickerPayload(text) {
  const trimmed = String(text || "").trim();
  const match = trimmed.match(/^\[\[sticker:([a-z0-9_-]+)\]\]$/i);
  if (!match) return null;
  return stickerMap.get(match[1]) || null;
}

function isMessagesNearBottom() {
  if (!messagesList) return true;
  const threshold = 40;
  const distance =
    messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight;
  return distance <= threshold;
}

function scrollMessagesToBottom() {
  if (!messagesList) return;
  messagesList.scrollTop = messagesList.scrollHeight;
}

function updateScrollToLatestButton() {
  if (!scrollToLatestButton) return;
  const hasActiveChat =
    activeChat.type === "public" || activeChat.type === "direct" || activeChat.type === "notes";
  const shouldShow =
    hasActiveChat &&
    Boolean(messagesList) &&
    !messagesList.classList.contains("hidden") &&
    !isMessagesNearBottom();
  scrollToLatestButton.classList.toggle("hidden", !shouldShow);
}

function stabilizeScrollToBottom(renderToken, { force = false } = {}) {
  if (!messagesList) return;
  historyAutoloadBlockedUntil = Date.now() + 7000;
  let userMovedAwayFromBottom = false;
  let hasAutoScrolled = false;
  let lastAutoScrollTop = 0;
  const safeScroll = () => {
    if (renderToken !== activeChatRenderToken) return;
    if (!force && hasAutoScrolled) {
      const currentTop = Number(messagesList.scrollTop || 0);
      // Stop auto-stick only when user really scrolled up, not when content height grew.
      if (currentTop + 8 < lastAutoScrollTop) {
        userMovedAwayFromBottom = true;
      }
    }
    if (userMovedAwayFromBottom) {
      return;
    }
    scrollMessagesToBottom();
    hasAutoScrolled = true;
    lastAutoScrollTop = Number(messagesList.scrollTop || 0);
  };

  safeScroll();
  requestAnimationFrame(safeScroll);
  [80, 180, 320, 550, 900, 1300, 1800, 2400, 3200, 4300, 5600].forEach((delayMs) => {
    setTimeout(safeScroll, delayMs);
  });

  const observer = new MutationObserver(() => {
    safeScroll();
  });
  observer.observe(messagesList, { childList: true, subtree: true });
  setTimeout(() => {
    observer.disconnect();
  }, 6200);

  const mediaNodes = messagesList.querySelectorAll("img, video, audio");
  mediaNodes.forEach((node) => {
    const tag = String(node.tagName || "").toUpperCase();
    const isReady =
      (tag === "IMG" && Boolean(node.complete)) ||
      ((tag === "VIDEO" || tag === "AUDIO") && Number(node.readyState || 0) >= 1);
    if (isReady) return;

    const onReady = () => {
      safeScroll();
    };
    node.addEventListener("load", onReady, { once: true });
    node.addEventListener("error", onReady, { once: true });
    node.addEventListener("loadedmetadata", onReady, { once: true });
  });
}

function forceScrollToBottomAfterOwnSend() {
  if (!messagesList) return;
  scrollMessagesToBottom();
  clearUnreadMessages();
  stabilizeScrollToBottom(activeChatRenderToken, { force: true });
  updateScrollToLatestButton();
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
  updateScrollToLatestButton();
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
  avatarOriginal,
  messageId,
  readAll,
  editedAt,
  reactions = {},
  myReaction = null,
  chatType = "public",
}) {
  const li = document.createElement("li");
  li.classList.add("message");
  const isMine = currentLogin && isSameLogin(login, currentLogin);
  const canDeleteOwnMessage = Boolean(
    isMine && (chatType === "public" || chatType === "direct" || chatType === "notes")
  );
  const canEditOwnMessage = Boolean(
    isMine && (chatType === "public" || chatType === "direct" || chatType === "notes")
  );
  if (isMine) {
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

  const onlineUser = getOnlineUser(login);
  const directPartnerVisual =
    !isMine && chatType === "direct" ? getDirectDialogVisual(login) : null;
  const { color: resolvedColor, avatarUrl, avatarOriginal: resolvedAvatarOriginal } =
    resolveUserVisuals({
      name: login,
      user: onlineUser,
      fallbackColor: isMine
        ? currentColor || color
        : directPartnerVisual?.color || color,
      fallbackAvatar: isMine
        ? currentAvatar || avatar
        : directPartnerVisual?.avatar || avatar,
      fallbackAvatarId: isMine
        ? currentAvatar
          ? null
          : currentAvatarId || avatarId
        : directPartnerVisual?.avatarId || avatarId,
      fallbackAvatarOriginal: isMine
        ? currentAvatarOriginal || currentAvatar || avatarOriginal || avatar
        : directPartnerVisual?.avatarOriginal || avatarOriginal || avatar,
    });
  const avatarFullUrl = resolvedAvatarOriginal || avatarUrl;
  const initialCheckState = readAll ? "read" : "sent";
  const isEdited = Boolean(editedAt);

  const statusHtml = `
    <div class="message-status">
      ${isEdited ? '<span class="message-edited-badge">изменено</span>' : ""}
      <span class="message-time">${timeStr}</span>
      <span class="message-checks ${
        initialCheckState === "read" ? "is-read" : "is-sent"
      }" data-state="${initialCheckState}">${
        initialCheckState === "read" ? "✓✓" : "✓"
      }</span>
    </div>
  `;
  const deleteActionTitle = chatType === "notes" ? "Удалить заметку" : "Удалить сообщение";

  li.innerHTML = `
    <img class="message-avatar" src="${avatarUrl}" alt="${escapeHtml(login)}" />
    <div class="message-bubble${canDeleteOwnMessage ? " has-message-delete" : ""}${canEditOwnMessage ? " has-message-edit" : ""}">
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
      <div class="message-link-preview hidden"></div>
      ${attachmentsHtml}
      <div class="message-reactions" aria-label="Реакции"></div>
      <button type="button" class="reaction-trigger" title="Поставить реакцию">😊</button>
      ${
        canEditOwnMessage
          ? '<button type="button" class="message-edit-trigger" title="Редактировать сообщение" aria-label="Редактировать сообщение">✎</button>'
          : ""
      }
      ${
        canDeleteOwnMessage
          ? `<button type="button" class="message-delete-trigger" title="${deleteActionTitle}" aria-label="${deleteActionTitle}">✕</button>`
          : ""
      }
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

  const baseColor = resolvedColor || getColorForLogin(login);
  const border = hexToRgba(baseColor, isMine ? 0.74 : 0.62);
  const glow = hexToRgba(baseColor, isMine ? 0.28 : 0.22);
  const ownBubbleBase = normalizeHexColor(
    currentOwnBubbleColor,
    DEFAULT_OWN_BUBBLE_COLOR
  );
  const ownBubblePalette = getReadableOwnBubblePalette(ownBubbleBase);
  const bubbleBg = isMine
    ? hexToRgba(ownBubbleBase, 0.92)
    : "rgba(12, 20, 42, 0.92)";

  const bubbleEl = li.querySelector(".message-bubble");
  if (bubbleEl) {
    bubbleEl.style.setProperty("--bubble-border", border);
    bubbleEl.style.setProperty("--bubble-bg", bubbleBg);
    if (isMine) {
      bubbleEl.style.setProperty("--own-text-color", ownBubblePalette.text);
      bubbleEl.style.setProperty("--own-meta-color", ownBubblePalette.muted);
      bubbleEl.style.setProperty("--own-link-color", ownBubblePalette.link);
      bubbleEl.style.setProperty("--own-check-color", ownBubblePalette.checks);
    }
    bubbleEl.style.boxShadow = `0 0 12px ${glow}, 0 10px 18px rgba(15, 23, 42, 0.36)`;
  }
  updateMessageLinkPreviewForElement(li, text, { isSticker: Boolean(sticker) });

  const authorEl = li.querySelector(".author");
  if (authorEl) {
    authorEl.style.color = baseColor;
    if (login && !isMine) {
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
    avatarEl.dataset.full = avatarFullUrl;
    avatarEl.classList.add("is-clickable");
    avatarEl.addEventListener("click", (event) => {
      event.stopPropagation();
      openDmPopup(login, avatarEl);
    });
    if (!isMine) {
      avatarEl.title = `Открыть аватар ${login}`;
    } else {
      avatarEl.title = "Открыть ваш аватар";
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
      if (event.target instanceof Element && event.target.closest("a")) {
        return;
      }
      event.stopPropagation();
      if (editTarget) {
        cancelMessageEdit({ clearInput: true });
      }
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
  const messageEditTrigger = li.querySelector(".message-edit-trigger");
  if (messageEditTrigger) {
    messageEditTrigger.addEventListener("click", async (event) => {
      event.stopPropagation();
      await requestMessageEdit({
        chatType,
        messageId: resolvedMessageId,
        currentText: text,
        hasAttachments: safeAttachments.length > 0,
      });
    });
  }
  const messageDeleteTrigger = li.querySelector(".message-delete-trigger, .note-delete-trigger");
  if (messageDeleteTrigger) {
    messageDeleteTrigger.addEventListener("click", async (event) => {
      event.stopPropagation();
      await requestMessageDelete({
        chatType,
        messageId: resolvedMessageId,
      });
    });
  }
  const checkEl = li.querySelector(".message-checks");
  messageElements.set(resolvedMessageId, { reactionsEl, checkEl, chatType });
  applyReactionPayload(resolvedMessageId, reactions, typeof myReaction === "string" ? myReaction : null);

  if (!isMine && resolvedMessageId) {
    markMessageRead(resolvedMessageId);
  }

  appendMessageElement(li, { countUnread: !local && !silent });

  if (!silent && !local && !isMine) {
    playNotification(chatType);
  }

  const shouldHighlightForRecipient =
    !silent &&
    !local &&
    !isMine &&
    ((mentionTo && isSameLogin(mentionTo, currentLogin)) ||
      (replyTo?.login && isSameLogin(replyTo.login, currentLogin)));
  if (shouldHighlightForRecipient) {
    const highlightColor =
      color || getColorForLogin(login || "guest");
    scheduleRecipientHighlight(resolvedMessageId, li, highlightColor);
  }
}



loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthFeedback("login");
  const login = normalizeLoginValue(loginInput?.value);
  const password = String(loginPasswordInput?.value || "").trim();
  if (!login || !password) {
    showAuthError("Введите ник и пароль.", "login");
    return;
  }

  if (!socket.connected) {
    socket.connect();
  }
  const response = await emitWithAck("loginAccount", { login, password });
  if (!response?.ok) {
    if (response?.reason === "email_not_verified") {
      if (verifyLoginInput) verifyLoginInput.value = login;
      if (verifyForm && verifyForm.classList.contains("hidden")) {
        verifyForm.classList.remove("hidden");
      }
      if (verifyToggle) verifyToggle.textContent = "Скрыть подтверждение";
      showAuthFeedback(
        "verify",
        response?.message || "Почта не подтверждена. Подтвердите кодом из письма.",
        "info"
      );
    } else {
      showAuthError(response?.message || "Не удалось войти.", "login");
    }
    return;
  }

  clearAllAuthFeedback();
  applyServerUserToSession(response.user, { sessionToken: response.sessionToken });
  loadHiddenDirectDialogs();
  loadVisibleDirectDialogs();
  lastJoinSignature = "";
  openChatScreen({ restoreLastChat: true });
  joinCurrentUserIfNeeded(true);
  if (loginPasswordInput) {
    loginPasswordInput.value = "";
  }
});

if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthFeedback("register");
    const login = normalizeLoginValue(registerLoginInput?.value);
    const email = String(registerEmailInput?.value || "").trim();
    const password = String(registerPasswordInput?.value || "").trim();
    const confirmPassword = String(registerPasswordConfirmInput?.value || "").trim();

    if (!login || !email || !password || !confirmPassword) {
      showAuthError("Заполните все поля регистрации.", "register");
      return;
    }
    if (password !== confirmPassword) {
      showAuthError("Пароли не совпадают.", "register");
      return;
    }
    const passwordError = validateStrongPasswordClient(password);
    if (passwordError) {
      showAuthError(`Пароль слишком слабый: ${passwordError}`, "register");
      return;
    }

    if (!socket.connected) {
      socket.connect();
    }
    const response = await emitWithAck("registerAccount", {
      login,
      email,
      password,
      color: (colorInput && colorInput.value) || "#38bdf8",
      avatarId: customAvatar ? null : selectedAvatarId || avatarCatalog[0]?.id || null,
      avatar: customAvatar || null,
      avatarOriginal: customAvatarOriginal || customAvatar || null,
    });

    if (!response?.ok) {
      showAuthError(response?.message || "Не удалось зарегистрироваться.", "register");
      return;
    }

    if (response?.requiresVerification) {
      if (verifyLoginInput) verifyLoginInput.value = login;
      if (verifyForm && verifyForm.classList.contains("hidden")) {
        verifyForm.classList.remove("hidden");
      }
      if (verifyToggle) verifyToggle.textContent = "Скрыть подтверждение";
      showAuthFeedback(
        "verify",
        response?.message || "Письмо с кодом отправлено. Подтвердите почту.",
        "success"
      );
      return;
    }

    clearAllAuthFeedback();
    applyServerUserToSession(response.user, { sessionToken: response.sessionToken });
    loadHiddenDirectDialogs();
    loadVisibleDirectDialogs();
    lastJoinSignature = "";
    openChatScreen({ restoreLastChat: false });
    joinCurrentUserIfNeeded(true);
    if (loginPasswordInput) {
      loginPasswordInput.value = "";
    }
  });
}

if (verifySendCodeButton) {
  verifySendCodeButton.addEventListener("click", async () => {
    clearAuthFeedback("verify");
    const login = normalizeLoginValue(verifyLoginInput?.value);
    if (!login) {
      showAuthError("Укажите ник для отправки кода подтверждения.", "verify");
      return;
    }
    if (!socket.connected) {
      socket.connect();
    }
    const response = await emitWithAck("requestEmailVerification", { login });
    if (!response?.ok) {
      showAuthError(response?.message || "Не удалось отправить код.", "verify");
      return;
    }
    showAuthFeedback("verify", response?.message || "Код подтверждения отправлен.", "success");
  });
}

if (verifyForm) {
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthFeedback("verify");
    const login = normalizeLoginValue(verifyLoginInput?.value);
    const code = String(verifyCodeInput?.value || "").trim();
    if (!login || !code) {
      showAuthError("Введите ник и код подтверждения.", "verify");
      return;
    }
    if (!socket.connected) {
      socket.connect();
    }
    const response = await emitWithAck("verifyEmailCode", { login, code });
    if (!response?.ok) {
      showAuthError(response?.message || "Не удалось подтвердить почту.", "verify");
      return;
    }
    showAuthFeedback(
      "verify",
      response?.message || "Почта подтверждена. Теперь можно войти.",
      "success"
    );
    if (verifyCodeInput) verifyCodeInput.value = "";
  });
}

if (resetSendCodeButton) {
  resetSendCodeButton.addEventListener("click", async () => {
    clearAuthFeedback("reset");
    if (resetSendCodeButton.disabled) {
      showAuthError(
        "Очистите оба поля нового пароля, чтобы снова запросить код.",
        "reset"
      );
      return;
    }
    const email = String(resetEmailInput?.value || "").trim();
    if (!email) {
      showAuthError("Укажите почту для восстановления.", "reset");
      return;
    }
    if (!socket.connected) {
      socket.connect();
    }
    const loginForReset = normalizeLoginValue(loginInput?.value);
    const response = await emitWithAck("requestPasswordReset", {
      email,
      login: loginForReset || undefined,
    });
    if (!response?.ok) {
      showAuthError(response?.message || "Не удалось отправить код восстановления.", "reset");
      return;
    }
    showAuthFeedback("reset", response?.message || "Код восстановления отправлен.", "success");
  });
}

if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthFeedback("reset");
    const email = String(resetEmailInput?.value || "").trim();
    const code = String(resetCodeInput?.value || "").trim();
    const newPassword = String(resetPasswordInput?.value || "").trim();
    const confirmPassword = String(resetPasswordConfirmInput?.value || "").trim();

    if (!email || !code || !newPassword || !confirmPassword) {
      showAuthError("Заполните все поля восстановления.", "reset");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAuthError("Пароли не совпадают.", "reset");
      return;
    }
    const passwordError = validateStrongPasswordClient(newPassword);
    if (passwordError) {
      showAuthError(`Пароль слишком слабый: ${passwordError}`, "reset");
      return;
    }
    if (!socket.connected) {
      socket.connect();
    }
    const response = await emitWithAck("confirmPasswordReset", {
      email,
      code,
      newPassword,
    });
    if (!response?.ok) {
      showAuthError(response?.message || "Не удалось сменить пароль.", "reset");
      return;
    }
    if (response?.login) {
      if (loginInput) loginInput.value = response.login;
      if (registerLoginInput) registerLoginInput.value = response.login;
    }
    showAuthFeedback(
      "reset",
      response?.login
        ? `${response?.message || "Пароль изменён."} Логин для входа: ${response.login}`
        : response?.message || "Пароль изменён. Можно входить.",
      "success"
    );
    if (resetCodeInput) resetCodeInput.value = "";
    if (resetPasswordInput) resetPasswordInput.value = "";
    if (resetPasswordConfirmInput) resetPasswordConfirmInput.value = "";
    updateResetSendCodeAvailability();
  });
}


messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isUploading) return;

  if (editTarget) {
    await submitMessageEditFromComposer();
    return;
  }

  const text = messageInput.value.trim();
  const files = Array.from((attachmentInput && attachmentInput.files) || []);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (!text && files.length === 0) return;

  const cooldownRemaining = getSendCooldownRemainingMs();
  if (cooldownRemaining > 0) {
    showSendCooldownNotice(cooldownRemaining);
    return;
  }

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
  const isNotesChat = activeChat.type === "notes";
  const isDirectChat =
    activeChat.type === "direct" && activeChat.partner && activeChat.partner !== currentLogin;
  if (!isDirectChat && !isNotesChat && isPublicChatExcluded) {
    pushChatNotification({
      title: "Публичный чат",
      body: "Вы исключены из публичного чата.",
      autoDismissMs: 2600,
      autoDismissWhenVisible: true,
    });
    return;
  }
  const directPartner = isDirectChat ? activeChat.partner : null;
  const mentionFromText =
    !isDirectChat && !isNotesChat && !mentionTarget ? detectMentionTarget(text) : null;
  const mentionTo =
    !isDirectChat && !isNotesChat && mentionTarget && mentionTarget !== currentLogin
      ? mentionTarget
      : !isNotesChat && mentionFromText && mentionFromText !== currentLogin
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
    editedAt: null,
    chatType: isDirectChat ? "direct" : isNotesChat ? "notes" : "public",
    mentionTo,
  };

  if (isDirectChat && directPartner) {
    if (isDirectDialogHidden(directPartner)) {
      restoreHiddenDialog(directPartner, { openChat: false, makeVisible: true });
    } else {
      addVisibleDirectDialog(directPartner);
    }
    getDirectHistory(directPartner).push(localPayload);
    renderUserList();
  } else if (isNotesChat) {
    personalNotes.push(localPayload);
    persistPersonalNotes();
  } else {
    mergePublicHistoryEntries([localPayload], { mode: "append", reset: false });
    if (publicHistoryState.isInitialized) {
      publicHistoryState.total = Math.max(publicHistoryState.total + 1, publicHistory.length);
    }
  }

  if (isNotesChat) {
    renderActiveChat();
  } else {
    renderMessage(localPayload);
  }

  // на сервер отправляем объект, а не голую строку
  if (isDirectChat && directPartner) {
    socket.emit("directMessage", {
      messageId,
      text,
      to: directPartner,
      replyTo: replyTarget ? { ...replyTarget } : null,
      attachments: uploadedAttachments,
    });
  } else if (!isNotesChat) {
    socket.emit("chatMessage", {
      messageId,
      text,
      replyTo: replyTarget ? { ...replyTarget } : null,
      attachments: uploadedAttachments,
      mentionTo,
    });
  }
  lastSentMessageAt = Date.now();

  messageInput.value = "";
  resetComposerLinkPreview();
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
  hideEmojiPanel();
  forceScrollToBottomAfterOwnSend();
});


socket.on("connect", () => {
  chatStatus.textContent = "Подключено";
  chatStatus.style.color = "var(--accent)";
  lastJoinSignature = "";
  joinCurrentUserIfNeeded(true);
});

socket.on("disconnect", () => {
  chatStatus.textContent = "Отключено";
  chatStatus.style.color = "#f97373";
});

socket.on("sessionInvalid", (payload) => {
  if (!currentSessionToken) return;
  performLogout({ skipServer: true });
  showAuthError(payload?.message || "Сессия истекла. Войдите заново.", "login");
});

socket.on("publicChatAccessDenied", (payload) => {
  isPublicChatExcluded = true;
  if (activeChat.type === "public") {
    setActiveChat("home");
  }
  pushChatNotification({
    title: "Публичный чат",
    body: payload?.message || "Вы исключены из публичного чата.",
    autoDismissMs: 3000,
    autoDismissWhenVisible: true,
  });
});

socket.on("chatRoomMembersUpdated", () => {
  void refreshPublicParticipants({ silent: true });
  if (chatMembersModal && !chatMembersModal.classList.contains("hidden")) {
    void loadChatMembersForCurrentRoom({ silent: true });
  }
});

socket.on("sendRateLimited", (payload) => {
  const remainingMs = Math.max(0, Number(payload?.remainingMs) || SEND_COOLDOWN_MS);
  syncSendCooldown(remainingMs);
  showSendCooldownNotice(remainingMs);
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
setInterval(() => {
  syncPresenceActivity();
}, PRESENCE_HEARTBEAT_MS);

socket.on("history", (items) => {
  const source = Array.isArray(items) ? items : [];
  const filtered = source.filter((item) => botsEnabled || !item?.isBot);
  mergePublicHistoryEntries(filtered, { mode: "append", reset: true });
  publicHistoryState.total = Math.max(publicHistoryState.total, publicHistory.length);
  publicHistoryState.isInitialized = true;

  if (activeChat.type === "public") {
    renderActiveChat();
  }
});

socket.on("publicHistoryMeta", (meta) => {
  updatePublicHistoryPaging(meta, { markInitialized: true });
});

socket.on("directDialogs", (dialogs) => {
  if (!Array.isArray(dialogs)) return;
  const dialogPartners = new Set();

  dialogs.forEach((dialog) => {
    const partner = normalizeLoginValue(dialog?.partner);
    if (!partner || isSameLogin(partner, currentLogin)) return;
    dialogPartners.add(partner);

    setDirectDialogVisual(partner, {
      color: dialog?.partnerColor,
      avatar: dialog?.partnerAvatar,
      avatarId: dialog?.partnerAvatarId,
      avatarOriginal: dialog?.partnerAvatarOriginal,
    });

    const state = getDirectHistoryPaging(partner);
    if (!state) return;

    if (dialog?.lastMessage) {
      mergeDirectHistoryEntries(partner, [dialog.lastMessage], {
        mode: "append",
        reset: false,
      });
    } else {
      getDirectHistory(partner);
    }

    const totalValue = Number(dialog?.total);
    const knownCount = getDirectHistory(partner).length;
    const totalCount =
      Number.isFinite(totalValue) && totalValue >= 0
        ? totalValue
        : knownCount;

    state.total = totalCount;
    if (!state.isInitialized) {
      state.nextCursor = null;
    }

    const unreadValue = Math.max(0, Number(dialog?.unread) || 0);
    if (activeChat.type === "direct" && isSameLogin(activeChat.partner, partner)) {
      clearDirectUnread(partner);
    } else if (unreadValue > 0) {
      if (isDirectDialogHidden(partner)) {
        restoreHiddenDialog(partner, { openChat: false, makeVisible: true });
      }
      directUnreadCounts.set(partner, unreadValue);
    } else {
      directUnreadCounts.delete(partner);
    }
  });

  Array.from(directUnreadCounts.keys()).forEach((partner) => {
    if (!dialogPartners.has(partner) && getDirectHistory(partner).length === 0) {
      directUnreadCounts.delete(partner);
    }
  });

  renderUserList();
  notifyDirectUnreadSummary();
  if (activeChat.type === "direct" && activeChat.partner) {
    void ensureDirectHistoryLoaded(activeChat.partner);
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
    editedAt,
    reactions,
    myReaction,
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
    reactions: reactions && typeof reactions === "object" ? reactions : {},
    myReaction: typeof myReaction === "string" ? myReaction : null,
    readAll: Boolean(readAll),
    editedAt: editedAt || null,
    local: false,
    chatType: "public",
  };
  const beforeLength = publicHistory.length;
  mergePublicHistoryEntries([entry], { mode: "append", reset: false });
  if (publicHistory.length <= beforeLength) return;
  if (publicHistoryState.isInitialized) {
    publicHistoryState.total = Math.max(publicHistoryState.total + 1, publicHistory.length);
  }
  const latestEntry = publicHistory[publicHistory.length - 1];

  if (activeChat.type === "public") {
    renderMessage(latestEntry);
  } else {
    registerPublicUnread();
    renderChatRoomsList();
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
  const login = normalizeLoginValue(payload?.login);
  const to = normalizeLoginValue(payload?.to);

  if (!login || isSameLogin(login, currentLogin)) return;
  if (to && !isSameLogin(to, currentLogin)) return;
  const partner = normalizeLoginValue(isSameLogin(login, currentLogin) ? to : login);
  if (!partner) return;

  if (isSameLogin(login, partner)) {
    setDirectDialogVisual(partner, {
      color: payload?.color,
      avatar: payload?.avatar,
      avatarId: payload?.avatarId,
      avatarOriginal: payload?.avatarOriginal,
    });
  }

  const history = getDirectHistory(partner);
  const beforeLength = history.length;
  mergeDirectHistoryEntries(partner, [{
    ...payload,
    reactions: payload?.reactions && typeof payload.reactions === "object" ? payload.reactions : {},
    myReaction: typeof payload?.myReaction === "string" ? payload.myReaction : null,
  }], {
    mode: "append",
    reset: false,
  });
  if (history.length <= beforeLength) {
    return;
  }

  const entry = history[history.length - 1];
  const state = getDirectHistoryPaging(partner);
  if (state?.isInitialized) {
    state.total = Math.max(state.total + 1, history.length);
  }

  if (activeChat.type === "direct" && isSameLogin(activeChat.partner, partner)) {
    renderMessage(entry);
    void markDirectDialogReadOnServer(partner);
  } else {
    if (isDirectDialogHidden(partner)) {
      restoreHiddenDialog(partner, { openChat: false, makeVisible: true });
    }
    registerDirectUnread(partner);
    playNotification("direct");
  }
  renderUserList();
});

socket.on("chatMessageEdited", (payload) => {
  applyPublicMessageEdited(payload);
});

socket.on("directMessageEdited", (payload) => {
  applyDirectMessageEdited(payload);
});

socket.on("chatMessageDeleted", (payload) => {
  applyPublicMessageDeleted(payload);
});

socket.on("directMessageDeleted", (payload) => {
  applyDirectMessageDeleted(payload);
});

socket.on("messageReactionUpdated", (payload) => {
  const messageId = String(payload?.messageId || "").trim();
  if (!messageId) return;
  applyReactionPayload(messageId, payload?.reactions, null);
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
  if (participantsModal && !participantsModal.classList.contains("hidden")) {
    renderParticipantsModalList();
  }
});

socket.on("contactsList", (items) => {
  applyContacts(items);
  renderUserList();
});

socket.on("chatRooms", (rooms) => {
  applyChatRooms(rooms);
  renderUserList();
  updateChatHeader();
  if (activeChat.type === "public") {
    renderActiveChat();
  }
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

function getLatestPartnerVisualFromHistory(partner) {
  const normalizedPartner = normalizeLoginValue(partner);
  if (!normalizedPartner) return null;
  const history = getDirectHistory(normalizedPartner);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (!entry || !isSameLogin(entry.login, normalizedPartner)) continue;
    return {
      color: entry.color || null,
      avatar: entry.avatar || null,
      avatarId: entry.avatarId || null,
      avatarOriginal: entry.avatarOriginal || entry.avatar || null,
    };
  }
  return null;
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
  const userAvatar =
    user && typeof user.avatar === "string" && user.avatar.trim()
      ? user.avatar
      : null;
  const userAvatarOriginal =
    user && typeof user.avatarOriginal === "string" && user.avatarOriginal.trim()
      ? user.avatarOriginal
      : null;
  const resolvedAvatarId =
    (user && !userAvatar && user.avatarId) || fallbackAvatarId;
  const avatarUrl =
    userAvatar ||
    fallbackAvatar ||
    getAvatarById(resolvedAvatarId) ||
    getAvatarForLogin(name);
  const avatarOriginal =
    userAvatarOriginal ||
    fallbackAvatarOriginal ||
    userAvatar ||
    fallbackAvatar ||
    avatarUrl;
  return { color, avatarUrl, avatarOriginal };
}

function createUserListItem({
  name,
  color,
  avatarUrl,
  avatarOriginal = null,
  avatarLogin = null,
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
  avatar.dataset.full = avatarOriginal || avatarUrl;
  avatar.classList.add("is-clickable");
  avatar.title = `Открыть аватар ${name}`;
  avatar.addEventListener("click", async (event) => {
    event.stopPropagation();
    const fallbackSrc = avatar.dataset.full || avatar.src;
    const resolvedLogin = normalizeLoginValue(avatarLogin);
    if (resolvedLogin) {
      await openAvatarLightboxByLogin(resolvedLogin, fallbackSrc, `Аватар ${name}`);
      return;
    }
    openLightbox(fallbackSrc, `Аватар ${name}`);
  });
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

function renderChatRoomsList() {
  if (!chatRoomsList) return;
  chatRoomsList.innerHTML = "";

  const rooms = getChatRoomsSafe();
  rooms.forEach((room) => {
    const title = String(room?.title || "").trim() || DEFAULT_CHAT_ROOM_TITLE;
    const color = getColorForLogin(title);
    const avatarUrl =
      (typeof room?.avatar === "string" && room.avatar.trim() && room.avatar) ||
      getAvatarById(room?.avatarId) ||
      getAvatarForLogin(title);
    const avatarOriginal =
      (typeof room?.avatarOriginal === "string" &&
        room.avatarOriginal.trim() &&
        room.avatarOriginal) ||
      avatarUrl;
    const roomId = String(room?.id || DEFAULT_CHAT_ROOM_ID);
    const showPublicUnread =
      activeChat.type !== "public" &&
      String(currentChatRoomId || "") === roomId;
    const li = createUserListItem({
      name: title,
      color,
      avatarUrl,
      avatarOriginal,
      unreadCount: showPublicUnread ? publicUnreadCount : 0,
      isClickable: true,
      isActive: activeChat.type === "public" && String(currentChatRoomId || "") === roomId,
    });
    li.classList.add("chat-room-item");
    li.addEventListener("click", () => {
      currentChatRoomId = roomId;
      setActiveChat("public");
    });
    chatRoomsList.appendChild(li);
  });
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
    avatarOriginal,
    avatarLogin: currentLogin,
    isSelf: true,
  });
  li.title = "Открыть личные заметки";
  li.classList.add("is-clickable");
  li.addEventListener("click", () => {
    setActiveChat("notes");
  });

  selfList.appendChild(li);
}

function renderDirectList(onlineLogins) {
  if (!directList) return;
  directList.innerHTML = "";

  const partners = new Set(Array.from(visibleDirectDialogs));
  directHistories.forEach((history, partner) => {
    if (!Array.isArray(history) || history.length === 0) return;
    const hasLocalOutgoing = history.some(
      (entry) => entry?.local && isSameLogin(entry?.login, currentLogin)
    );
    if (hasLocalOutgoing) {
      partners.add(partner);
    }
  });
  directUnreadCounts.forEach((count, partner) => {
    if (Number(count) > 0) {
      partners.add(partner);
    }
  });
  partners.delete(currentLogin);

  const items = Array.from(partners)
    .filter((partner) => !isDirectDialogHidden(partner))
    .map((partner) => {
      const history = getDirectHistory(partner);
      const unreadCount = Math.max(0, Number(directUnreadCounts.get(partner) || 0));
      const lastEntry = history[history.length - 1] || null;
      const cachedVisual = getDirectDialogVisual(partner);
      const onlineUser = getOnlineUser(partner);
      const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({
        name: partner,
        user: onlineUser,
        fallbackColor: cachedVisual?.color,
        fallbackAvatar: cachedVisual?.avatar,
        fallbackAvatarId: cachedVisual?.avatarId,
        fallbackAvatarOriginal: cachedVisual?.avatarOriginal,
      });
      return {
        partner,
        color,
        avatarUrl,
        avatarOriginal,
        unreadCount,
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
    const li = createUserListItem({
      name: item.partner,
      color: item.color,
      avatarUrl: item.avatarUrl,
      avatarOriginal: item.avatarOriginal,
      avatarLogin: item.partner,
      unreadCount: item.unreadCount,
      isClickable: true,
      isActive: activeChat.type === "direct" && activeChat.partner === item.partner,
      isOnline: onlineLogins.has(String(item.partner || "").toLowerCase()),
    });
    li.classList.add("direct-dialog-item");
    const hideButton = document.createElement("button");
    hideButton.type = "button";
    hideButton.className = "direct-hide-button";
    hideButton.textContent = "✕";
    hideButton.title = "Скрыть диалог";
    hideButton.setAttribute("aria-label", `Скрыть диалог с ${item.partner}`);
    hideButton.addEventListener("click", (event) => {
      event.stopPropagation();
      hideDirectDialog(item.partner);
      if (activeChat.type === "direct" && isSameLogin(activeChat.partner, item.partner)) {
        setActiveChat("home");
      } else {
        renderUserList();
      }
    });
    li.appendChild(hideButton);
    li.addEventListener("click", () => {
      setActiveChat("direct", item.partner);
    });
    directList.appendChild(li);
  });
}

function renderContactsList() {
  if (!usersList) return;
  usersList.innerHTML = "";

  const onlineLogins = new Set(
    lastUserList
      .map((user) => normalizeUserName(user))
      .filter((name) => name && !isSameLogin(name, currentLogin))
      .map((name) => String(name).toLowerCase())
  );
  const contacts = Array.isArray(contactEntries) ? contactEntries : [];

  if (contacts.length === 0) {
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Контакты пока не добавлены";
    usersList.appendChild(empty);
    return;
  }

  contacts.forEach((contact) => {
    const name = normalizeLoginValue(contact?.login);
    if (!name || isSameLogin(name, currentLogin)) return;
    const onlineUser = getOnlineUser(name);
    const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({
      name,
      user: onlineUser,
      fallbackColor: contact?.color,
      fallbackAvatar: contact?.avatar,
      fallbackAvatarId: contact?.avatarId,
      fallbackAvatarOriginal: contact?.avatarOriginal,
    });
    const li = createUserListItem({
      name,
      color,
      avatarUrl,
      avatarOriginal,
      avatarLogin: name,
      unreadCount: directUnreadCounts.get(name) || 0,
      isClickable: true,
      isActive: activeChat.type === "direct" && isSameLogin(activeChat.partner, name),
      isOnline: onlineLogins.has(String(name).toLowerCase()),
    });
    li.addEventListener("click", () => {
      setActiveChat("direct", name);
    });
    usersList.appendChild(li);
  });
}

function renderOnlineList() {
  if (!onlineUsersList) return;
  onlineUsersList.innerHTML = "";

  const onlineUsers = lastUserList
    .map((user) => (typeof user === "string" ? { login: user } : user))
    .filter((user) => user?.login && !isSameLogin(user.login, currentLogin))
    .sort((a, b) =>
      String(a.login || "").localeCompare(String(b.login || ""), "ru", {
        sensitivity: "base",
      })
    );

  if (onlineUsers.length === 0) {
    const empty = document.createElement("li");
    empty.className = "users-empty";
    empty.textContent = "Сейчас никого онлайн";
    onlineUsersList.appendChild(empty);
    return;
  }

  onlineUsers.forEach((user) => {
    const name = normalizeLoginValue(user.login);
    if (!name) return;
    const { color, avatarUrl, avatarOriginal } = resolveUserVisuals({ name, user });
    const li = createUserListItem({
      name,
      color,
      avatarUrl,
      avatarOriginal,
      avatarLogin: name,
      isClickable: true,
      isOnline: true,
    });
    li.addEventListener("click", () => {
      openProfileCard({ name, color, avatarUrl, avatarOriginal });
    });
    onlineUsersList.appendChild(li);
  });
}

function renderUserList() {
  const onlineLogins = new Set(
    lastUserList
      .map((user) => normalizeUserName(user))
      .filter(Boolean)
      .map((login) => String(login).toLowerCase())
  );

  renderChatRoomsList();
  renderSelfUser();
  renderDirectList(onlineLogins);
  renderContactsList();
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
