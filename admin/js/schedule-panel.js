/**
 * Treatment menu and booking slots — synced to the public booking page via platform API.
 */
import { fetchSchedule, saveSchedule, resetScheduleFromSeed } from "./api.js";
import { TREATMENT_MENU } from "./treatment-catalog.js";

let els = {};
let docCache = null;


function paintTreatmentMenuRef() {
  const wrap = document.getElementById("treatment-menu-ref");
  if (!wrap) return;
  wrap.hidden = false;
  wrap.replaceChildren();
  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "Full treatment menu (theskinden.co.uk)";
  details.append(summary);
  const ul = document.createElement("ul");
  for (const t of TREATMENT_MENU) {
    const li = document.createElement("li");
    li.innerHTML = `${t.title} — <span class="price">${t.priceLabel || `£${t.price}`}</span>`;
    ul.append(li);
  }
  details.append(ul);
  wrap.append(details);
}

export function initSchedulePanel() {
  els = {
    panel: document.getElementById("panel-schedule"),
    body: document.getElementById("schedule-body"),
    venue: document.getElementById("schedule-venue"),
    policy: document.getElementById("schedule-policy"),
    status: document.getElementById("schedule-status"),
    saveBtn: document.getElementById("schedule-save-btn"),
    reloadBtn: document.getElementById("schedule-reload-btn"),
    resetSeedBtn: document.getElementById("schedule-reset-seed-btn")
  };

  els.saveBtn?.addEventListener("click", () => void persistSchedule());
  els.reloadBtn?.addEventListener("click", () => void loadSchedule(true));
  paintTreatmentMenuRef();

  els.resetSeedBtn?.addEventListener("click", () => {
    if (!window.confirm("Replace all service slots with the default Skin Den menu prices?")) return;
    void (async () => {
      els.resetSeedBtn.disabled = true;
      setStatus("Loading official timetable…");
      try {
        docCache = await resetScheduleFromSeed();
        paintForm(docCache);
        setStatus("Official timetable loaded — review and tap Save to website if needed.");
      } catch (err) {
        setStatus(err.message || "Reset failed", true);
      } finally {
        els.resetSeedBtn.disabled = false;
      }
    })();
  });
}

export function showSchedulePanel() {
  void loadSchedule(false);
}

export function hydrateScheduleFromDashboard(schedule) {
  if (!schedule?.offerings) return;
  docCache = {
    venue: schedule.venue || "",
    cancelPolicy: schedule.cancelPolicy || "",
    offerings: schedule.offerings.map(cloneOffering)
  };
}

async function loadSchedule(force) {
  if (!els.body) return;
  if (docCache && !force) {
    paintForm(docCache);
    return;
  }
  setStatus("Loading treatment slots…");
  els.body.replaceChildren(row("Loading…", 7));
  try {
    docCache = await fetchSchedule();
    paintForm(docCache);
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Could not load schedule", true);
    els.body.replaceChildren(row(err.message, 7));
  }
}

function paintForm(doc) {
  if (els.venue) els.venue.value = doc.venue || "";
  if (els.policy) els.policy.value = doc.cancelPolicy || "";
  els.body.replaceChildren();
  const offerings = doc.offerings || [];
  if (!offerings.length) {
    els.body.append(row("No treatment slots yet — add a row below.", 7));
  }
  for (let i = 0; i < offerings.length; i += 1) {
    els.body.append(buildRow(offerings[i], i));
  }
  const addRow = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--ghost btn--sm";
  addBtn.textContent = "+ Add treatment slot";
  addBtn.addEventListener("click", () => {
    docCache.offerings.push({
      id: `treatment-${Date.now()}`,
      day: "Mon",
      time: "10:00am",
      title: "Advanced Facial",
      note: "",
      pricePence: 1500,
      capacity: 1,
      active: true
    });
    paintForm(docCache);
  });
  cell.append(addBtn);
  addRow.append(cell);
  els.body.append(addRow);
}

function buildRow(o, index) {
  const tr = document.createElement("tr");
  tr.dataset.index = String(index);

  tr.append(
    fieldInput(o.id, "id", "Slot ID", index, "text"),
    fieldSelect(o.day, index),
    fieldInput(o.time, "time", "Time", index, "text"),
    fieldInput(o.title, "title", "Title", index, "text"),
    fieldMoney(o.pricePence, index),
    fieldCapacity(o.capacity, index)
  );

  const activeCell = document.createElement("td");
  const label = document.createElement("label");
  label.className = "schedule-active-label";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = o.active !== false;
  cb.addEventListener("change", () => {
    docCache.offerings[index].active = cb.checked;
  });
  label.append(cb, document.createTextNode(" Live on site"));
  activeCell.append(label);
  tr.append(activeCell);

  return tr;
}

function fieldInput(value, key, label, index, type) {
  const td = document.createElement("td");
  const lbl = document.createElement("span");
  lbl.className = "sr-only";
  lbl.textContent = label;
  const input = document.createElement("input");
  input.className = "schedule-input";
  input.type = type;
  input.value = value ?? "";
  input.addEventListener("change", () => {
    docCache.offerings[index][key] = input.value.trim();
  });
  td.append(lbl, input);
  return td;
}

function fieldSelect(day, index) {
  const td = document.createElement("td");
  const sel = document.createElement("select");
  sel.className = "schedule-input";
  for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    if (d === day) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener("change", () => {
    docCache.offerings[index].day = sel.value;
  });
  td.append(sel);
  return td;
}

function fieldMoney(pence, index) {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.className = "schedule-input";
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.value = ((pence || 0) / 100).toFixed(2);
  input.addEventListener("change", () => {
    const pounds = Number(input.value);
    docCache.offerings[index].pricePence = Number.isFinite(pounds)
      ? Math.round(pounds * 100)
      : 0;
  });
  td.append(input);
  return td;
}

function fieldCapacity(cap, index) {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.className = "schedule-input";
  input.type = "number";
  input.min = "1";
  input.max = "99";
  input.value = String(cap ?? 1);
  input.addEventListener("change", () => {
    docCache.offerings[index].capacity = Number(input.value) || 1;
  });
  td.append(input);
  return td;
}

function readFormMeta() {
  if (els.venue) docCache.venue = els.venue.value.trim();
  if (els.policy) docCache.cancelPolicy = els.policy.value.trim();
}

async function persistSchedule() {
  if (!docCache) return;
  readFormMeta();
  els.saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    docCache = await saveSchedule(docCache);
    setStatus("Saved — the public booking page will show these treatments and times.");
    paintForm(docCache);
  } catch (err) {
    setStatus(err.message || "Save failed", true);
  } finally {
    els.saveBtn.disabled = false;
  }
}

function setStatus(msg, isError) {
  if (!els.status) return;
  els.status.textContent = msg;
  els.status.classList.toggle("is-error", !!isError);
}

function row(text, cols) {
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = cols;
  td.textContent = text;
  tr.append(td);
  return tr;
}

function cloneOffering(o) {
  return {
    id: o.id,
    day: o.day,
    time: o.time,
    title: o.title,
    note: o.note || "",
    pricePence: o.pricePence,
    capacity: o.capacity,
    active: o.active !== false
  };
}
