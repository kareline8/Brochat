const path = require("path");
const express = require("express");
const http = require("http");
const fs = require("fs");
const { Server } = require("socket.io");

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

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

    const loop = () => {
      const delay = randomInt(3000, 60000); // 3–60 секунд
      setTimeout(() => {
        const text =
          BOT_MESSAGES[randomInt(0, BOT_MESSAGES.length - 1)];

        const payload = {
          login,
          color,
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
  if (file.data && typeof file.data.byteLength === "number") {
    return file.data.byteLength;
  }
  return 0;
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
        const buffer = Buffer.isBuffer(file.data)
          ? file.data
          : Buffer.from(file.data);
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

    if (typeof payload === "string") {
      login = payload;
    } else if (payload && typeof payload === "object") {
      login = String(payload.login || "");
      if (payload.color) {
        color = String(payload.color);
      }
    }

    let name = login.trim().slice(0, 20);
    if (!name) name = "Гость";

    const user = { login: name, color };
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

  if (typeof data === "string") {
    msgText = data;
  } else if (data && typeof data === "object") {
    msgText = data.text;
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
        text: String(data.replyTo.text || "").slice(0, 300),
      };
    }
  } else {
    return;
  }

  const msg = String(msgText || "").trim();
  if (!msg && attachments.length === 0) return;

  const payload = {
    login: user.login,
    color: user.color,
    text: msg,
    replyTo,
    attachments,
    timestamp: new Date().toISOString(),
  };

  history.push(payload);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  io.emit("chatMessage", payload);
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
    console.log("user disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Messenger запущен: http://localhost:${PORT}`);
});
