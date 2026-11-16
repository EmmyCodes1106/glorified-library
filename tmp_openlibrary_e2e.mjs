import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import postgres from "postgres";

const ROOT = "c:/users/emman/glorified-library";
const BASE = "http://localhost:3000";
const SEARCH_ISBN = "9780385474542"; // Things Fall Apart (Anchor edition)
const TEMP = os.tmpdir();

// --- load env without printing secrets ---
const envFile = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const env = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}
if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing");

const sql = postgres(env.DATABASE_URL, {
  connect_timeout: 20,
  idle_timeout: 0,
  keep_alive: 30,
  ssl: "require",
  max: 2,
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
];
const chromePath = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chromePath) throw new Error("chrome not found");

const CDP_PORT = 9381;
const userDataDir = fs.mkdtempSync(path.join(TEMP, "qa-ol-chrome-"));

let chrome;
let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const res = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error(
      JSON.stringify(res.exceptionDetails.exception?.description || res.exceptionDetails.text)
    );
  }
  return res.result?.value;
}

async function setValue(selector, value) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`field not found: ${selector}`);
}

async function waitFor(expression, timeoutMs = 20000, label = "condition") {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return true;
    await sleep(400);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function screenshot(name) {
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(TEMP, name), Buffer.from(shot.data, "base64"));
}

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

let qaUserId = null;
let qaSessionId = null;
let bookId = null;
let authorId = null;
let coverFile = null;

