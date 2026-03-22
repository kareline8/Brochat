const path = require("path");
const express = require("express");
const http = require("http");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_AVATAR_BYTES = 12 * 1024 * 1024;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: MAX_UPLOAD_BYTES,
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const users = new Map(); // socket.id -> { login, color }
const messageReadState = new Map();
const sendCooldownState = new Map();
const MESSAGE_COOLDOWN_MS = 3000;
const PUBLIC_HISTORY_PAGE_DEFAULT = 40;
const PUBLIC_HISTORY_PAGE_MAX = 100;
const DIRECT_HISTORY_PAGE_DEFAULT = 40;
const DIRECT_HISTORY_PAGE_MAX = 100;
const CONTACT_SEARCH_PAGE_DEFAULT = 30;
const CONTACT_SEARCH_PAGE_MAX = 60;
const SESSION_TTL_DAYS = 30;
const EMAIL_CODE_TTL_MINUTES = 15;
const PASSWORD_RESET_TTL_MINUTES = 15;
const AUTH_CODE_SECOND_SEND_COOLDOWN_SECONDS = 60;
const AUTH_CODE_NEXT_SEND_COOLDOWN_SECONDS = 15 * 60;
const MAX_LOGIN_FAILED_ATTEMPTS = 5;
const LOGIN_BLOCK_MINUTES = 15;
const DEFAULT_CHAT_ROOM_ID = "bro_chat_main";
const DEFAULT_CHAT_ROOM_TITLE = "БРО ЧАТ";
const DEFAULT_CHAT_ROOM_AVATAR_ID = "cool";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_SECURE = String(process.env.SMTP_SECURE || "true").toLowerCase() !== "false";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "noreply@brochat.local";
const MAIL_FALLBACK_ENABLED =
  String(
    process.env.MAIL_FALLBACK_ENABLED ||
      (String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "false" : "true")
  ).toLowerCase() === "true";

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, "chat.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS public_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    login TEXT NOT NULL,
    color TEXT,
    avatar_id TEXT,
    avatar TEXT,
    avatar_original TEXT,
    text TEXT NOT NULL,
    reply_to_json TEXT NOT NULL DEFAULT 'null',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    timestamp TEXT NOT NULL,
    mention_to TEXT,
    read_all INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT NOT NULL UNIQUE,
    convo_key TEXT NOT NULL,
    from_login TEXT NOT NULL,
    from_login_norm TEXT NOT NULL,
    to_login TEXT NOT NULL,
    to_login_norm TEXT NOT NULL,
    color TEXT,
    avatar_id TEXT,
    avatar TEXT,
    avatar_original TEXT,
    text TEXT NOT NULL,
    reply_to_json TEXT NOT NULL DEFAULT 'null',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    timestamp TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    login TEXT NOT NULL,
    login_norm TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    email_norm TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_verified INTEGER NOT NULL DEFAULT 0,
    email_verify_code TEXT,
    email_verify_expires TEXT,
    password_reset_code TEXT,
    password_reset_expires TEXT,
    auth_code_send_step INTEGER NOT NULL DEFAULT 0,
    auth_code_last_sent_at TEXT,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    login_blocked_until TEXT,
    color TEXT,
    avatar_id TEXT,
    avatar TEXT,
    avatar_original TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_contacts (
    user_id INTEGER NOT NULL,
    contact_user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, contact_user_id),
    FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS direct_dialog_reads (
    user_id INTEGER NOT NULL,
    partner_login_norm TEXT NOT NULL,
    last_read_direct_id INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, partner_login_norm),
    FOREIGN KEY (user_id) REFERENCES user_accounts(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_rooms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    avatar_id TEXT,
    avatar TEXT,
    avatar_original TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_public_messages_id
    ON public_messages(id);
  CREATE INDEX IF NOT EXISTS idx_public_messages_message_id
    ON public_messages(message_id);
  CREATE INDEX IF NOT EXISTS idx_direct_messages_convo_id
    ON direct_messages(convo_key, id);
  CREATE INDEX IF NOT EXISTS idx_direct_messages_participants
    ON direct_messages(from_login_norm, to_login_norm);
  CREATE INDEX IF NOT EXISTS idx_user_accounts_login_norm
    ON user_accounts(login_norm);
  CREATE INDEX IF NOT EXISTS idx_user_accounts_email_norm
    ON user_accounts(email_norm);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
    ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
    ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_user_contacts_user
    ON user_contacts(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_contacts_contact
    ON user_contacts(contact_user_id);
  CREATE INDEX IF NOT EXISTS idx_direct_dialog_reads_user
    ON direct_dialog_reads(user_id);
`);

function ensureTableColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((col) => col?.name === columnName);
  if (exists) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

ensureTableColumn("user_accounts", "email_verified", "INTEGER NOT NULL DEFAULT 0");
ensureTableColumn("user_accounts", "email_verify_code", "TEXT");
ensureTableColumn("user_accounts", "email_verify_expires", "TEXT");
ensureTableColumn("user_accounts", "password_reset_code", "TEXT");
ensureTableColumn("user_accounts", "password_reset_expires", "TEXT");
ensureTableColumn("user_accounts", "auth_code_send_step", "INTEGER NOT NULL DEFAULT 0");
ensureTableColumn("user_accounts", "auth_code_last_sent_at", "TEXT");
ensureTableColumn("user_accounts", "failed_login_count", "INTEGER NOT NULL DEFAULT 0");
ensureTableColumn("user_accounts", "login_blocked_until", "TEXT");
ensureTableColumn("public_messages", "edited_at", "TEXT");
ensureTableColumn("direct_messages", "edited_at", "TEXT");

const insertPublicMessageStmt = db.prepare(`
  INSERT OR IGNORE INTO public_messages (
    message_id, login, color, avatar_id, avatar, avatar_original,
    text, reply_to_json, attachments_json, timestamp, mention_to, read_all, edited_at
  ) VALUES (
    @message_id, @login, @color, @avatar_id, @avatar, @avatar_original,
    @text, @reply_to_json, @attachments_json, @timestamp, @mention_to, @read_all, @edited_at
  )
`);
const updatePublicReadAllStmt = db.prepare(`
  UPDATE public_messages
  SET read_all = 1
  WHERE message_id = ?
`);
const publicMessageByIdStmt = db.prepare(`
  SELECT *
  FROM public_messages
  WHERE message_id = ?
`);
const updatePublicMessageEditStmt = db.prepare(`
  UPDATE public_messages
  SET
    text = @text,
    mention_to = @mention_to,
    edited_at = @edited_at
  WHERE message_id = @message_id
`);
const publicCountStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM public_messages
`);
const publicPageLatestStmt = db.prepare(`
  SELECT *
  FROM public_messages
  ORDER BY id DESC
  LIMIT ?
`);
const publicPageBeforeStmt = db.prepare(`
  SELECT *
  FROM public_messages
  WHERE id < ?
  ORDER BY id DESC
  LIMIT ?
`);
const publicHasOlderStmt = db.prepare(`
  SELECT EXISTS(
    SELECT 1
    FROM public_messages
    WHERE id < ?
  ) AS has_older
`);

const insertDirectMessageStmt = db.prepare(`
  INSERT OR IGNORE INTO direct_messages (
    message_id, convo_key, from_login, from_login_norm, to_login, to_login_norm,
    color, avatar_id, avatar, avatar_original, text, reply_to_json, attachments_json, timestamp, edited_at
  ) VALUES (
    @message_id, @convo_key, @from_login, @from_login_norm, @to_login, @to_login_norm,
    @color, @avatar_id, @avatar, @avatar_original, @text, @reply_to_json, @attachments_json, @timestamp, @edited_at
  )
`);
const directMessageByIdStmt = db.prepare(`
  SELECT *
  FROM direct_messages
  WHERE message_id = ?
`);
const updateDirectMessageEditStmt = db.prepare(`
  UPDATE direct_messages
  SET
    text = @text,
    edited_at = @edited_at
  WHERE message_id = @message_id
`);
const directCountByConvoStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM direct_messages
  WHERE convo_key = ?
`);
const directPageLatestStmt = db.prepare(`
  SELECT *
  FROM direct_messages
  WHERE convo_key = ?
  ORDER BY id DESC
  LIMIT ?
`);
const directPageBeforeStmt = db.prepare(`
  SELECT *
  FROM direct_messages
  WHERE convo_key = ? AND id < ?
  ORDER BY id DESC
  LIMIT ?
`);
const directHasOlderStmt = db.prepare(`
  SELECT EXISTS(
    SELECT 1
    FROM direct_messages
    WHERE convo_key = ? AND id < ?
  ) AS has_older
`);
const directDialogsStmt = db.prepare(`
  SELECT
    m.*,
    agg.total AS total
  FROM direct_messages m
  INNER JOIN (
    SELECT
      convo_key,
      MAX(id) AS max_id,
      COUNT(*) AS total
    FROM direct_messages
    WHERE from_login_norm = ? OR to_login_norm = ?
    GROUP BY convo_key
  ) AS agg
    ON agg.convo_key = m.convo_key
   AND agg.max_id = m.id
  ORDER BY m.id DESC
`);
const directDialogReadStateStmt = db.prepare(`
  SELECT last_read_direct_id
  FROM direct_dialog_reads
  WHERE user_id = @user_id
    AND partner_login_norm = @partner_login_norm
`);
const directUnreadForDialogStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM direct_messages dm
  WHERE dm.convo_key = @convo_key
    AND dm.to_login_norm = @login_norm
    AND dm.id > @last_read_direct_id
`);
const directLatestIncomingIdStmt = db.prepare(`
  SELECT MAX(id) AS max_id
  FROM direct_messages
  WHERE convo_key = @convo_key
    AND to_login_norm = @login_norm
`);
const upsertDirectDialogReadStmt = db.prepare(`
  INSERT INTO direct_dialog_reads (
    user_id, partner_login_norm, last_read_direct_id, updated_at
  ) VALUES (
    @user_id, @partner_login_norm, @last_read_direct_id, @updated_at
  )
  ON CONFLICT(user_id, partner_login_norm) DO UPDATE SET
    last_read_direct_id = CASE
      WHEN excluded.last_read_direct_id > direct_dialog_reads.last_read_direct_id
      THEN excluded.last_read_direct_id
      ELSE direct_dialog_reads.last_read_direct_id
    END,
    updated_at = excluded.updated_at
`);
const insertUserAccountStmt = db.prepare(`
  INSERT INTO user_accounts (
    login, login_norm, email, email_norm, password_hash, email_verified,
    email_verify_code, email_verify_expires, password_reset_code, password_reset_expires,
    failed_login_count, login_blocked_until,
    color, avatar_id, avatar, avatar_original, created_at, updated_at
  ) VALUES (
    @login, @login_norm, @email, @email_norm, @password_hash, @email_verified,
    @email_verify_code, @email_verify_expires, @password_reset_code, @password_reset_expires,
    @failed_login_count, @login_blocked_until,
    @color, @avatar_id, @avatar, @avatar_original, @created_at, @updated_at
  )
`);
const userAccountByIdStmt = db.prepare(`
  SELECT *
  FROM user_accounts
  WHERE id = ?
`);
const userAccountByLoginNormStmt = db.prepare(`
  SELECT *
  FROM user_accounts
  WHERE login_norm = ?
`);
const userAccountByEmailNormStmt = db.prepare(`
  SELECT *
  FROM user_accounts
  WHERE email_norm = ?
`);
const updateUserProfileStmt = db.prepare(`
  UPDATE user_accounts
  SET
    login = @login,
    login_norm = @login_norm,
    color = @color,
    avatar_id = @avatar_id,
    avatar = @avatar,
    avatar_original = @avatar_original,
    updated_at = @updated_at
  WHERE id = @id
`);
const updateUserPasswordStmt = db.prepare(`
  UPDATE user_accounts
  SET
    password_hash = @password_hash,
    password_reset_code = NULL,
    password_reset_expires = NULL,
    failed_login_count = 0,
    login_blocked_until = NULL,
    updated_at = @updated_at
  WHERE id = @id
`);
const updateUserVerificationCodeStmt = db.prepare(`
  UPDATE user_accounts
  SET
    email_verify_code = @email_verify_code,
    email_verify_expires = @email_verify_expires,
    auth_code_send_step = @auth_code_send_step,
    auth_code_last_sent_at = @auth_code_last_sent_at,
    updated_at = @updated_at
  WHERE id = @id
`);
const markEmailVerifiedStmt = db.prepare(`
  UPDATE user_accounts
  SET
    email_verified = 1,
    email_verify_code = NULL,
    email_verify_expires = NULL,
    updated_at = @updated_at
  WHERE id = @id
`);
const updatePasswordResetCodeStmt = db.prepare(`
  UPDATE user_accounts
  SET
    password_reset_code = @password_reset_code,
    password_reset_expires = @password_reset_expires,
    auth_code_send_step = @auth_code_send_step,
    auth_code_last_sent_at = @auth_code_last_sent_at,
    updated_at = @updated_at
  WHERE id = @id
`);
const registerFailedLoginStmt = db.prepare(`
  UPDATE user_accounts
  SET
    failed_login_count = @failed_login_count,
    login_blocked_until = @login_blocked_until,
    updated_at = @updated_at
  WHERE id = @id
`);
const clearFailedLoginStmt = db.prepare(`
  UPDATE user_accounts
  SET
    failed_login_count = 0,
    login_blocked_until = NULL,
    updated_at = @updated_at
  WHERE id = @id
`);
const insertUserSessionStmt = db.prepare(`
  INSERT INTO user_sessions (
    token, user_id, created_at, expires_at
  ) VALUES (
    @token, @user_id, @created_at, @expires_at
  )
`);
const deleteUserSessionStmt = db.prepare(`
  DELETE FROM user_sessions
  WHERE token = ?
`);
const deleteExpiredSessionsStmt = db.prepare(`
  DELETE FROM user_sessions
  WHERE expires_at <= ?
`);
const accountBySessionTokenStmt = db.prepare(`
  SELECT
    a.*,
    s.token AS session_token,
    s.expires_at AS session_expires_at
  FROM user_sessions s
  INNER JOIN user_accounts a
    ON a.id = s.user_id
  WHERE s.token = ?
`);
const insertUserContactStmt = db.prepare(`
  INSERT OR IGNORE INTO user_contacts (
    user_id, contact_user_id, created_at
  ) VALUES (
    @user_id, @contact_user_id, @created_at
  )
`);
const deleteUserContactStmt = db.prepare(`
  DELETE FROM user_contacts
  WHERE user_id = @user_id
    AND contact_user_id = @contact_user_id
`);
const contactsForUserStmt = db.prepare(`
  SELECT
    a.*
  FROM user_contacts uc
  INNER JOIN user_accounts a
    ON a.id = uc.contact_user_id
  WHERE uc.user_id = @user_id
    AND a.login_norm <> @login_norm
  ORDER BY a.login COLLATE NOCASE ASC
`);
const searchUsersPageStmt = db.prepare(`
  SELECT
    a.*,
    CASE WHEN uc.contact_user_id IS NULL THEN 0 ELSE 1 END AS is_contact
  FROM user_accounts a
  LEFT JOIN user_contacts uc
    ON uc.user_id = @user_id
   AND uc.contact_user_id = a.id
  WHERE a.login_norm <> @self_login_norm
    AND (@query_norm = '' OR a.login_norm LIKE @query_like)
  ORDER BY is_contact DESC, a.login_norm ASC
  LIMIT @limit OFFSET @offset
`);
const searchUsersCountStmt = db.prepare(`
  SELECT COUNT(*) AS total
  FROM user_accounts a
  WHERE a.login_norm <> @self_login_norm
    AND (@query_norm = '' OR a.login_norm LIKE @query_like)
`);
const chatRoomByIdStmt = db.prepare(`
  SELECT *
  FROM chat_rooms
  WHERE id = ?
`);
const chatRoomsAllStmt = db.prepare(`
  SELECT *
  FROM chat_rooms
  ORDER BY datetime(created_at) ASC
`);
const insertChatRoomStmt = db.prepare(`
  INSERT INTO chat_rooms (
    id, title, avatar_id, avatar, avatar_original, created_at, updated_at
  ) VALUES (
    @id, @title, @avatar_id, @avatar, @avatar_original, @created_at, @updated_at
  )
`);
const updateChatRoomSettingsStmt = db.prepare(`
  UPDATE chat_rooms
  SET
    title = @title,
    avatar_id = @avatar_id,
    avatar = @avatar,
    avatar_original = @avatar_original,
    updated_at = @updated_at
  WHERE id = @id
`);
deleteExpiredSessionsStmt.run(new Date().toISOString());

