const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.static(path.join(__dirname, "public")));

const users = new Map(); // socket.id -> { login, color }
const history = [];
const MAX_HISTORY = 200;

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


// --- обычная логика чата ---

io.on("connection", (socket) => {
  console.log("user connected:", socket.id);

  // как только зашёл первый живой человек — поднимаем ботов (если разрешено)
  if (ENABLE_TEST_BOTS && !botsStarted) {
    startTestBots();
  }


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

  if (typeof data === "string") {
    msgText = data;
  } else if (data && typeof data === "object") {
    msgText = data.text;
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
  if (!msg) return;

  const payload = {
    login: user.login,
    color: user.color,
    text: msg,
    replyTo,
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
