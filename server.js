const path = require("path");
const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

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
const history = [];
const MAX_HISTORY = 200;
const messageReadState = new Map();

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// включать ли тестовых ботов (dev-режим)
const ENABLE_TEST_BOTS = true;


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
          login,
          color,
          avatarId,
          avatar,
          text,
          isBot: true,
          timestamp: new Date().toISOString(),
        };

        history.push(payload);
        if (history.length > MAX_HISTORY) {
          history.shift();
        }

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

function getSocketIdsByLogin(login) {
  return Array.from(users.entries())
    .filter(([, user]) => user.login === login)
    .map(([socketId]) => socketId);
}

function markHistoryReadAll(messageId) {
  const item = history.find((entry) => entry.messageId === messageId);
  if (item) {
    item.readAll = true;
  }
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


  socket.on("join", (payload) => {
    let login = "";
    let color = null;
    let avatarId = null;
    let avatar = null;

    if (typeof payload === "string") {
      login = payload;
    } else if (payload && typeof payload === "object") {
      login = String(payload.login || "");
      if (payload.color) {
        color = String(payload.color);
      }
      if (payload.avatarId) {
        avatarId = String(payload.avatarId);
      }
      if (payload.avatar) {
        avatar = sanitizeAvatar(payload.avatar);
      }
    }

    let name = login.trim().slice(0, 20);
    if (!name) name = "Гость";

    const resolvedAvatar =
      avatar || getAvatarById(avatarId) || getAvatarForName(name);
    const user = { login: name, color, avatarId, avatar: resolvedAvatar };
    users.set(socket.id, user);

    // персональное приветствие
    socket.emit("systemMessage", {
      kind: "welcome",
      login: user.login,
      color: user.color,
      text: `Добро пожаловать, ${user.login}!`,
    });

    // всем остальным — "подключился"
    socket.broadcast.emit("systemMessage", {
      kind: "join",
      login: user.login,
      color: user.color,
      text: `${user.login} подключился к чату`,
    });

    // отдаем историю только вошедшему
    if (history.length > 0) {
      socket.emit("history", history);
    }

    io.emit("userList", Array.from(users.values()));
  });

  socket.on("chatMessage", (data) => {
  const user = users.get(socket.id) || { login: "Гость", color: null };

  let msgText = "";
  let replyTo = null;
  let attachments = [];
  let messageId = "";

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
      };
    }
  } else {
    return;
  }

  const msg = String(msgText || "").trim();
  if (!msg && attachments.length === 0) return;

  if (!messageId) {
    messageId = generateMessageId();
  }

  const payload = {
    messageId,
    login: user.login,
    color: user.color,
    avatarId: user.avatarId,
    avatar: user.avatar,
    text: msg,
    replyTo,
    attachments,
    timestamp: new Date().toISOString(),
    readAll: false,
  };

  history.push(payload);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const readState = ensureReadState(messageId, user.login);
  const readAllNow = readState.readers.size >= readState.expectedReaders;
  if (readAllNow) {
    payload.readAll = true;
  }
  io.emit("chatMessage", payload);
  if (readAllNow) {
    notifyReadAll(messageId);
  }
});

  socket.on("directMessage", (data) => {
    const user = users.get(socket.id) || { login: "Гость", color: null };

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
        to = String(data.to).trim();
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
        };
      }
    } else {
      return;
    }

    const msg = String(msgText || "").trim();
    if (!to) return;
    if (!msg && attachments.length === 0) return;

    if (!messageId) {
      messageId = generateMessageId();
    }

    const payload = {
      messageId,
      login: user.login,
      color: user.color,
      avatarId: user.avatarId,
      avatar: user.avatar,
      text: msg,
      replyTo,
      attachments,
      timestamp: new Date().toISOString(),
      to,
    };

    const targetIds = new Set([
      ...getSocketIdsByLogin(user.login),
      ...getSocketIdsByLogin(to),
    ]);
    targetIds.forEach((socketId) => {
      io.to(socketId).emit("directMessage", payload);
    });
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
      io.emit("userList", Array.from(users.values()));
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