// включать ли тестовых ботов (dev-режим)
const ENABLE_TEST_BOTS = false;


// --- тестовые боты для нагрузки чата ---

const BOT_NAMES = [
  "Аня", "Кирилл", "Сергей", "Марина", "Игорь",
  "Лена", "Дима", "Юля", "Павел", "Оля",
  "Никита", "Света", "Костя", "Вика", "Рома",
  "Надя", "Антон", "Катя", "Женя", "Маша"
];

const BOT_COLORS = [
  "#38bdf8",
  "#a855f7",
  "#f97316",
  "#22c55e",
  "#eab308",
  "#f472b6",
  "#2dd4bf",
  "#fb7185",
];

const AVATAR_OPTIONS = [
  { id: "cool", emoji: "😎", accent: "#38bdf8" },
  { id: "spark", emoji: "⚡", accent: "#a855f7" },
  { id: "heart", emoji: "❤️", accent: "#f97316" },
  { id: "leaf", emoji: "🌿", accent: "#22c55e" },
  { id: "sun", emoji: "🌞", accent: "#eab308" },
  { id: "music", emoji: "🎧", accent: "#f472b6" },
  { id: "bubble", emoji: "🫧", accent: "#2dd4bf" },
  { id: "star", emoji: "⭐", accent: "#fb7185" },
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

const AVATAR_CATALOG = AVATAR_OPTIONS.map((option) => ({
  ...option,
  uri: buildAvatarDataUri(option),
}));
const AVATAR_MAP = new Map(AVATAR_CATALOG.map((option) => [option.id, option.uri]));

function getAvatarById(id) {
  return (id && AVATAR_MAP.get(id)) || null;
}

function getAvatarForName(login) {
  const name = (login || "guest").toLowerCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AVATAR_CATALOG.length;
  return AVATAR_CATALOG[index].uri;
}

function truncateText(text, limit) {
  const chars = Array.from(String(text ?? ""));
  return chars.slice(0, limit).join("");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectMentionTarget(text, senderLogin) {
  if (!text) return "";
  const trimmed = String(text).trim();
  if (!trimmed) return "";

  const candidates = Array.from(users.values())
    .map((user) => user?.login)
    .filter((login) => login && login !== senderLogin)
    .sort((a, b) => b.length - a.length);

  for (const login of candidates) {
    const pattern = new RegExp(`^@?${escapeRegExp(login)}([,.:\\s]|$)`, "i");
    if (pattern.test(trimmed)) {
      return login;
    }
  }

  return "";
}

function sanitizeAvatar(avatar) {
  if (!avatar || typeof avatar !== "string") return null;
  if (!avatar.startsWith("data:image/")) return null;
  if (Buffer.byteLength(avatar, "utf8") > MAX_AVATAR_BYTES) return null;
  return avatar;
}

const BOT_MESSAGES = [
  // 1 строка
  "Короткий тест без переноса.",
  "Просто одно предложение, чтобы проверить ширину.",

  // 2 строки
  "Проверка двух строк сообщения.\nСмотрим, как ведёт себя рамка.",
  "Тут есть перенос строки.\nВидно, что пузырь растягивается по контенту.",

  // 3 строки
  "Сообщение на три строки.\nПервая строка — приветствие.\nВторая и третья создают объём.",
  "Живой чат всегда разный.\nКто-то пишет много.\nКто-то — пару слов и исчезает.",

  // 4 строки
  "Это тестовое сообщение для нагрузки.\nТут сразу несколько строк.\nПусть скролл крутится, как в реальном чате.\nИнтерфейс должен вести себя спокойно.",
  "Ещё один пример длинного текста.\nПроверяем высоту пузыря.\nСмотрим, как ведёт себя градиент.\nИ как выравниваются рамки у соседних сообщений.",

  // 5 строк
  "Сообщение на пять строк.\nИногда пользователи любят писать длинные абзацы.\nОсобенно, когда рассказывают историю или кидают инструкцию.\nЧат не должен ломаться из-за этого.\nПросто аккуратно растягиваем блок по высоте.",
  "Ещё один вариант.\nМожно писать списки, псевдо-абзацы.\nГлавное, чтобы всё читалось комфортно.\nШирина пузыря ограничена, чтобы глаз не уставал.\nВысота растёт только по содержимому.",

  // 6 строк
  "Максимально длинный тест.\nПервая строка — заголовок.\nВторая — пояснение.\nТретья — просто шум.\nЧетвёртая — ещё немного текста.\nПятая и шестая проверяют крайние случаи.",
  "Когда чат наполнен длинными сообщениями,\nважно, чтобы верстка не поехала.\nЭти строки нужны именно для этого.\nСкролл должен работать плавно.\nРамки не должны ломаться.\nИ ничего не должно вываливаться за пределы окна.",

  // ссылки: голые домены и с протоколами
  "Проверяем ссылки: ya.ru и google.com — они должны быть кликабельными.",
  "Смешиваем текст и ссылку.\nВот короткий абзац, а вот ссылка: https://ya.ru — смотри, как она подсвечивается.",
  "Немного болтовни и пара доменов.\nНапример, yandex.ru/maps и www.google.com/search — для наглядности работы парсера URL.",
  "Тут всего две строки.\nНо внутри есть ссылка на vk.com и youtube.com — пузырь по ширине зависит от текста, а ссылки живут своей жизнью.",
  "Иногда сообщение может быть почти пустым.\nНапример, просто ссылка: https://www.google.com\nНо чат всё равно должен отображать её красиво.",
  "Комбо из текста и ссылок.\nСначала обычный текст.\nПотом ya.ru, потом https://yandex.ru/news.\nИ в конце ещё google.com, чтобы было разнообразнее.",
];


let botsStarted = false;

// --- утилиты для ботов ---

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startTestBots() {
  if (!ENABLE_TEST_BOTS) return;
  if (botsStarted) return;
  botsStarted = true;

  BOT_NAMES.forEach((login, index) => {
    const color = BOT_COLORS[index % BOT_COLORS.length];
    const avatarOption = AVATAR_CATALOG[index % AVATAR_CATALOG.length];
    const avatarId = avatarOption?.id || null;
    const avatar = avatarOption?.uri || getAvatarForName(login);

    const loop = () => {
      const delay = randomInt(3000, 60000); // 3–60 секунд
      setTimeout(() => {
        const text =
          BOT_MESSAGES[randomInt(0, BOT_MESSAGES.length - 1)];

        const payload = {
          messageId: generateMessageId(),
          login,
          color,
          avatarId,
          avatar,
          avatarOriginal: avatar,
          text,
          isBot: true,
          timestamp: new Date().toISOString(),
          attachments: [],
          replyTo: null,
          mentionTo: null,
          readAll: false,
        };

        savePublicMessage(payload);

        io.emit("chatMessage", payload);

        loop(); // следующее сообщение этого бота
      }, delay);
    };

    loop();
  });

  console.log(`Тестовые боты запущены: ${BOT_NAMES.length} шт.`);
}

function buildSafeFilename(originalName) {
  const baseName = path
    .basename(originalName || "file", path.extname(originalName || ""))
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  const ext = path.extname(originalName || "");
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${baseName || "file"}-${uniqueSuffix}${ext}`;
}

function getPayloadSize(file) {
  if (!file) return 0;
  if (typeof file.size === "number") return file.size;
  if (Buffer.isBuffer(file.data)) return file.data.length;
  if (file.data && file.data.type === "Buffer" && Array.isArray(file.data.data)) {
    return file.data.data.length;
  }
  if (Array.isArray(file.data)) return file.data.length;
  if (file.data && typeof file.data.byteLength === "number") {
    return file.data.byteLength;
  }
  if (typeof file.data === "string") {
    return Buffer.byteLength(file.data, "base64");
  }
  return 0;
}

function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data.type === "Buffer" && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (typeof data === "string") {
    return Buffer.from(data, "base64");
  }
  return null;
}

function generateMessageId() {
  return `msg-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLoginDisplay(value) {
  return String(value || "").trim().slice(0, 20);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function normalizeEmailDisplay(value) {
  return String(value || "").trim().slice(0, 120);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function sanitizeColor(value) {
  const candidate = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
    return candidate;
  }
  return "#38bdf8";
}

function validateStrongPassword(password) {
  const value = String(password || "");
  if (value.length < 8) {
    return { ok: false, message: "Пароль должен содержать минимум 8 символов." };
  }
  if (!/[A-Za-zА-Яа-яЁё]/.test(value)) {
    return { ok: false, message: "Пароль должен содержать хотя бы одну букву." };
  }
  if (!/\d/.test(value)) {
    return { ok: false, message: "Пароль должен содержать хотя бы одну цифру." };
  }
  return { ok: true, message: "" };
}

function hashOneTimeCode(code) {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function generateOneTimeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getFutureIso(minutes) {
  return new Date(Date.now() + Number(minutes) * 60 * 1000).toISOString();
}

function parseIsoTimestamp(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

class AuthCodeRateLimitError extends Error {
  constructor(retryAfterSec) {
    super(`Следующий код можно запросить через ${formatSecondsAsWait(retryAfterSec)}.`);
    this.name = "AuthCodeRateLimitError";
    this.retryAfterSec = Math.max(1, Number(retryAfterSec) || 1);
  }
}

function formatSecondsAsWait(seconds) {
  const safeSeconds = Math.max(1, Number(seconds) || 1);
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  if (mins <= 0) {
    return `${secs} сек`;
  }
  if (secs === 0) {
    return `${mins} мин`;
  }
  return `${mins} мин ${secs} сек`;
}

function getAuthCodeCooldownSeconds(step) {
  const safeStep = Math.max(0, Number(step) || 0);
  if (safeStep <= 0) return 0;
  if (safeStep === 1) return AUTH_CODE_SECOND_SEND_COOLDOWN_SECONDS;
  return AUTH_CODE_NEXT_SEND_COOLDOWN_SECONDS;
}

function getNextAuthCodeStep(step) {
  return Math.min(2, Math.max(0, Number(step) || 0) + 1);
}

function getAuthCodeRateLimitState(account) {
  const currentStep = Math.max(0, Number(account?.auth_code_send_step) || 0);
  const cooldownMs = getAuthCodeCooldownSeconds(currentStep) * 1000;
  const lastSentAt = parseIsoTimestamp(account?.auth_code_last_sent_at);
  if (!cooldownMs || !lastSentAt) {
    return { currentStep, retryAfterSec: 0 };
  }
  const remainingMs = cooldownMs - (Date.now() - lastSentAt);
  return {
    currentStep,
    retryAfterSec: Math.max(0, Math.ceil(remainingMs / 1000)),
  };
}

function assertCanIssueAuthCode(account) {
  const state = getAuthCodeRateLimitState(account);
  if (state.retryAfterSec > 0) {
    throw new AuthCodeRateLimitError(state.retryAfterSec);
  }
}

function isBlockedAccount(account) {
  const blockedUntil = parseIsoTimestamp(account?.login_blocked_until);
  return blockedUntil > Date.now();
}

function getRemainingBlockSeconds(account) {
  const blockedUntil = parseIsoTimestamp(account?.login_blocked_until);
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

function buildMailTransport() {
  if (!nodemailer) return null;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !Number.isFinite(SMTP_PORT)) {
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

let mailTransport = buildMailTransport();

function maskEmailForLogs(value) {
  const email = normalizeEmailDisplay(value);
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return email;
  return `${email.slice(0, 1)}***${email.slice(atIndex)}`;
}

async function sendEmail({ to, subject, text }) {
  const recipient = normalizeEmailDisplay(to);
  if (!recipient) return false;
  if (!mailTransport) {
    if (MAIL_FALLBACK_ENABLED) {
      console.warn(
        `[mail fallback] to=${recipient} subject="${subject}" body="${text.replace(/\s+/g, " ").trim()}"`
      );
      return true;
    }
    throw new Error("SMTP transport is not configured");
  }

  const fromValue = MAIL_FROM.includes("<")
    ? MAIL_FROM
    : `BRO CHAT <${MAIL_FROM}>`;
  const maskedRecipient = maskEmailForLogs(recipient);

  try {
    const info = await mailTransport.sendMail({
      from: fromValue,
      to: recipient,
      subject,
      text,
    });
    console.log(
      `[mail sent] to=${maskedRecipient} subject="${subject}" messageId="${info?.messageId || "-"}"`
    );
    return true;
  } catch (firstError) {
    console.error(
      `[mail send error] to=${maskedRecipient} subject="${subject}" error="${firstError?.message || firstError}"`
    );

    // Повторная попытка с пересозданием транспорта на случай временного сбоя SMTP.
    mailTransport = buildMailTransport();
    if (!mailTransport) {
      throw firstError;
    }
    const retryInfo = await mailTransport.sendMail({
      from: fromValue,
      to: recipient,
      subject,
      text,
    });
    console.log(
      `[mail sent retry] to=${maskedRecipient} subject="${subject}" messageId="${retryInfo?.messageId || "-"}"`
    );
    return true;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string") return false;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;
  if (!salt || !expectedHash) return false;
  const actualHash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getSessionExpiryIso() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function cleanupExpiredSessions() {
  deleteExpiredSessionsStmt.run(new Date().toISOString());
}

function mapAccountToUser(account) {
  if (!account) return null;
  return {
    accountId: Number(account.id),
    login: normalizeLoginDisplay(account.login) || "Гость",
    color: sanitizeColor(account.color),
    avatarId: account.avatar ? null : account.avatar_id || null,
    avatar: account.avatar || null,
    avatarOriginal: account.avatar_original || account.avatar || null,
    email: normalizeEmailDisplay(account.email),
  };
}

async function issueVerificationCode(account) {
  const freshAccount = userAccountByIdStmt.get(account?.id);
  if (!freshAccount) {
    throw new Error("Аккаунт не найден.");
  }
  assertCanIssueAuthCode(freshAccount);
  const code = generateOneTimeCode();
  const expiresAt = getFutureIso(EMAIL_CODE_TTL_MINUTES);
  const now = new Date().toISOString();
  const nextAuthCodeStep = getNextAuthCodeStep(freshAccount.auth_code_send_step);
  await sendEmail({
    to: freshAccount.email,
    subject: "BRO CHAT: код подтверждения почты",
    text: `Ваш код подтверждения: ${code}\nСрок действия: ${EMAIL_CODE_TTL_MINUTES} минут.`,
  });
  updateUserVerificationCodeStmt.run({
    id: freshAccount.id,
    email_verify_code: hashOneTimeCode(code),
    email_verify_expires: expiresAt,
    auth_code_send_step: nextAuthCodeStep,
    auth_code_last_sent_at: now,
    updated_at: now,
  });
}

async function issuePasswordResetCode(account) {
  const freshAccount = userAccountByIdStmt.get(account?.id);
  if (!freshAccount) {
    throw new Error("Аккаунт не найден.");
  }
  assertCanIssueAuthCode(freshAccount);
  const code = generateOneTimeCode();
  const expiresAt = getFutureIso(PASSWORD_RESET_TTL_MINUTES);
  const now = new Date().toISOString();
  const nextAuthCodeStep = getNextAuthCodeStep(freshAccount.auth_code_send_step);
  await sendEmail({
    to: freshAccount.email,
    subject: "BRO CHAT: код восстановления пароля",
    text: `Ваш код восстановления пароля: ${code}\nСрок действия: ${PASSWORD_RESET_TTL_MINUTES} минут.`,
  });
  updatePasswordResetCodeStmt.run({
    id: freshAccount.id,
    password_reset_code: hashOneTimeCode(code),
    password_reset_expires: expiresAt,
    auth_code_send_step: nextAuthCodeStep,
    auth_code_last_sent_at: now,
    updated_at: now,
  });
}

function registerFailedLogin(account) {
  const nextCount = Math.max(1, Number(account?.failed_login_count || 0) + 1);
  const blockedUntil =
    nextCount >= MAX_LOGIN_FAILED_ATTEMPTS ? getFutureIso(LOGIN_BLOCK_MINUTES) : null;
  registerFailedLoginStmt.run({
    id: account.id,
    failed_login_count: nextCount,
    login_blocked_until: blockedUntil,
    updated_at: new Date().toISOString(),
  });
  return { nextCount, blockedUntil };
}

function resolveAvatarPayload(login, { avatarId = null, avatar = null, avatarOriginal = null } = {}) {
  const safeAvatar = sanitizeAvatar(avatar);
  const safeAvatarOriginal = sanitizeAvatar(avatarOriginal);
  const safeAvatarId = safeAvatar ? null : avatarId ? String(avatarId).slice(0, 40) : null;
  const resolvedAvatar =
    safeAvatar || getAvatarById(safeAvatarId) || getAvatarForName(login);
  return {
    avatarId: safeAvatar ? null : safeAvatarId,
    avatar: resolvedAvatar,
    avatarOriginal: safeAvatarOriginal || resolvedAvatar,
  };
}

function mapAccountToListProfile(account, { isContact = false } = {}) {
  if (!account) return null;
  const login = normalizeLoginDisplay(account.login);
  if (!login) return null;
  const avatarPayload = resolveAvatarPayload(login, {
    avatarId: account.avatar ? null : account.avatar_id || null,
    avatar: account.avatar || null,
    avatarOriginal: account.avatar_original || account.avatar || null,
  });
  return {
    login,
    color: sanitizeColor(account.color),
    avatarId: avatarPayload.avatarId,
    avatar: avatarPayload.avatar,
    avatarOriginal: avatarPayload.avatarOriginal,
    isContact: Boolean(isContact),
  };
}

function getContactsForUser(user) {
  const userId = Number(user?.accountId || 0);
  const loginNorm = normalizeLogin(user?.login);
  if (!userId || !loginNorm) return [];
  const rows = contactsForUserStmt.all({
    user_id: userId,
    login_norm: loginNorm,
  });
  return rows
    .map((row) => mapAccountToListProfile(row, { isContact: true }))
    .filter(Boolean);
}

function addContactForUser(user, targetLogin) {
  const userId = Number(user?.accountId || 0);
  const ownerLoginNorm = normalizeLogin(user?.login);
  const targetLoginNorm = normalizeLogin(targetLogin);
  if (!userId || !ownerLoginNorm || !targetLoginNorm) {
    return { ok: false, message: "Некорректные данные контакта." };
  }
  if (ownerLoginNorm === targetLoginNorm) {
    return { ok: false, message: "Нельзя добавить себя в контакты." };
  }
  const targetAccount = userAccountByLoginNormStmt.get(targetLoginNorm);
  if (!targetAccount) {
    return { ok: false, message: "Пользователь не найден." };
  }
  insertUserContactStmt.run({
    user_id: userId,
    contact_user_id: Number(targetAccount.id),
    created_at: new Date().toISOString(),
  });
  return {
    ok: true,
    contact: mapAccountToListProfile(targetAccount, { isContact: true }),
  };
}

function removeContactForUser(user, targetLogin) {
  const userId = Number(user?.accountId || 0);
  const ownerLoginNorm = normalizeLogin(user?.login);
  const targetLoginNorm = normalizeLogin(targetLogin);
  if (!userId || !ownerLoginNorm || !targetLoginNorm) {
    return { ok: false, message: "Некорректные данные контакта." };
  }
  if (ownerLoginNorm === targetLoginNorm) {
    return { ok: false, message: "Нельзя удалить себя из контактов." };
  }
  const targetAccount = userAccountByLoginNormStmt.get(targetLoginNorm);
  if (!targetAccount) {
    return { ok: false, message: "Пользователь не найден." };
  }
  deleteUserContactStmt.run({
    user_id: userId,
    contact_user_id: Number(targetAccount.id),
  });
  return { ok: true };
}

function searchUsersForUser(
  user,
  { query = "", cursor = 0, limit = CONTACT_SEARCH_PAGE_DEFAULT } = {}
) {
  const userId = Number(user?.accountId || 0);
  const loginNorm = normalizeLogin(user?.login);
  if (!userId || !loginNorm) {
    return { items: [], nextCursor: null, total: 0 };
  }
  const normalizedQuery = normalizeLogin(query).slice(0, 20);
  const normalizedLimit = Math.max(
    1,
    Math.min(CONTACT_SEARCH_PAGE_MAX, Number(limit) || CONTACT_SEARCH_PAGE_DEFAULT)
  );
  const normalizedCursor = Math.max(0, Number(cursor) || 0);
  const queryLike = normalizedQuery ? `%${normalizedQuery}%` : "";
  const params = {
    user_id: userId,
    self_login_norm: loginNorm,
    query_norm: normalizedQuery,
    query_like: queryLike,
    limit: normalizedLimit,
    offset: normalizedCursor,
  };
  const rows = searchUsersPageStmt.all(params);
  const total = Number(searchUsersCountStmt.get(params)?.total || 0);
  const items = rows
    .map((row) => mapAccountToListProfile(row, { isContact: Boolean(row.is_contact) }))
    .filter(Boolean);
  const nextCursor = normalizedCursor + items.length < total ? normalizedCursor + items.length : null;
  return { items, nextCursor, total };
}

function mapChatRoom(row) {
  if (!row?.id) return null;
  const title = String(row.title || "").trim() || DEFAULT_CHAT_ROOM_TITLE;
  const avatarPayload = resolveAvatarPayload(title, {
    avatarId: row.avatar ? null : row.avatar_id || DEFAULT_CHAT_ROOM_AVATAR_ID,
    avatar: row.avatar || null,
    avatarOriginal: row.avatar_original || row.avatar || null,
  });
  return {
    id: String(row.id),
    title,
    avatarId: avatarPayload.avatarId,
    avatar: avatarPayload.avatar,
    avatarOriginal: avatarPayload.avatarOriginal,
  };
}

function ensureDefaultChatRoom() {
  const exists = chatRoomByIdStmt.get(DEFAULT_CHAT_ROOM_ID);
  if (exists) return;
  const now = new Date().toISOString();
  const avatarPayload = resolveAvatarPayload(DEFAULT_CHAT_ROOM_TITLE, {
    avatarId: DEFAULT_CHAT_ROOM_AVATAR_ID,
  });
  insertChatRoomStmt.run({
    id: DEFAULT_CHAT_ROOM_ID,
    title: DEFAULT_CHAT_ROOM_TITLE,
    avatar_id: avatarPayload.avatarId,
    avatar: avatarPayload.avatar,
    avatar_original: avatarPayload.avatarOriginal,
    created_at: now,
    updated_at: now,
  });
}

function getChatRooms() {
  ensureDefaultChatRoom();
  return chatRoomsAllStmt.all().map((row) => mapChatRoom(row)).filter(Boolean);
}

function createSessionForAccount(accountId) {
  cleanupExpiredSessions();
  const token = createSessionToken();
  const now = new Date().toISOString();
  const expiresAt = getSessionExpiryIso();
  insertUserSessionStmt.run({
    token,
    user_id: accountId,
    created_at: now,
    expires_at: expiresAt,
  });
  return { token, expiresAt };
}

function getAccountBySessionToken(token) {
  cleanupExpiredSessions();
  const safeToken = String(token || "").trim();
  if (!safeToken) return null;
  const row = accountBySessionTokenStmt.get(safeToken);
  if (!row) return null;
  if (row.session_expires_at <= new Date().toISOString()) {
    deleteUserSessionStmt.run(safeToken);
    return null;
  }
  return row;
}

function isSameLogin(a, b) {
  return normalizeLogin(a) === normalizeLogin(b);
}

function getDirectConversationKey(a, b) {
  const first = normalizeLogin(a);
  const second = normalizeLogin(b);
  if (!first || !second) return "";
  return first < second ? `${first}::${second}` : `${second}::${first}`;
}

function safeJsonStringify(value, fallback) {
  try {
    return JSON.stringify(value ?? fallback);
  } catch (_) {
    return JSON.stringify(fallback);
  }
}

function safeJsonParse(raw, fallback) {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function mapPublicRowToPayload(row) {
  if (!row) return null;
  return {
    messageId: row.message_id,
    login: row.login,
    color: row.color || null,
    avatarId: row.avatar_id || null,
    avatar: row.avatar || null,
    avatarOriginal: row.avatar_original || row.avatar || null,
    text: row.text || "",
    replyTo: safeJsonParse(row.reply_to_json, null),
    attachments: safeJsonParse(row.attachments_json, []),
    timestamp: row.timestamp,
    editedAt: row.edited_at || null,
    readAll: Boolean(row.read_all),
    mentionTo: row.mention_to || null,
  };
}

function mapDirectRowToPayload(row) {
  if (!row) return null;
  return {
    messageId: row.message_id,
    login: row.from_login,
    color: row.color || null,
    avatarId: row.avatar_id || null,
    avatar: row.avatar || null,
    avatarOriginal: row.avatar_original || row.avatar || null,
    text: row.text || "",
    replyTo: safeJsonParse(row.reply_to_json, null),
    attachments: safeJsonParse(row.attachments_json, []),
    timestamp: row.timestamp,
    editedAt: row.edited_at || null,
    to: row.to_login,
  };
}

function savePublicMessage(payload) {
  const messageId = String(payload?.messageId || generateMessageId()).slice(0, 80);
  insertPublicMessageStmt.run({
    message_id: messageId,
    login: normalizeLoginDisplay(payload?.login) || "Гость",
    color: payload?.color ? String(payload.color).slice(0, 20) : null,
    avatar_id: payload?.avatarId ? String(payload.avatarId).slice(0, 40) : null,
    avatar: payload?.avatar ? String(payload.avatar) : null,
    avatar_original: payload?.avatarOriginal ? String(payload.avatarOriginal) : null,
    text: String(payload?.text || ""),
    reply_to_json: safeJsonStringify(payload?.replyTo || null, null),
    attachments_json: safeJsonStringify(
      Array.isArray(payload?.attachments) ? payload.attachments : [],
      []
    ),
    timestamp: payload?.timestamp || new Date().toISOString(),
    mention_to: payload?.mentionTo ? normalizeLoginDisplay(payload.mentionTo) : null,
    read_all: payload?.readAll ? 1 : 0,
    edited_at: payload?.editedAt || null,
  });
}

function getPublicHistoryPage(beforeCursor, limit) {
  const normalizedLimit = Math.max(
    1,
    Math.min(PUBLIC_HISTORY_PAGE_MAX, Number(limit) || PUBLIC_HISTORY_PAGE_DEFAULT)
  );
  const parsedBefore = Number(beforeCursor);
  const rowsDesc =
    Number.isInteger(parsedBefore) && parsedBefore > 0
      ? publicPageBeforeStmt.all(parsedBefore, normalizedLimit)
      : publicPageLatestStmt.all(normalizedLimit);
  const total = Number(publicCountStmt.get()?.total || 0);

  if (rowsDesc.length === 0) {
    return { items: [], nextCursor: null, total };
  }

  const minId = Number(rowsDesc[rowsDesc.length - 1].id || 0);
  const hasOlder = Boolean(publicHasOlderStmt.get(minId)?.has_older);
  const items = rowsDesc
    .slice()
    .reverse()
    .map((row) => mapPublicRowToPayload(row))
    .filter(Boolean);

  return {
    items,
    nextCursor: hasOlder ? minId : null,
    total,
  };
}

function pushDirectMessage(from, to, payload) {
  const fromLogin = normalizeLoginDisplay(from || payload?.login);
  const toLogin = normalizeLoginDisplay(to || payload?.to);
  if (!fromLogin || !toLogin) return;

  const convoKey = getDirectConversationKey(fromLogin, toLogin);
  if (!convoKey) return;

  const messageId = String(payload?.messageId || generateMessageId()).slice(0, 80);
  insertDirectMessageStmt.run({
    message_id: messageId,
    convo_key: convoKey,
    from_login: fromLogin,
    from_login_norm: normalizeLogin(fromLogin),
    to_login: toLogin,
    to_login_norm: normalizeLogin(toLogin),
    color: payload?.color ? String(payload.color).slice(0, 20) : null,
    avatar_id: payload?.avatarId ? String(payload.avatarId).slice(0, 40) : null,
    avatar: payload?.avatar ? String(payload.avatar) : null,
    avatar_original: payload?.avatarOriginal ? String(payload.avatarOriginal) : null,
    text: String(payload?.text || ""),
    reply_to_json: safeJsonStringify(payload?.replyTo || null, null),
    attachments_json: safeJsonStringify(
      Array.isArray(payload?.attachments) ? payload.attachments : [],
      []
    ),
    timestamp: payload?.timestamp || new Date().toISOString(),
    edited_at: payload?.editedAt || null,
  });
}

function markDirectDialogReadForUser(user, partnerLogin) {
  const userId = Number(user?.accountId || 0);
  const loginNorm = normalizeLogin(user?.login);
  const partnerNorm = normalizeLogin(partnerLogin);
  if (!userId || !loginNorm || !partnerNorm || partnerNorm === loginNorm) return 0;
  const convoKey = getDirectConversationKey(user.login, partnerLogin);
  if (!convoKey) return 0;
  const latestIncomingId = Math.max(
    0,
    Number(
      directLatestIncomingIdStmt.get({
        convo_key: convoKey,
        login_norm: loginNorm,
      })?.max_id || 0
    )
  );
  upsertDirectDialogReadStmt.run({
    user_id: userId,
    partner_login_norm: partnerNorm,
    last_read_direct_id: latestIncomingId,
    updated_at: new Date().toISOString(),
  });
  return latestIncomingId;
}

function getDirectDialogUnreadCount({
  userId,
  loginNorm,
  partnerNorm,
  convoKey,
  bootstrapReadState = false,
}) {
  if (!userId || !loginNorm || !partnerNorm || !convoKey) return 0;
  const existingReadState = directDialogReadStateStmt.get({
    user_id: userId,
    partner_login_norm: partnerNorm,
  });
  let lastReadDirectId = Math.max(0, Number(existingReadState?.last_read_direct_id || 0));
  if (!existingReadState && bootstrapReadState) {
    lastReadDirectId = Math.max(
      0,
      Number(
        directLatestIncomingIdStmt.get({
          convo_key: convoKey,
          login_norm: loginNorm,
        })?.max_id || 0
      )
    );
    upsertDirectDialogReadStmt.run({
      user_id: userId,
      partner_login_norm: partnerNorm,
      last_read_direct_id: lastReadDirectId,
      updated_at: new Date().toISOString(),
    });
  }
  return Math.max(
    0,
    Number(
      directUnreadForDialogStmt.get({
        convo_key: convoKey,
        login_norm: loginNorm,
        last_read_direct_id: lastReadDirectId,
      })?.total || 0
    )
  );
}

function getDirectDialogsForUser(user, { bootstrapReadState = false } = {}) {
  const loginNorm = normalizeLogin(user?.login);
  const userId = Number(user?.accountId || 0);
  if (!loginNorm || !userId) return [];

  const rows = directDialogsStmt.all(loginNorm, loginNorm);
  return rows
    .map((row) => {
      const lastMessage = mapDirectRowToPayload(row);
      if (!lastMessage) return null;
      const partner = normalizeLogin(row.from_login) === loginNorm ? row.to_login : row.from_login;
      const normalizedPartner = normalizeLogin(partner);
      const partnerAccount = normalizedPartner
        ? userAccountByLoginNormStmt.get(normalizedPartner)
        : null;
      const unread = getDirectDialogUnreadCount({
        userId,
        loginNorm,
        partnerNorm: normalizedPartner,
        convoKey: row.convo_key,
        bootstrapReadState,
      });
      return {
        partner: normalizeLoginDisplay(partner),
        partnerColor: sanitizeColor(partnerAccount?.color),
        partnerAvatarId: partnerAccount?.avatar ? null : partnerAccount?.avatar_id || null,
        partnerAvatar: partnerAccount?.avatar || null,
        partnerAvatarOriginal:
          partnerAccount?.avatar_original || partnerAccount?.avatar || null,
        total: Number(row.total || 0),
        unread,
        lastMessage,
      };
    })
    .filter(Boolean);
}

function getDirectHistoryPage(login, partner, beforeCursor, limit) {
  const owner = normalizeLoginDisplay(login);
  const normalizedPartner = normalizeLoginDisplay(partner);
  const normalizedPartnerNorm = normalizeLogin(normalizedPartner);
  const partnerAccount = normalizedPartnerNorm
    ? userAccountByLoginNormStmt.get(normalizedPartnerNorm)
    : null;
  const partnerColor = sanitizeColor(partnerAccount?.color);
  const partnerAvatar = partnerAccount?.avatar || null;
  const partnerAvatarId = partnerAvatar ? null : partnerAccount?.avatar_id || null;
  const partnerAvatarOriginal = partnerAccount?.avatar_original || partnerAvatar || null;
  if (!owner || !normalizedPartner || isSameLogin(owner, normalizedPartner)) {
    return {
      partner: normalizedPartner,
      partnerColor,
      partnerAvatarId,
      partnerAvatar,
      partnerAvatarOriginal,
      items: [],
      nextCursor: null,
      total: 0,
    };
  }

  const convoKey = getDirectConversationKey(owner, normalizedPartner);
  if (!convoKey) {
    return {
      partner: normalizedPartner,
      partnerColor,
      partnerAvatarId,
      partnerAvatar,
      partnerAvatarOriginal,
      items: [],
      nextCursor: null,
      total: 0,
    };
  }

  const total = Number(directCountByConvoStmt.get(convoKey)?.total || 0);
  const normalizedLimit = Math.max(
    1,
    Math.min(DIRECT_HISTORY_PAGE_MAX, Number(limit) || DIRECT_HISTORY_PAGE_DEFAULT)
  );
  const parsedBefore = Number(beforeCursor);
  const rowsDesc =
    Number.isInteger(parsedBefore) && parsedBefore > 0
      ? directPageBeforeStmt.all(convoKey, parsedBefore, normalizedLimit)
      : directPageLatestStmt.all(convoKey, normalizedLimit);

  if (rowsDesc.length === 0) {
    return {
      partner: normalizedPartner,
      partnerColor,
      partnerAvatarId,
      partnerAvatar,
      partnerAvatarOriginal,
      items: [],
      nextCursor: null,
      total,
    };
  }

  const minId = Number(rowsDesc[rowsDesc.length - 1].id || 0);
  const hasOlder = Boolean(directHasOlderStmt.get(convoKey, minId)?.has_older);
  const items = rowsDesc
    .slice()
    .reverse()
    .map((row) => mapDirectRowToPayload(row))
    .filter(Boolean);

  return {
    partner: normalizedPartner,
    partnerColor,
    partnerAvatarId,
    partnerAvatar,
    partnerAvatarOriginal,
    items,
    nextCursor: hasOlder ? minId : null,
    total,
  };
}

function getSocketIdsByLogin(login) {
  const target = normalizeLogin(login);
  if (!target) return [];
  return Array.from(users.entries())
    .filter(([, user]) => normalizeLogin(user.login) === target)
    .map(([socketId]) => socketId);
}

function emitCurrentUserList() {
  const uniqueByLogin = new Map();
  Array.from(users.values()).forEach((user) => {
    if (!user) return;
    const key = normalizeLogin(user.login);
    if (!key) return;
    if (!uniqueByLogin.has(key)) {
      uniqueByLogin.set(key, user);
    }
  });

  io.emit(
    "userList",
    Array.from(uniqueByLogin.values()).map((user) => ({
      login: user.login,
      color: user.color,
      avatarId: user.avatarId || null,
      avatar: user.avatar || null,
      avatarOriginal: user.avatarOriginal || user.avatar || null,
    }))
  );
}

function updateConnectedPresenceForAccount(account) {
  const mapped = mapAccountToUser(account);
  if (!mapped) return;
  users.forEach((user, socketId) => {
    if (Number(user.accountId) !== Number(mapped.accountId)) return;
    users.set(socketId, {
      ...user,
      ...mapped,
    });
  });
}

function markHistoryReadAll(messageId) {
  const targetId = String(messageId || "");
  if (!targetId) return;
  updatePublicReadAllStmt.run(targetId);
}

function getCooldownRemainingMs(login) {
  const key = normalizeLogin(login);
  if (!key) return 0;
  const lastSentAt = Number(sendCooldownState.get(key) || 0);
  const elapsed = Date.now() - lastSentAt;
  return Math.max(0, MESSAGE_COOLDOWN_MS - elapsed);
}

function markMessageSentNow(login) {
  const key = normalizeLogin(login);
  if (!key) return;
  sendCooldownState.set(key, Date.now());
}

function notifyReadAll(messageId) {
  io.emit("messageReadAll", { messageId });
  markHistoryReadAll(messageId);
  messageReadState.delete(messageId);
}

function ensureReadState(messageId, senderLogin) {
  if (messageReadState.has(messageId)) {
    return messageReadState.get(messageId);
  }
  const state = {
    expectedReaders: Math.max(1, users.size),
    readers: new Set([senderLogin]),
  };
  messageReadState.set(messageId, state);
  return state;
}

// --- обычная логика чата ---

ensureDefaultChatRoom();

io.on("connection", (socket) => {
  console.log("user connected:", socket.id);

  // как только зашёл первый живой человек — поднимаем ботов (если разрешено)
  if (ENABLE_TEST_BOTS && !botsStarted) {
    startTestBots();
  }

  socket.on("uploadFiles", async (payload, callback) => {
    try {
      const files = Array.isArray(payload?.files) ? payload.files : [];
      const totalBytes = files.reduce(
        (sum, file) => sum + getPayloadSize(file),
        0
      );

      if (totalBytes > MAX_UPLOAD_BYTES) {
        return callback?.({
          ok: false,
          message: "Суммарный размер вложений превышает 500 МБ.",
        });
      }

      const uploaded = [];

      for (const file of files) {
        if (!file || !file.name || !file.data) {
          continue;
        }
        const fileSize = getPayloadSize(file);
        if (fileSize > MAX_UPLOAD_BYTES) {
          return callback?.({
            ok: false,
            message: "Файл слишком большой. Максимум 500 МБ.",
          });
        }
        const buffer = toBuffer(file.data);
        if (!buffer || buffer.length === 0) {
          continue;
        }
        const filename = buildSafeFilename(file.name);
        const filePath = path.join(uploadsDir, filename);
        await fs.promises.writeFile(filePath, buffer);
        uploaded.push({
          name: String(file.name).slice(0, 120),
          size: buffer.length || fileSize,
          type: String(file.type || ""),
          url: `/uploads/${filename}`,
        });
      }

      return callback?.({ ok: true, files: uploaded });
    } catch (error) {
      console.error("upload error:", error);
      return callback?.({
        ok: false,
        message: "Не удалось загрузить вложения.",
      });
    }
  });

  socket.on("registerAccount", async (payload, callback) => {
    try {
      const login = normalizeLoginDisplay(payload?.login);
      const loginNorm = normalizeLogin(login);
      const email = normalizeEmailDisplay(payload?.email);
      const emailNorm = normalizeEmail(email);
      const password = String(payload?.password || "");

      if (!login || login.length < 3) {
        callback?.({ ok: false, message: "Ник должен быть не короче 3 символов." });
        return;
      }
      if (!email || !isValidEmail(email)) {
        callback?.({ ok: false, message: "Укажите корректную почту." });
        return;
      }
      const passwordCheck = validateStrongPassword(password);
      if (!passwordCheck.ok) {
        callback?.({ ok: false, message: passwordCheck.message });
        return;
      }
      if (userAccountByLoginNormStmt.get(loginNorm)) {
        callback?.({ ok: false, message: "Этот ник уже занят." });
        return;
      }
      if (userAccountByEmailNormStmt.get(emailNorm)) {
        callback?.({ ok: false, message: "Эта почта уже используется." });
        return;
      }

      const resolvedAvatar = resolveAvatarPayload(login, {
        avatarId: payload?.avatarId,
        avatar: payload?.avatar,
        avatarOriginal: payload?.avatarOriginal,
      });
      const now = new Date().toISOString();
      const insertResult = insertUserAccountStmt.run({
        login,
        login_norm: loginNorm,
        email,
        email_norm: emailNorm,
        password_hash: hashPassword(password),
        email_verified: 0,
        email_verify_code: null,
        email_verify_expires: null,
        password_reset_code: null,
        password_reset_expires: null,
        failed_login_count: 0,
        login_blocked_until: null,
        color: sanitizeColor(payload?.color),
        avatar_id: resolvedAvatar.avatarId,
        avatar: resolvedAvatar.avatar,
        avatar_original: resolvedAvatar.avatarOriginal,
        created_at: now,
        updated_at: now,
      });
      const account = userAccountByIdStmt.get(insertResult.lastInsertRowid);
      if (!account) {
        callback?.({ ok: false, message: "Не удалось создать аккаунт." });
        return;
      }
      await issueVerificationCode(account);
      callback?.({
        ok: true,
        requiresVerification: true,
        message: "Код подтверждения отправлен на почту. Подтвердите аккаунт перед входом.",
      });
    } catch (error) {
      if (error instanceof AuthCodeRateLimitError) {
        callback?.({
          ok: false,
          reason: "code_rate_limited",
          retryAfterSec: error.retryAfterSec,
          message: error.message,
        });
        return;
      }
      if (String(error?.message || "").includes("user_accounts.login_norm")) {
        callback?.({ ok: false, message: "Этот ник уже занят." });
        return;
      }
      if (String(error?.message || "").includes("user_accounts.email_norm")) {
        callback?.({ ok: false, message: "Эта почта уже используется." });
        return;
      }
      console.error("registerAccount error:", error);
      callback?.({ ok: false, message: "Ошибка регистрации. Попробуйте снова." });
    }
  });

  socket.on("loginAccount", (payload, callback) => {
    try {
      const login = normalizeLoginDisplay(payload?.login);
      const loginNorm = normalizeLogin(login);
      const password = String(payload?.password || "");

      if (!loginNorm || !password) {
        callback?.({ ok: false, message: "Введите ник и пароль." });
        return;
      }

      const account = userAccountByLoginNormStmt.get(loginNorm);
      if (!account) {
        callback?.({ ok: false, message: "Неверный ник или пароль." });
        return;
      }
      if (!verifyPassword(password, account.password_hash)) {
        callback?.({ ok: false, message: "Неверный ник или пароль." });
        return;
      }
      clearFailedLoginStmt.run({
        id: account.id,
        updated_at: new Date().toISOString(),
      });
      if (!Number(account.email_verified)) {
        callback?.({
          ok: false,
          reason: "email_not_verified",
          message: "Почта не подтверждена. Подтвердите кодом из письма.",
        });
        return;
      }

      const session = createSessionForAccount(account.id);
      callback?.({
        ok: true,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        user: mapAccountToUser(account),
      });
    } catch (error) {
      console.error("loginAccount error:", error);
      callback?.({ ok: false, message: "Ошибка входа. Попробуйте снова." });
    }
  });

  socket.on("requestEmailVerification", async (payload, callback) => {
    try {
      const login = normalizeLoginDisplay(payload?.login);
      const account = userAccountByLoginNormStmt.get(normalizeLogin(login));
      if (!account) {
        console.warn(`[mail verify request] account not found login="${login}"`);
        callback?.({ ok: false, message: "Аккаунт не найден." });
        return;
      }
      if (Number(account.email_verified)) {
        console.log(
          `[mail verify request] already verified login="${account.login}" email="${maskEmailForLogs(account.email)}"`
        );
        callback?.({ ok: true, message: "Почта уже подтверждена." });
        return;
      }
      await issueVerificationCode(account);
      console.log(
        `[mail verify request] code issued login="${account.login}" email="${maskEmailForLogs(account.email)}"`
      );
      callback?.({ ok: true, message: "Код подтверждения отправлен на почту." });
    } catch (error) {
      if (error instanceof AuthCodeRateLimitError) {
        callback?.({
          ok: false,
          reason: "code_rate_limited",
          retryAfterSec: error.retryAfterSec,
          message: error.message,
        });
        return;
      }
      console.error("requestEmailVerification error:", error);
      callback?.({ ok: false, message: "Не удалось отправить код подтверждения." });
    }
  });

  socket.on("verifyEmailCode", (payload, callback) => {
    try {
      const login = normalizeLoginDisplay(payload?.login);
      const code = String(payload?.code || "").trim();
      if (!login || !code) {
        callback?.({ ok: false, message: "Укажите ник и код подтверждения." });
        return;
      }
      const account = userAccountByLoginNormStmt.get(normalizeLogin(login));
      if (!account) {
        callback?.({ ok: false, message: "Аккаунт не найден." });
        return;
      }
      if (Number(account.email_verified)) {
        callback?.({ ok: true, message: "Почта уже подтверждена." });
        return;
      }
      const isCodeValid =
        account.email_verify_code &&
        hashOneTimeCode(code) === String(account.email_verify_code) &&
        parseIsoTimestamp(account.email_verify_expires) > Date.now();
      if (!isCodeValid) {
        callback?.({ ok: false, message: "Неверный или просроченный код." });
        return;
      }
      markEmailVerifiedStmt.run({
        id: account.id,
        updated_at: new Date().toISOString(),
      });
      callback?.({ ok: true, message: "Почта успешно подтверждена." });
    } catch (error) {
      console.error("verifyEmailCode error:", error);
      callback?.({ ok: false, message: "Не удалось подтвердить почту." });
    }
  });

  socket.on("requestPasswordReset", async (payload, callback) => {
    try {
      const email = normalizeEmailDisplay(payload?.email);
      const login = normalizeLoginDisplay(payload?.login);
      const account = userAccountByEmailNormStmt.get(normalizeEmail(email));
      if (!account) {
        console.warn(
          `[mail reset request] account not found email="${maskEmailForLogs(email)}"`
        );
        callback?.({ ok: false, message: "Эта почта не найдена." });
        return;
      }
      if (login && !isSameLogin(account.login, login)) {
        console.warn(
          `[mail reset request] login/email mismatch login="${login}" email="${maskEmailForLogs(email)}"`
        );
        callback?.({ ok: false, message: "Эта почта не найдена." });
        return;
      }
      if (!Number(account.email_verified)) {
        console.warn(
          `[mail reset request] email not verified login="${account.login}" email="${maskEmailForLogs(account.email)}"`
        );
        callback?.({ ok: false, message: "Сначала подтвердите почту аккаунта." });
        return;
      }
      await issuePasswordResetCode(account);
      console.log(
        `[mail reset request] code issued login="${account.login}" email="${maskEmailForLogs(account.email)}"`
      );
      callback?.({ ok: true, message: "Код восстановления отправлен на почту." });
    } catch (error) {
      if (error instanceof AuthCodeRateLimitError) {
        callback?.({
          ok: false,
          reason: "code_rate_limited",
          retryAfterSec: error.retryAfterSec,
          message: error.message,
        });
        return;
      }
      console.error("requestPasswordReset error:", error);
      callback?.({ ok: false, message: "Не удалось отправить код восстановления." });
    }
  });

  socket.on("confirmPasswordReset", (payload, callback) => {
    try {
      const email = normalizeEmailDisplay(payload?.email);
      const code = String(payload?.code || "").trim();
      const newPassword = String(payload?.newPassword || "");
      if (!email || !code || !newPassword) {
        callback?.({ ok: false, message: "Заполните все поля восстановления." });
        return;
      }
      const passwordCheck = validateStrongPassword(newPassword);
      if (!passwordCheck.ok) {
        callback?.({ ok: false, message: passwordCheck.message });
        return;
      }
      const account = userAccountByEmailNormStmt.get(normalizeEmail(email));
      if (!account) {
        callback?.({ ok: false, message: "Эта почта не найдена." });
        return;
      }
      const codeValid =
        account.password_reset_code &&
        hashOneTimeCode(code) === String(account.password_reset_code) &&
        parseIsoTimestamp(account.password_reset_expires) > Date.now();
      if (!codeValid) {
        callback?.({ ok: false, message: "Неверный или просроченный код." });
        return;
      }
      updateUserPasswordStmt.run({
        id: account.id,
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString(),
      });
      callback?.({
        ok: true,
        message: "Пароль успешно изменён.",
        login: normalizeLoginDisplay(account.login),
      });
    } catch (error) {
      console.error("confirmPasswordReset error:", error);
      callback?.({ ok: false, message: "Не удалось изменить пароль." });
    }
  });

  socket.on("updateProfile", (payload, callback) => {
    try {
      const token = String(payload?.sessionToken || "").trim();
      const account = getAccountBySessionToken(token);
      if (!account) {
        callback?.({
          ok: false,
          reason: "invalid_session",
          message: "Сессия истекла. Войдите заново.",
        });
        return;
      }

      const nextLogin = normalizeLoginDisplay(payload?.login || account.login);
      const nextLoginNorm = normalizeLogin(nextLogin);
      if (!nextLogin || nextLogin.length < 3) {
        callback?.({ ok: false, message: "Ник должен быть не короче 3 символов." });
        return;
      }

      const occupied = userAccountByLoginNormStmt.get(nextLoginNorm);
      if (occupied && Number(occupied.id) !== Number(account.id)) {
        callback?.({ ok: false, message: "Этот ник уже занят." });
        return;
      }

      const resolvedAvatar = resolveAvatarPayload(nextLogin, {
        avatarId: payload?.avatarId,
        avatar: payload?.avatar,
        avatarOriginal: payload?.avatarOriginal,
      });

      updateUserProfileStmt.run({
        id: account.id,
        login: nextLogin,
        login_norm: nextLoginNorm,
        color: sanitizeColor(payload?.color || account.color),
        avatar_id: resolvedAvatar.avatarId,
        avatar: resolvedAvatar.avatar,
        avatar_original: resolvedAvatar.avatarOriginal,
        updated_at: new Date().toISOString(),
      });

      const updatedAccount = userAccountByIdStmt.get(account.id);
      updateConnectedPresenceForAccount(updatedAccount);
      emitCurrentUserList();
      callback?.({
        ok: true,
        user: mapAccountToUser(updatedAccount),
      });
    } catch (error) {
      if (String(error?.message || "").includes("user_accounts.login_norm")) {
        callback?.({ ok: false, message: "Этот ник уже занят." });
        return;
      }
      console.error("updateProfile error:", error);
      callback?.({ ok: false, message: "Не удалось обновить профиль." });
    }
  });

  socket.on("changePassword", (payload, callback) => {
    try {
      const token = String(payload?.sessionToken || "").trim();
      const currentPassword = String(payload?.currentPassword || "");
      const newPassword = String(payload?.newPassword || "");
      const account = getAccountBySessionToken(token);

      if (!account) {
        callback?.({
          ok: false,
          reason: "invalid_session",
          message: "Сессия истекла. Войдите заново.",
        });
        return;
      }
      if (!currentPassword || !newPassword) {
        callback?.({ ok: false, message: "Заполните все поля пароля." });
        return;
      }
      if (!verifyPassword(currentPassword, account.password_hash)) {
        callback?.({ ok: false, message: "Текущий пароль введен неверно." });
        return;
      }
      const passwordCheck = validateStrongPassword(newPassword);
      if (!passwordCheck.ok) {
        callback?.({ ok: false, message: passwordCheck.message });
        return;
      }
      if (newPassword === currentPassword) {
        callback?.({ ok: false, message: "Новый пароль должен отличаться от текущего." });
        return;
      }

      updateUserPasswordStmt.run({
        id: account.id,
        password_hash: hashPassword(newPassword),
        updated_at: new Date().toISOString(),
      });
      callback?.({ ok: true });
    } catch (error) {
      console.error("changePassword error:", error);
      callback?.({ ok: false, message: "Не удалось сменить пароль." });
    }
  });

  socket.on("logout", (payload, callback) => {
    const token = String(payload?.sessionToken || "").trim();
    if (token) {
      deleteUserSessionStmt.run(token);
    }
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      socket.broadcast.emit("systemMessage", {
        kind: "leave",
        login: user.login,
        color: user.color,
        text: `${user.login} вышел из чата`,
      });
      emitCurrentUserList();
    }
    callback?.({ ok: true });
  });

  socket.on("join", (payload, callback) => {
    const sessionToken = String(payload?.sessionToken || "").trim();
    const account = getAccountBySessionToken(sessionToken);
    if (!account) {
      const message = "Сессия истекла. Войдите заново.";
      socket.emit("sessionInvalid", { message });
      callback?.({ ok: false, reason: "invalid_session", message });
      return;
    }
    if (!Number(account.email_verified)) {
      deleteUserSessionStmt.run(sessionToken);
      const message = "Почта не подтверждена. Подтвердите аккаунт перед входом.";
      socket.emit("sessionInvalid", { message });
      callback?.({ ok: false, reason: "email_not_verified", message });
      return;
    }

    const user = mapAccountToUser(account);
    if (!user) {
      callback?.({ ok: false, message: "Не удалось загрузить профиль." });
      return;
    }

    const wasJoined = users.has(socket.id);
    users.set(socket.id, user);

    if (!wasJoined) {
      socket.emit("systemMessage", {
        kind: "welcome",
        login: user.login,
        color: user.color,
        text: `Добро пожаловать, ${user.login}!`,
      });

      socket.broadcast.emit("systemMessage", {
        kind: "join",
        login: user.login,
        color: user.color,
        text: `${user.login} подключился к чату`,
      });
    }

    const publicPage = getPublicHistoryPage(null, PUBLIC_HISTORY_PAGE_DEFAULT);
    if (publicPage.items.length > 0) {
      socket.emit("history", publicPage.items);
    }
    socket.emit("publicHistoryMeta", {
      nextCursor: publicPage.nextCursor,
      total: publicPage.total,
    });

    const directDialogs = getDirectDialogsForUser(user, { bootstrapReadState: true });
    socket.emit("directDialogs", directDialogs);
    socket.emit("contactsList", getContactsForUser(user));
    socket.emit("chatRooms", getChatRooms());
    emitCurrentUserList();
    callback?.({
      ok: true,
      user,
      sessionExpiresAt: account.session_expires_at || null,
    });
  });

  socket.on("loadContacts", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }
    callback({ ok: true, items: getContactsForUser(user) });
  });

  socket.on("addContact", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }
    const login = normalizeLoginDisplay(payload?.login);
    const result = addContactForUser(user, login);
    if (!result.ok) {
      callback(result);
      return;
    }
    const contacts = getContactsForUser(user);
    socket.emit("contactsList", contacts);
    callback({ ok: true, contact: result.contact, items: contacts });
  });

  socket.on("removeContact", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }
    const login = normalizeLoginDisplay(payload?.login);
    const result = removeContactForUser(user, login);
    if (!result.ok) {
      callback(result);
      return;
    }
    const contacts = getContactsForUser(user);
    socket.emit("contactsList", contacts);
    callback({ ok: true, items: contacts });
  });

  socket.on("searchUsers", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }
    const page = searchUsersForUser(user, {
      query: payload?.query || "",
      cursor: payload?.cursor,
      limit: payload?.limit,
    });
    callback({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    });
  });

  socket.on("markDirectDialogRead", (payload, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }
    const partner = normalizeLoginDisplay(payload?.partner);
    if (!partner || isSameLogin(partner, user.login)) {
      callback?.({ ok: false, message: "Некорректный диалог." });
      return;
    }
    markDirectDialogReadForUser(user, partner);
    callback?.({ ok: true });
  });

  socket.on("updateChatRoomSettings", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    const roomId = String(payload?.id || DEFAULT_CHAT_ROOM_ID).trim();
    if (!roomId) {
      callback({ ok: false, message: "Некорректный чат." });
      return;
    }

    const existing = chatRoomByIdStmt.get(roomId);
    if (!existing) {
      callback({ ok: false, message: "Чат не найден." });
      return;
    }

    const title = String(payload?.title || "").trim();
    if (!title || title.length > 60) {
      callback({ ok: false, message: "Название чата: от 1 до 60 символов." });
      return;
    }

    const avatarPayload = resolveAvatarPayload(title, {
      avatarId: payload?.avatar ? null : payload?.avatarId || existing.avatar_id || null,
      avatar: payload?.avatar || existing.avatar || null,
      avatarOriginal: payload?.avatarOriginal || existing.avatar_original || existing.avatar || null,
    });

    updateChatRoomSettingsStmt.run({
      id: roomId,
      title,
      avatar_id: avatarPayload.avatarId,
      avatar: avatarPayload.avatar,
      avatar_original: avatarPayload.avatarOriginal,
      updated_at: new Date().toISOString(),
    });

    const room = mapChatRoom(chatRoomByIdStmt.get(roomId));
    const rooms = getChatRooms();
    io.emit("chatRooms", rooms);
    callback({ ok: true, room, rooms });
  });

  socket.on("loadPublicHistory", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    const limitValue = Math.max(
      1,
      Math.min(PUBLIC_HISTORY_PAGE_MAX, Number(payload?.limit) || PUBLIC_HISTORY_PAGE_DEFAULT)
    );
    const page = getPublicHistoryPage(payload?.before, limitValue);
    callback({
      ok: true,
      items: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
    });
  });

  socket.on("loadDirectHistory", (payload, callback) => {
    if (typeof callback !== "function") return;
    const user = users.get(socket.id);
    if (!user) {
      callback({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    const partner = String(payload?.partner || "").trim().slice(0, 20);
    if (!partner || isSameLogin(partner, user.login)) {
      callback({
        ok: true,
        partner,
        items: [],
        nextCursor: null,
        total: 0,
      });
      return;
    }

    const limitValue = Math.max(
      1,
      Math.min(DIRECT_HISTORY_PAGE_MAX, Number(payload?.limit) || DIRECT_HISTORY_PAGE_DEFAULT)
    );
    const page = getDirectHistoryPage(user.login, partner, payload?.before, limitValue);
    if (!page) {
      callback({ ok: false, message: "Нет доступа к истории этого диалога." });
      return;
    }
    const requestedBefore = payload?.before;
    const isInitialPageRequest =
      requestedBefore === null ||
      requestedBefore === undefined ||
      Number(requestedBefore) <= 0;
    if (isInitialPageRequest) {
      markDirectDialogReadForUser(user, partner);
    }
    const partnerNorm = normalizeLogin(partner);
    const unread = getDirectDialogUnreadCount({
      userId: Number(user.accountId),
      loginNorm: normalizeLogin(user.login),
      partnerNorm,
      convoKey: getDirectConversationKey(user.login, partner),
      bootstrapReadState: false,
    });

    callback({
      ok: true,
      partner: page.partner,
      partnerColor: page.partnerColor || null,
      partnerAvatarId: page.partnerAvatarId || null,
      partnerAvatar: page.partnerAvatar || null,
      partnerAvatarOriginal:
        page.partnerAvatarOriginal || page.partnerAvatar || null,
      items: page.items,
      nextCursor: page.nextCursor,
      total: page.total,
      unread,
    });
  });

  socket.on("chatMessage", (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    let msgText = "";
    let replyTo = null;
    let attachments = [];
    let messageId = "";
    let mentionTo = "";

    if (typeof data === "string") {
      msgText = data;
    } else if (data && typeof data === "object") {
      msgText = data.text;
      if (data.messageId) {
        messageId = String(data.messageId);
      }
      if (Array.isArray(data.attachments)) {
        attachments = data.attachments
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            name: String(item.name || "").slice(0, 120),
            url: String(item.url || ""),
            type: String(item.type || ""),
            size: Number(item.size || 0),
          }))
          .filter((item) => item.url && item.name);
      }
      if (data.replyTo && typeof data.replyTo === "object") {
        replyTo = {
          login: String(data.replyTo.login || "").slice(0, 20),
          text: truncateText(data.replyTo.text || "", 300),
          color: data.replyTo.color ? String(data.replyTo.color).slice(0, 20) : "",
          messageId: data.replyTo.messageId
            ? String(data.replyTo.messageId).slice(0, 80)
            : "",
        };
      }
      if (data.mentionTo) {
        mentionTo = String(data.mentionTo).slice(0, 20);
      }
    } else {
      callback?.({ ok: false, message: "Некорректный формат сообщения." });
      return;
    }

    const msg = String(msgText || "").trim();
    if (!msg && attachments.length === 0) {
      callback?.({ ok: false, message: "Пустое сообщение." });
      return;
    }

    const cooldownRemaining = getCooldownRemainingMs(user.login);
    if (cooldownRemaining > 0) {
      socket.emit("sendRateLimited", { remainingMs: cooldownRemaining });
      callback?.({ ok: false, reason: "cooldown", remainingMs: cooldownRemaining });
      return;
    }

    markMessageSentNow(user.login);

    if (!messageId) {
      messageId = generateMessageId();
    }

    if (!mentionTo) {
      mentionTo = detectMentionTarget(msg, user.login);
    }

    const payload = {
      messageId,
      login: user.login,
      color: user.color,
      avatarId: user.avatarId,
      avatar: user.avatar,
      avatarOriginal: user.avatarOriginal,
      text: msg,
      replyTo,
      attachments,
      timestamp: new Date().toISOString(),
      readAll: false,
      mentionTo: mentionTo || null,
    };

    const readState = ensureReadState(messageId, user.login);
    const readAllNow = readState.readers.size >= readState.expectedReaders;
    if (readAllNow) {
      payload.readAll = true;
    }

    savePublicMessage(payload);
    io.emit("chatMessage", payload);
    if (readAllNow) {
      notifyReadAll(messageId);
    }
    callback?.({ ok: true });
  });

  socket.on("editPublicMessage", (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    const messageId = String(data?.messageId || "").trim().slice(0, 80);
    const nextText = String(data?.text || "").trim();
    if (!messageId) {
      callback?.({ ok: false, message: "Не найден идентификатор сообщения." });
      return;
    }

    const existing = publicMessageByIdStmt.get(messageId);
    if (!existing) {
      callback?.({ ok: false, message: "Сообщение не найдено." });
      return;
    }

    if (!isSameLogin(existing.login, user.login)) {
      callback?.({ ok: false, message: "Можно редактировать только свои сообщения." });
      return;
    }

    const existingAttachments = safeJsonParse(existing.attachments_json, []);
    if (!nextText && (!Array.isArray(existingAttachments) || existingAttachments.length === 0)) {
      callback?.({ ok: false, message: "Нельзя оставить сообщение пустым." });
      return;
    }

    const editedAt = new Date().toISOString();
    const mentionTo = nextText ? detectMentionTarget(nextText, user.login) : null;
    updatePublicMessageEditStmt.run({
      message_id: messageId,
      text: nextText,
      mention_to: mentionTo || null,
      edited_at: editedAt,
    });
    const updated = publicMessageByIdStmt.get(messageId);
    const payload = mapPublicRowToPayload(updated);
    if (!payload) {
      callback?.({ ok: false, message: "Не удалось прочитать обновлённое сообщение." });
      return;
    }
    io.emit("chatMessageEdited", payload);
    callback?.({ ok: true, message: payload });
  });

  socket.on("directMessage", (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    let msgText = "";
    let replyTo = null;
    let attachments = [];
    let messageId = "";
    let to = "";

    if (typeof data === "string") {
      msgText = data;
    } else if (data && typeof data === "object") {
      msgText = data.text;
      if (data.messageId) {
        messageId = String(data.messageId);
      }
      if (data.to) {
        to = normalizeLoginDisplay(data.to);
      }
      if (Array.isArray(data.attachments)) {
        attachments = data.attachments
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            name: String(item.name || "").slice(0, 120),
            url: String(item.url || ""),
            type: String(item.type || ""),
            size: Number(item.size || 0),
          }))
          .filter((item) => item.url && item.name);
      }
      if (data.replyTo && typeof data.replyTo === "object") {
        replyTo = {
          login: String(data.replyTo.login || "").slice(0, 20),
          text: truncateText(data.replyTo.text || "", 300),
          color: data.replyTo.color ? String(data.replyTo.color).slice(0, 20) : "",
          messageId: data.replyTo.messageId
            ? String(data.replyTo.messageId).slice(0, 80)
            : "",
          };
      }
    } else {
      callback?.({ ok: false, message: "Некорректный формат сообщения." });
      return;
    }

    const msg = String(msgText || "").trim();
    if (!to || isSameLogin(to, user.login)) {
      callback?.({ ok: false, message: "Укажите корректного получателя." });
      return;
    }
    if (!msg && attachments.length === 0) {
      callback?.({ ok: false, message: "Пустое сообщение." });
      return;
    }

    const cooldownRemaining = getCooldownRemainingMs(user.login);
    if (cooldownRemaining > 0) {
      socket.emit("sendRateLimited", { remainingMs: cooldownRemaining });
      callback?.({ ok: false, reason: "cooldown", remainingMs: cooldownRemaining });
      return;
    }

    markMessageSentNow(user.login);

    if (!messageId) {
      messageId = generateMessageId();
    }

    const payload = {
      messageId,
      login: user.login,
      color: user.color,
      avatarId: user.avatarId,
      avatar: user.avatar,
      avatarOriginal: user.avatarOriginal,
      text: msg,
      replyTo,
      attachments,
      timestamp: new Date().toISOString(),
      to,
    };

    pushDirectMessage(user.login, to, payload);

    const targetIds = new Set([
      ...getSocketIdsByLogin(user.login),
      ...getSocketIdsByLogin(to),
    ]);
    targetIds.forEach((socketId) => {
      io.to(socketId).emit("directMessage", payload);
    });
    callback?.({ ok: true });
  });

  socket.on("editDirectMessage", (data, callback) => {
    const user = users.get(socket.id);
    if (!user) {
      callback?.({ ok: false, message: "Сначала выполните вход в чат." });
      return;
    }

    const messageId = String(data?.messageId || "").trim().slice(0, 80);
    const nextText = String(data?.text || "").trim();
    if (!messageId) {
      callback?.({ ok: false, message: "Не найден идентификатор сообщения." });
      return;
    }

    const existing = directMessageByIdStmt.get(messageId);
    if (!existing) {
      callback?.({ ok: false, message: "Сообщение не найдено." });
      return;
    }

    if (!isSameLogin(existing.from_login_norm, normalizeLogin(user.login))) {
      callback?.({ ok: false, message: "Можно редактировать только свои сообщения." });
      return;
    }

    const existingAttachments = safeJsonParse(existing.attachments_json, []);
    if (!nextText && (!Array.isArray(existingAttachments) || existingAttachments.length === 0)) {
      callback?.({ ok: false, message: "Нельзя оставить сообщение пустым." });
      return;
    }

    const editedAt = new Date().toISOString();
    updateDirectMessageEditStmt.run({
      message_id: messageId,
      text: nextText,
      edited_at: editedAt,
    });
    const updated = directMessageByIdStmt.get(messageId);
    const payload = mapDirectRowToPayload(updated);
    if (!payload) {
      callback?.({ ok: false, message: "Не удалось прочитать обновлённое сообщение." });
      return;
    }

    const targetIds = new Set([
      ...getSocketIdsByLogin(updated.from_login),
      ...getSocketIdsByLogin(updated.to_login),
    ]);
    targetIds.forEach((socketId) => {
      io.to(socketId).emit("directMessageEdited", payload);
    });
    callback?.({ ok: true, message: payload });
  });

  socket.on("messageRead", (payload) => {
    const user = users.get(socket.id);
    if (!user) return;
    const messageId = String(payload?.messageId || "");
    if (!messageId) return;
    const state = messageReadState.get(messageId);
    if (!state) return;
    state.readers.add(user.login);
    if (state.readers.size >= state.expectedReaders) {
      notifyReadAll(messageId);
    }
  });


  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      users.delete(socket.id);
      socket.broadcast.emit("systemMessage", {
        kind: "leave",
        login: user.login,
        color: user.color,
        text: `${user.login} вышел из чата`,
      });
      emitCurrentUserList();
    }
    if (messageReadState.size > 0) {
      messageReadState.forEach((state, messageId) => {
        if (state.expectedReaders > 1) {
          state.expectedReaders = Math.max(1, state.expectedReaders - 1);
        }
        if (state.readers.size >= state.expectedReaders) {
          notifyReadAll(messageId);
        }
      });
    }
    console.log("user disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Messenger запущен: http://localhost:${PORT}`);
});