async function main() {
  // seed QA super admin + session
  const email = `qa-ol-${Date.now()}@example.test`;
  const [user] = await sql`
    insert into users (name, email, password_hash, role, permissions, is_active, approved_at, email_verified_at)
    values ('QA OpenLibrary', ${email}, ${hashPassword("QaOpenLibrary!234")}, 'super_admin', ${[]}, true, now(), now())
    returning id
  `;
  qaUserId = user.id;
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const [session] = await sql`
    insert into sessions (user_id, token_hash, user_agent, ip_address, expires_at)
    values (${user.id}, ${tokenHash}, 'qa-openlibrary-e2e', '127.0.0.1', now() + interval '1 hour')
    returning id
  `;
  qaSessionId = session.id;

  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-extensions",
      "--window-size=1440,1400",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  // wait for debugger
  const start = Date.now();
  let version = null;
  while (Date.now() - start < 15000) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) {
        version = await res.json();
        break;
      }
    } catch {}
    await sleep(250);
  }
  if (!version) throw new Error("chrome debugger did not start");

  const tab = await (
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: "PUT" })
  ).json();

  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Network.setCookie", {
    name: "glorified_session",
    value: token,
    domain: "localhost",
    path: "/",
  });

  await send("Page.navigate", { url: `${BASE}/` });
  await waitFor(
    `!!document.querySelector('input[aria-label="Search Open Library"]')`,
    25000,
    "add-book lookup to render"
  );
  await sleep(1500);

  // 1. search by ISBN
  await setValue('input[aria-label="Search Open Library"]', SEARCH_ISBN);
  await evaluate(`(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent.trim() === "Search" && !b.disabled)?.click();
    return true;
  })()`);
  await waitFor(
    `document.querySelectorAll('div.rounded-lg.border button, ul button').length > 0 || !!document.querySelector('p[role="alert"]')`,
    20000,
    "lookup results or error"
  );
  await sleep(500);

  const resultCount = await evaluate(`(() => {
    const lists = [...document.querySelectorAll("ul")];
    const resultList = lists.find((ul) => ul.querySelector(":scope > li > button"));
    return resultList ? resultList.querySelectorAll(":scope > li").length : 0;
  })()`);
  check("lookup returns results", resultCount > 0, `${resultCount} results`);
  await screenshot("qa-ol-results.png");

  // 2. pick a result that fills title, author and year
  let picked = null;
  for (let i = 0; i < Math.min(resultCount, 5) && !picked; i++) {
    await evaluate(`(() => {
      const lists = [...document.querySelectorAll("ul")];
      const resultList = lists.find((ul) => ul.querySelector(":scope > li > button"));
      const btn = resultList?.querySelectorAll(":scope > li > button")[${i}];
      btn?.click();
      return true;
    })()`);
    await sleep(800);
    picked = await evaluate(`(() => {
      const title = document.querySelector('form input[name="title"]')?.value ?? "";
      const author = document.querySelector('form input[name="author"]')?.value ?? "";
      const year = document.querySelector('form input[name="year"]')?.value ?? "";
      const isbn = document.querySelector('form input[name="isbn"]')?.value ?? "";
      const coverUrl = document.querySelector('form input[name="coverUrl"]')?.value ?? "";
      return { title, author, year, isbn, coverUrl, ok: title && author && year };
    })()`);
    if (!picked.ok) console.log(`result ${i} incomplete:`, JSON.stringify(picked));
  }
  check("form prefilled (title/author/year)", !!picked?.ok, JSON.stringify(picked));
  check("isbn prefilled in valid format", /^(?:\d{9}[\dX]|\d{13})$/i.test(picked?.isbn ?? ""), picked?.isbn);
  check("cover selected for download", /^https:\/\/covers\.openlibrary\.org\/b\/id\/\d+-L\.jpg$/.test(picked?.coverUrl ?? ""), picked?.coverUrl);

  // wait for async description fetch (best effort)
  await sleep(4000);
  const description = await evaluate(`document.querySelector('form textarea[name="description"]')?.value ?? ""`);
  console.log("description filled:", description ? `${description.length} chars` : "none");
  await screenshot("qa-ol-prefilled.png");

  const formValues = picked;

  // 3. submit -> book created
  await evaluate(`(() => {
    const form = document.querySelector('input[aria-label="Search Open Library"]').closest("form");
    form.querySelector('button.btn-primary')?.click();
    return true;
  })()`);
  await waitFor(
    `!!document.querySelector('p[role="status"]') || !!document.querySelector('p[role="alert"]')`,
    30000,
    "add-book result message"
  );
  const addMessage = await evaluate(
    `document.querySelector('p[role="status"], p[role="alert"]')?.textContent ?? ""`
  );
  check("book added", /Book added as GLM-/.test(addMessage), addMessage);

  // 4. DB verification
  await sleep(1500);
  const [book] = await sql`
    select id, title, isbn, cover_path, author_id, description is not null as has_description
    from books where isbn = ${formValues.isbn} order by id desc limit 1
  `;
  check("book row exists in DB", !!book, book ? book.title : "not found");
  if (book) {
    bookId = book.id;
    authorId = book.author_id;
    check("cover_path stored", typeof book.cover_path === "string" && book.cover_path.startsWith("/uploads/covers/"), book.cover_path);
    if (book.cover_path) {
      coverFile = path.join(ROOT, "public", book.cover_path);
      check("cover file exists on disk", fs.existsSync(coverFile), coverFile);
    }
  }
  await screenshot("qa-ol-added.png");

  // 5. negative: resubmit same values -> duplicate ISBN, no second row
  const beforeCount = book ? 1 : 0;
  const valuesStillThere = await evaluate(`(() => {
    const title = document.querySelector('form input[name="title"]')?.value ?? "";
    return title.length > 0;
  })()`);
  if (!valuesStillThere) {
    await setValue('form input[name="title"]', formValues.title);
    await setValue('form input[name="author"]', formValues.author);
    await setValue('form input[name="year"]', formValues.year);
    if (formValues.isbn) await setValue('form input[name="isbn"]', formValues.isbn);
  }
  await evaluate(`(() => {
    const form = document.querySelector('input[aria-label="Search Open Library"]').closest("form");
    form.querySelector('button.btn-primary')?.click();
    return true;
  })()`);
  await waitFor(
    `!!document.querySelector('p[role="status"]') || !!document.querySelector('p[role="alert"]')`,
    30000,
    "second submit message"
  );
  await sleep(500);
  const dupMessage = await evaluate(
    `document.querySelector('p[role="status"], p[role="alert"]')?.textContent ?? ""`
  );
  check("duplicate ISBN rejected", /already belongs to/.test(dupMessage), dupMessage);
  const [dupCount] = await sql`select count(*)::int as count from books where isbn = ${formValues.isbn}`;
  check("no duplicate book created", dupCount.count === beforeCount, `${dupCount.count} rows`);

  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
}

try {
  await main();
} finally {
  // cleanup: book, cover file, author (if orphaned), QA user/session/audit
  try {
    if (bookId) {
      await sql`delete from book_genres where book_id = ${bookId}`;
      await sql`delete from books where id = ${bookId}`;
    }
    if (coverFile && fs.existsSync(coverFile)) fs.unlinkSync(coverFile);
    if (authorId) {
      const [ref] = await sql`select count(*)::int as count from books where author_id = ${authorId}`;
      if (ref.count === 0) await sql`delete from authors where id = ${authorId}`;
    }
    if (qaSessionId) await sql`delete from sessions where id = ${qaSessionId}`;
    if (qaUserId) {
      await sql`delete from audit_logs where actor_user_id = ${qaUserId} or entity_id = ${qaUserId}`;
      await sql`delete from users where id = ${qaUserId}`;
    }
    console.log("test data removed");
  } catch (e) {
    console.log("cleanup warning:", e.message);
  }
  try {
    ws?.close();
  } catch {}
  try {
    chrome?.kill();
  } catch {}
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
  await sql.end();
}
