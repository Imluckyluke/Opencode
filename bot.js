const { Agent, setGlobalDispatcher } = require("undici");

// Node's fetch defaults to a 5-minute headers timeout — Muse Spark can take
// longer on long/complex replies, so raise it (here: 20 minutes).
setGlobalDispatcher(
  new Agent({
    headersTimeout: 20 * 60 * 1000,
    bodyTimeout: 20 * 60 * 1000,
  })
);

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OC_PORT = process.env.PORT || 4096;
const OC_URL = process.env.OPENCODE_URL || `http://localhost:${OC_PORT}`;
const OC_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD || "";
const OC_USERNAME = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const TG_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

if (!TELEGRAM_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set");
  process.exit(1);
}

function ocHeaders(extra = {}) {
  const headers = { ...extra };
  if (OC_PASSWORD) {
    const encoded = Buffer.from(`${OC_USERNAME}:${OC_PASSWORD}`).toString("base64");
    headers["Authorization"] = `Basic ${encoded}`;
  }
  return headers;
}

// telegram chatId -> opencode sessionId
const sessions = new Map();

async function waitForOpenCode() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${OC_URL}/app`, { headers: ocHeaders() });
      if (res.ok) return;
    } catch (_) {
      // not up yet, keep retrying
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("OpenCode server never became ready");
}

async function ocCreateSession() {
  const res = await fetch(`${OC_URL}/session`, {
    method: "POST",
    headers: ocHeaders(),
  });
  if (!res.ok) throw new Error(`session create failed: ${res.status}`);
  const data = await res.json();
  return data.id;
}

function extractText(message) {
  if (typeof message?.text === "string" && message.text.trim()) return message.text;
  const parts = message?.parts || message?.info?.parts;
  if (Array.isArray(parts)) {
    const text = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  return "(پاسخی برای نمایش نبود)";
}

async function ocSendMessage(sessionId, text) {
  const res = await fetch(`${OC_URL}/session/${sessionId}/message`, {
    method: "POST",
    headers: ocHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ parts: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`message send failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return extractText(data);
}

async function getSessionFor(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, await ocCreateSession());
  }
  return sessions.get(chatId);
}

async function tgSend(chatId, text) {
  await fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 4000) }),
  });
}

async function tgTyping(chatId) {
  await fetch(`${TG_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

async function pollLoop() {
  let offset = 0;
  console.log("Telegram bot polling started");
  for (;;) {
    let data;
    try {
      const res = await fetch(`${TG_API}/getUpdates?timeout=30&offset=${offset}`);
      data = await res.json();
    } catch (err) {
      console.error("getUpdates failed:", err.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of data.result || []) {
      offset = update.update_id + 1;
      const msg = update.message;
      if (!msg?.text) continue;
      const chatId = msg.chat.id;

      if (msg.text === "/start" || msg.text === "/reset") {
        sessions.delete(chatId);
        await tgSend(chatId, "سشن جدید شروع شد. سوالت رو بپرس.");
        continue;
      }

      try {
        const sessionId = await getSessionFor(chatId);
        const typingInterval = setInterval(() => tgTyping(chatId), 4000);
        tgTyping(chatId);
        let reply;
        try {
          reply = await ocSendMessage(sessionId, msg.text);
        } finally {
          clearInterval(typingInterval);
        }
        await tgSend(chatId, reply);
      } catch (err) {
        console.error(err);
        await tgSend(chatId, "خطا در ارتباط با OpenCode: " + err.message);
      }
    }
  }
}

waitForOpenCode()
  .then(pollLoop)
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
