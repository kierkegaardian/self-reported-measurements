const API = "https://crudcrud.com/api/2f91e0d723d8495b9d98a89ae0dbd119/entries";
const HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

const $ = (id) => document.getElementById(id);
const views = {
  list: $("view-list"),
  submit: $("view-submit"),
  retract: $("view-retract"),
};

function sanitizePlain(s) {
  return String(s ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

function parseHandle(raw) {
  let h = sanitizePlain(raw).replace(/^@+/, "");
  h = h.replace(/\s+/g, "");
  if (!h) return { error: "Handle is required." };
  if (/\s/.test(String(raw))) return { error: "Handles cannot contain spaces." };
  if (!HANDLE_RE.test(h)) return { error: "Invalid handle. Use 1–15 letters, numbers, or _ after @." };
  return { handle: h };
}

function parseMeasure(raw, min, max, label) {
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n)) return { error: label + " must be a number." };
  if (n < min || n > max) return { error: label + " must be between " + min + " and " + max + "." };
  return { value: Math.round(n * 10) / 10 };
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function passHash(handle, pass) {
  return sha256Hex("srm-v1|" + handle.toLowerCase() + "|" + pass);
}

function setView(name) {
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  document.querySelectorAll("nav button").forEach((b) => {
    if (b.dataset.view === name) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  history.replaceState(null, "", name === "list" ? "#" : "#" + name);
}

document.querySelectorAll("nav button").forEach((b) => {
  b.addEventListener("click", () => setView(b.dataset.view));
});

$("gate-enter").addEventListener("click", () => {
  if (!$("gate-18").checked) {
    $("gate-msg").textContent = "Confirm you are 18 or older.";
    return;
  }
  sessionStorage.setItem("srm-18", "1");
  $("age-gate").classList.add("hidden");
});
if (sessionStorage.getItem("srm-18") === "1") $("age-gate").classList.add("hidden");

let cache = [];

function fmtDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toISOString().slice(0, 10);
}

function render() {
  const q = sanitizePlain($("q").value).replace(/^@+/, "").toLowerCase();
  const list = cache
    .slice()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .filter((row) => !q || String(row.handle).toLowerCase().includes(q));

  const tb = $("rows");
  tb.replaceChildren();
  $("count").textContent = list.length + " shown / " + cache.length + " public";
  $("empty").classList.toggle("hidden", list.length > 0);

  for (const row of list) {
    const tr = document.createElement("tr");
    const cells = [
      "@" + row.handle,
      String(row.length),
      String(row.girth),
      row.unit === "cm" ? "cm" : "in",
      fmtDate(row.createdAt),
    ];
    cells.forEach((text, i) => {
      const td = document.createElement("td");
      if (i === 0) td.className = "handle";
      td.textContent = text;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  }
}

async function load() {
  const res = await fetch(API, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Could not load the shared list (" + res.status + ").");
  const data = await res.json();
  cache = Array.isArray(data) ? data.map(normalizeRow).filter(Boolean) : [];
  render();
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const parsed = parseHandle(row.handle);
  if (parsed.error) return null;
  const len = parseMeasure(row.length, 1, 20, "Length");
  const gir = parseMeasure(row.girth, 1, 15, "Girth");
  if (len.error || gir.error) return null;
  const unit = row.unit === "cm" ? "cm" : "in";
  return {
    _id: String(row._id || ""),
    handle: parsed.handle,
    length: len.value,
    girth: gir.value,
    unit,
    createdAt: sanitizePlain(row.createdAt || ""),
    passHash: String(row.passHash || ""),
  };
}

$("q").addEventListener("input", render);

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("s-msg");
  const btn = $("s-btn");
  msg.className = "status";
  msg.textContent = "";

  const h = parseHandle($("s-handle").value);
  if (h.error) return fail(msg, h.error);
  const len = parseMeasure($("s-length").value, 1, 20, "Length");
  if (len.error) return fail(msg, len.error);
  const gir = parseMeasure($("s-girth").value, 1, 15, "Girth");
  if (gir.error) return fail(msg, gir.error);
  const unit = $("s-unit").value === "cm" ? "cm" : "in";
  const pass = $("s-pass").value;
  if (pass.length < 8 || pass.length > 64) return fail(msg, "Passphrase must be 8–64 characters.");
  if (!$("s-18").checked) return fail(msg, "Confirm you are 18 or older.");
  if (!$("s-own").checked) return fail(msg, "Confirm these are your own measurements and you want them public.");

  btn.disabled = true;
  try {
    await load();
    const existing = cache.find((r) => r.handle.toLowerCase() === h.handle.toLowerCase());
    if (existing) {
      return fail(msg, "That handle already has a public row. Retract it first with the original passphrase. You cannot claim someone else’s handle.");
    }
    const hash = await passHash(h.handle, pass);
    const body = {
      handle: h.handle,
      length: len.value,
      girth: gir.value,
      unit,
      createdAt: new Date().toISOString(),
      passHash: hash,
    };
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Save failed (" + res.status + ").");
    $("submit-form").reset();
    msg.className = "status ok";
    msg.textContent = "Published. Remember the passphrase if you want to retract later.";
    await load();
    setView("list");
  } catch (err) {
    fail(msg, err.message || "Could not publish.");
  } finally {
    btn.disabled = false;
  }
});

$("retract-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("r-msg");
  const btn = $("r-btn");
  msg.className = "status";
  msg.textContent = "";
  const h = parseHandle($("r-handle").value);
  if (h.error) return fail(msg, h.error);
  const pass = $("r-pass").value;
  if (!pass) return fail(msg, "Passphrase is required.");
  btn.disabled = true;
  try {
    await load();
    const existing = cache.find((r) => r.handle.toLowerCase() === h.handle.toLowerCase());
    if (!existing || !existing._id) return fail(msg, "No public row for that handle.");
    const hash = await passHash(h.handle, pass);
    if (hash !== existing.passHash) return fail(msg, "Handle and passphrase do not match.");
    const res = await fetch(API + "/" + encodeURIComponent(existing._id), { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed (" + res.status + ").");
    $("retract-form").reset();
    msg.className = "status ok";
    msg.textContent = "Row removed.";
    await load();
    setView("list");
  } catch (err) {
    fail(msg, err.message || "Could not retract.");
  } finally {
    btn.disabled = false;
  }
});

function fail(el, text) {
  el.className = "status err";
  el.textContent = text;
}

const startHash = (location.hash || "").replace("#", "");
if (startHash === "submit" || startHash === "retract") setView(startHash);

load().catch((err) => {
  $("empty").classList.remove("hidden");
  $("empty").textContent = err.message + " Shared store may be down or expired.";
});
