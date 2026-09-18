const API = "/api/entries";
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
let page = 0;
let loadId = 0;

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
  $("count").textContent = list.length + " shown (page " + (page + 1) + ")";
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
    const td = document.createElement("td");
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "View details";
    details.appendChild(summary);
    const statuses = { circumcised: "Circumcised", uncircumcised: "Uncircumcised", partial: "Partially circumcised" };
    for (const text of [
      "Circumcision: " + (statuses[row.circumcision] || "Not provided"),
      "Flaccid length: " + (row.flaccidLength == null ? "Not provided" : row.flaccidLength + " " + row.unit),
      "Flaccid girth: " + (row.flaccidGirth == null ? "Not provided" : row.flaccidGirth + " " + row.unit),
    ]) { const line = document.createElement("p"); line.textContent = text; details.appendChild(line); }
    td.appendChild(details);
    tr.appendChild(td);
    tb.appendChild(tr);
  }
}

async function api(url, body) {
  const res = await fetch(url, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  } : {});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "The directory is temporarily unavailable.");
  return data;
}
async function load() {
  const id = ++loadId;
  const query = $("q").value.replace(/^@/, "").trim();
  let data;
  try { data = await api(API + "?" + new URLSearchParams({ q: query, offset: String(page * 100) })); }
  catch (error) { if (id === loadId) throw error; return; }
  if (id !== loadId) return;
  cache = data.entries.map(normalizeRow).filter(Boolean);
  $("previous").disabled = page === 0;
  $("next").disabled = !data.more;
  $("empty").textContent = "No public entries yet — or none match that handle.";
  render();
}
function loadError(err) {
  cache = [];
  render();
  $("empty").textContent = err.message || "Could not load the directory.";
}

function normalizeRow(row) {
  if (!row || typeof row !== "object") return null;
  const parsed = parseHandle(row.handle);
  if (parsed.error) return null;
  const factor = row.unit === "cm" ? 2.54 : 1;
  const len = parseMeasure(row.length, Math.round(factor * 10) / 10, Math.round(9.5 * factor * 10) / 10, "Length");
  const gir = parseMeasure(row.girth, Math.round(factor * 10) / 10, Math.round(7 * factor * 10) / 10, "Girth");
  if (len.error || gir.error) return null;
  const unit = row.unit === "cm" ? "cm" : "in";
  return {
    _id: String(row._id || ""),
    handle: parsed.handle,
    length: len.value,
    girth: gir.value,
    unit,
    createdAt: sanitizePlain(row.createdAt || ""),
    circumcision: row.circumcision ?? null,
    flaccidLength: row.flaccidLength ?? null,
    flaccidGirth: row.flaccidGirth ?? null,
  };
}

let searchTimer;
$("q").addEventListener("input", () => {
  ++loadId;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page = 0; load().catch(loadError); }, 250);
});
$("previous").addEventListener("click", () => { page = Math.max(0, page - 1); load().catch(loadError); });
$("next").addEventListener("click", () => { page++; load().catch(loadError); });

$("submit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("s-msg");
  const btn = $("s-btn");
  msg.className = "status";
  msg.textContent = "";

  const h = parseHandle($("s-handle").value);
  if (h.error) return fail(msg, h.error);
  const factor = $("s-unit").value === "cm" ? 2.54 : 1;
  const len = parseMeasure($("s-length").value, Math.round(factor * 10) / 10, Math.round(9.5 * factor * 10) / 10, "Length");
  if (len.error) return fail(msg, len.error);
  const gir = parseMeasure($("s-girth").value, Math.round(factor * 10) / 10, Math.round(7 * factor * 10) / 10, "Girth");
  if (gir.error) return fail(msg, gir.error);
  const unit = $("s-unit").value === "cm" ? "cm" : "in";
  const optional = { circumcision: $("s-circumcision").value || null };
  for (const [field, id, max, label] of [
    ["flaccidLength", "s-flaccid-length", 9.5, "Flaccid length"],
    ["flaccidGirth", "s-flaccid-girth", 7, "Flaccid girth"],
  ]) {
    const raw = $(id).value.trim();
    if (!raw) { optional[field] = null; continue; }
    const parsed = parseMeasure(raw, 0.1, Math.round(max * factor * 10) / 10, label);
    if (parsed.error) return fail(msg, parsed.error);
    optional[field] = parsed.value;
  }
  if (!$("s-18").checked) return fail(msg, "Confirm you are 18 or older.");
  if (!$("s-own").checked) return fail(msg, "Confirm these are your own measurements and you want them public.");

  btn.disabled = true;
  try {
    let code = $("removal-code").value;
    if (!code || $("removal-code").dataset.handle !== h.handle.toLowerCase()) {
      code = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    }
    $("removal-code").value = code;
    $("removal-code").dataset.handle = h.handle.toLowerCase();
    $("removal-receipt").classList.remove("hidden");
    await api(API, { handle: h.handle, length: len.value, girth: gir.value, unit,
      adult: true, own: true, removalCode: code, ...optional });
    page = 0;
    $("q").value = "";
    $("submit-form").reset();
    msg.className = "status ok";
    msg.textContent = "Published. Save your removal code below; it is shown only once.";
    $("removal-receipt").classList.remove("hidden");
    await load().catch(loadError);
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
  if (!pass) return fail(msg, "Removal code is required.");
  btn.disabled = true;
  try {
    await api("/api/retract", { handle: h.handle, passphrase: pass });
    page = 0;
    $("retract-form").reset();
    msg.className = "status ok";
    msg.textContent = "Row removed.";
    await load().catch(loadError);
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

load().catch(loadError);
