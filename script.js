const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (v) => {
  const d = document.createElement("div");
  d.textContent = v ?? "";
  return d.innerHTML;
};

const db = {
  patients: [],
  visits: [],
  admissions: [],
  meta: { patientCounter: 0, visitCounter: 0, admissionCounter: 0 },
};

const state = {
  complaints: new Set(),
  patientId: "",
  admissionId: "",
  admFilter: "all",
  admMonth: iso().slice(0, 7),
  recordSection: "overview",
  recordFocusType: "",
  recordFocusId: "",
};
const security = { role: "viewer" };
// PIN is scoped per hospital — helpers read/write from the correct key
function getEditorPin() {
  return localStorage.getItem(`opd_pin_${hospital.code() || "default"}`) || "";
}
function setEditorPin(v) {
  const key = `opd_pin_${hospital.code() || "default"}`;
  if (v) localStorage.setItem(key, v);
  else localStorage.removeItem(key);
}

function iso(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function monthLabel(monthKey) {
  if (!monthKey) return "Unknown month";
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function shiftMonth(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, (month || 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(v) {
  return String(v || "").trim();
}

function lc(v) {
  return text(v).toLowerCase().replace(/\s+/g, " ");
}

function idNum(v) {
  const m = String(v || "").match(/(\d+)$/);
  return m ? Number(m[1]) : 0;
}

function pad(n) {
  return String(n).padStart(6, "0");
}

function toast(msg, type = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show${type ? ` ${type}` : ""}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = "toast"), 2600);
}

// ── Sync Status ────────────────────────────────────────────────────────────────────────────
function setSyncStatus(s) {
  const dot = $("#syncDot");
  const lbl = $("#syncLbl");
  if (!dot) return;
  dot.className = `sync-dot sync-${s}`;
  const map = { syncing: "Syncing…", synced: "Synced", error: "Sync error", offline: "Local" };
  if (lbl) lbl.textContent = map[s] || "Local";
}

// ── PIN Modal ───────────────────────────────────────────────────────────────────────────
let _pinResolve = null;

function showPinModal(title, message, okLabel = "Confirm") {
  return new Promise((resolve) => {
    _pinResolve = resolve;
    $("#pinModalTitle").textContent = title;
    $("#pinModalMsg").textContent = message;
    $("#pinModalOk").textContent = okLabel;
    $("#pinInput").value = "";
    $("#pinErr").textContent = "";
    $("#pinModal").classList.add("open");
    setTimeout(() => $("#pinInput")?.focus(), 80);
  });
}

function _closePinModal(value) {
  $("#pinModal").classList.remove("open");
  if (_pinResolve) { _pinResolve(value); _pinResolve = null; }
}

window.pinModalConfirm = function () {
  const val = ($("#pinInput").value || "").trim();
  if (!val) {
    $("#pinErr").textContent = "Please enter a PIN.";
    $("#pinModalCard").classList.add("shake");
    setTimeout(() => $("#pinModalCard").classList.remove("shake"), 500);
    return;
  }
  _closePinModal(val);
};

window.pinModalCancel = function () { _closePinModal(null); };

// ── Hospital Module ─────────────────────────────────────────────────────────────────────
const hospital = (() => {
  let _h = null;

  function load() {
    try { _h = JSON.parse(localStorage.getItem("opd_hospital") || "null"); } catch { _h = null; }
    return _h;
  }

  function savedList() {
    try { return JSON.parse(localStorage.getItem("opd_hospitals_list") || "[]"); } catch { return []; }
  }

  function addToSavedList(data) {
    const list = savedList();
    const idx = list.findIndex(h => h.code === data.code);
    if (idx >= 0) list[idx] = data; else list.push(data);
    localStorage.setItem("opd_hospitals_list", JSON.stringify(list));
    fbSync.pushHospitalsList(list);
  }

  function save(data) {
    _h = data;
    localStorage.setItem("opd_hospital", JSON.stringify(data));
    addToSavedList(data);
    render();
    syncMRPreview();
    fbSync.init();
  }

  function get()    { return _h; }
  function code()   { return (_h?.code || "").toUpperCase(); }
  function mrPrefix() { return code() ? `MR-${code()}` : "MR"; }

  function render() {
    const bar     = $("#hospBar");
    const nameEl  = $("#hospBarName");
    const codeEl  = $("#hospBarCode");
    if (!bar) return;
    if (_h?.name) {
      if (nameEl) nameEl.textContent = _h.name;
      if (codeEl) codeEl.textContent = mrPrefix();
      bar.style.display = "flex";
    } else {
      bar.style.display = "none";
    }
  }

  async function detectAndShow() {
    const btn = document.querySelector("#setupAutoPane .btn-accent");
    if (btn) { btn.textContent = "Detecting\u2026"; btn.disabled = true; }
    try {
      if (!navigator.geolocation) { toast("Geolocation not supported on this device.", "err"); return; }
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "opd-tracker/1.0", "Accept-Language": "en" } }
      );
      const d = await r.json();
      const name = d.name || d.address?.amenity || d.address?.building || d.address?.hospital || "Detected location";
      const city = d.address?.city || d.address?.town || d.address?.county || "";
      const type = d.type || d.class || "place";
      const isHosp = ["hospital", "clinic", "healthcare", "doctors"].includes(type)
        || name.toLowerCase().includes("hospital")
        || name.toLowerCase().includes("clinic")
        || (d.address?.amenity || "").toLowerCase().includes("hospital");
      $("#detectedHospName").textContent = name;
      $("#detectedHospMeta").textContent =
        `${isHosp ? "\u2713 Healthcare facility" : "\u24d8 " + type} \u00b7 ${city}`;
      // Generate a code guess from initials
      const guess = name.replace(/[^a-z ]/gi, "").split(/\s+/)
        .filter(w => w.length > 1).map(w => w[0].toUpperCase()).join("").slice(0, 4);
      $("#detectedHospCode").value = guess;
      $("#detectedBox").dataset.lat     = lat;
      $("#detectedBox").dataset.lng     = lng;
      $("#detectedBox").dataset.city    = city;
      $("#detectedBox").dataset.rawName = name;
      $("#detectedBox").style.display   = "block";
    } catch {
      toast("Could not get location. Check browser permissions.", "err");
    } finally {
      if (btn) { btn.textContent = "\u1F4CD\u00a0 Detect My Location"; btn.disabled = false; }
    }
  }

  function saveFromModal() {
    const isAuto = document.getElementById("setupModeAuto").classList.contains("active");
    let name, code, city;
    if (isAuto) {
      const box = $("#detectedBox");
      if (box.style.display === "none") { $("#hospErr").textContent = "Detect your location first."; return; }
      name = box.dataset.rawName;
      code = ($("#detectedHospCode").value || "").trim().toUpperCase();
      city = box.dataset.city;
    } else {
      name = ($("#hospNameInput").value || "").trim();
      code = ($("#hospCodeInput").value || "").trim().toUpperCase();
      city = ($("#hospCityInput").value || "").trim();
    }
    $("#hospErr").textContent = "";
    if (!name) { $("#hospErr").textContent = "Hospital name is required."; return; }
    if (!code || code.length < 2) { $("#hospErr").textContent = "Short code must be at least 2 letters."; return; }
    save({ name, code, city, configuredAt: iso() });
    closeHospitalModal();
    toast(`Hospital saved: ${name} (${code}). MR# prefix updated.`, "ok");
  }

  async function switchTo(hospitalCode) {
    const list = savedList();
    const h = list.find(item => item.code === hospitalCode);
    if (!h) return;
    save(h); // updates _h, re-inits fbSync path
    // Reset db to this hospital's local cache (or empty)
    loadDB();
    renderDash();
    renderAdmissions();
    syncMRPreview();
    closeHospitalModal();
    toast(`Switched to ${h.name}`, "ok");
    // Pull latest from Firestore in background
    if (fbSync.isReady()) {
      const remote = await fbSync.pull();
      if (remote) {
        db.patients   = remote.patients.map(normPatient);
        db.visits     = remote.visits.map(normVisit);
        db.admissions = (remote.admissions || []).map(normAdmission);
        if (remote.meta) db.meta = { ...db.meta, ...remote.meta };
        saveDB();
        renderDash();
        renderAdmissions();
        syncMRPreview();
        toast(`${h.name} — records loaded from cloud.`, "ok");
      }
      await fbSync.pullPin();
    }
  }

  function renderSavedPane() {
    const pane = $("#setupSavedPane");
    if (!pane) return;
    const list = savedList();
    if (!list.length) {
      pane.innerHTML = '<p class="modal-hint">No saved hospitals yet. Use Auto-Detect or Manual Entry to add one.</p>';
      return;
    }
    const current = code();
    pane.innerHTML = "";
    list.forEach(h => {
      const btn = document.createElement("button");
      btn.className = "saved-hosp-item" + (current === h.code ? " active" : "");
      btn.type = "button";
      btn.innerHTML =
        `<span class="saved-hosp-name">${esc(h.name)}</span>` +
        `<span class="saved-hosp-meta">${esc(h.code)}${h.city ? " \u00b7 " + esc(h.city) : ""}</span>`;
      btn.addEventListener("click", () => switchTo(h.code));
      pane.appendChild(btn);
    });
  }

  return { load, save, get, code, mrPrefix, render, detectAndShow, saveFromModal, savedList, switchTo, renderSavedPane };
})();

window.hospital = hospital;

function openHospitalModal() {
  $("#hospErr").textContent = "";
  $("#detectedBox").style.display = "none";
  hospital.renderSavedPane();
  const h = hospital.get();
  if (hospital.savedList().length > 0) {
    hospSetupMode("saved");
  } else if (h) {
    hospSetupMode("manual");
    $("#hospNameInput").value = h.name || "";
    $("#hospCodeInput").value = h.code || "";
    $("#hospCityInput").value = h.city || "";
  } else {
    hospSetupMode("auto");
  }
  $("#hospitalModal").classList.add("open");
}

function closeHospitalModal() { $("#hospitalModal").classList.remove("open"); }

function hospSetupMode(mode) {
  $("#setupModeAuto").classList.toggle("active", mode === "auto");
  $("#setupModeManual").classList.toggle("active", mode === "manual");
  const savedBtn = $("#setupModeSaved");
  if (savedBtn) savedBtn.classList.toggle("active", mode === "saved");
  $("#setupAutoPane").style.display   = mode === "auto"   ? "" : "none";
  $("#setupManualPane").style.display = mode === "manual" ? "" : "none";
  const savedPane = $("#setupSavedPane");
  if (savedPane) savedPane.style.display = mode === "saved" ? "" : "none";
}

window.openHospitalModal  = openHospitalModal;
window.closeHospitalModal = closeHospitalModal;
window.hospSetupMode      = hospSetupMode;

// ── Firebase Sync Module ─────────────────────────────────────────────────────────────────
const fbSync = (() => {
  let _db   = null;
  let _path = null;

  function isReady() { return !!_db && !!_path; }

  function init() {
    const enabled = typeof FIREBASE_ENABLED !== "undefined" && FIREBASE_ENABLED;
    const cfg     = typeof FIREBASE_CONFIG  !== "undefined" ? FIREBASE_CONFIG : null;
    if (!enabled || !cfg?.apiKey) { setSyncStatus("offline"); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      _db   = firebase.firestore();
      _path = `hospitals/${hospital.code() || "default"}`;
      setSyncStatus("synced");
      pullHospitalsList();
      pullPin();
    } catch (e) {
      console.warn("Firebase init:", e);
      setSyncStatus("error");
    }
  }

  let _timer = null;
  function schedulePush() {
    clearTimeout(_timer);
    _timer = setTimeout(_push, 2500);
  }

  async function _push() {
    if (!isReady()) return;
    setSyncStatus("syncing");
    try {
      const docs = [
        ...db.patients.map(p   => ({ col: "patients",   id: p.id, data: p })),
        ...db.visits.map(v     => ({ col: "visits",     id: v.id, data: v })),
        ...db.admissions.map(a => ({ col: "admissions", id: a.id, data: a })),
      ];
      for (let i = 0; i < docs.length; i += 400) {
        const batch = _db.batch();
        docs.slice(i, i + 400).forEach(({ col, id, data }) =>
          batch.set(_db.doc(`${_path}/${col}/${id}`), data, { merge: true })
        );
        await batch.commit();
      }
      await _db.doc(`${_path}/meta/counters`).set(db.meta, { merge: true });
      setSyncStatus("synced");
    } catch (e) {
      console.warn("Firebase push:", e);
      setSyncStatus("error");
    }
  }

  async function pushPin(hashedPin) {
    if (!isReady()) return;
    try {
      await _db.doc(`${_path}/meta/pin`).set({ pin: hashedPin }, { merge: true });
    } catch (e) {
      console.warn("Firebase pin push:", e);
    }
  }

  async function pullPin() {
    if (!isReady()) return;
    try {
      const snap = await _db.doc(`${_path}/meta/pin`).get();
      if (!snap.exists) return;
      const remotePin = snap.data()?.pin;
      if (!remotePin) return;
      setEditorPin(remotePin); // Firestore is authoritative — always sync
    } catch (e) {
      console.warn("Firebase pin pull:", e);
    }
  }

  async function pull() {
    if (!isReady()) return null;
    setSyncStatus("syncing");
    try {
      const [pS, vS, aS, mS] = await Promise.all([
        _db.collection(`${_path}/patients`).get(),
        _db.collection(`${_path}/visits`).get(),
        _db.collection(`${_path}/admissions`).get(),
        _db.doc(`${_path}/meta/counters`).get(),
      ]);
      setSyncStatus("synced");
      return {
        patients:   pS.docs.map(d => d.data()),
        visits:     vS.docs.map(d => d.data()),
        admissions: aS.docs.map(d => d.data()),
        meta:       mS.exists ? mS.data() : null,
      };
    } catch (e) {
      console.warn("Firebase pull:", e);
      setSyncStatus("error");
      return null;
    }
  }

  async function pushHospitalsList(list) {
    if (!isReady()) return;
    try {
      await _db.doc("registry/hospitals").set({ list }, { merge: true });
    } catch (e) {
      console.warn("Firebase hospitals push:", e);
    }
  }

  async function pullHospitalsList() {
    if (!isReady()) return;
    try {
      const snap = await _db.doc("registry/hospitals").get();
      if (!snap.exists) return;
      const remoteList = snap.data()?.list || [];
      if (!remoteList.length) return;
      const localList = hospital.savedList();
      const merged = [...localList];
      remoteList.forEach(rh => {
        const idx = merged.findIndex(lh => lh.code === rh.code);
        if (idx >= 0) merged[idx] = rh; else merged.push(rh);
      });
      localStorage.setItem("opd_hospitals_list", JSON.stringify(merged));
    } catch (e) {
      console.warn("Firebase hospitals pull:", e);
    }
  }

  return { init, schedulePush, pull, isReady, pushHospitalsList, pushPin, pullPin };
})();

function calcAge(dob) {
  if (!dob) return { ageValue: 0, ageUnit: "Years" };
  const b = new Date(`${dob}T00:00:00`);
  const t = new Date(`${iso()}T00:00:00`);
  if (Number.isNaN(b.getTime()) || b > t) return { ageValue: 0, ageUnit: "Years" };
  const days = Math.floor((t - b) / 86400000);
  if (days < 31) return { ageValue: days, ageUnit: "Days" };
  const months =
    (t.getFullYear() - b.getFullYear()) * 12 +
    t.getMonth() -
    b.getMonth() -
    (t.getDate() < b.getDate() ? 1 : 0);
  if (months < 24) return { ageValue: Math.max(1, months), ageUnit: "Months" };
  let years = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) years -= 1;
  return { ageValue: Math.max(0, years), ageUnit: "Years" };
}

function ageLabel(p) {
  return `${p.ageValue || 0} ${p.ageUnit || "Years"}`;
}

function ageBand(p) {
  const value = Number(p?.ageValue || 0);
  const unit = p?.ageUnit || "Years";
  if (unit === "Days" || (unit === "Months" && value < 1)) return "Neonate";
  if (unit === "Months" || (unit === "Years" && value < 1)) return "Infant";
  if (value < 5) return "1-5 Years";
  return "5+ Years";
}

function sevTag(v) {
  v = lc(v);
  if (v === "emergency") return "rd";
  if (v === "follow-up") return "bl";
  return "gn";
}

function nextUhidPreview() {
  return `${hospital.mrPrefix()}-${pad((db.meta.patientCounter || 0) + 1)}`;
}

function nextId(kind, prefix) {
  db.meta[kind] = (db.meta[kind] || 0) + 1;
  if (kind === "patientCounter") return `${hospital.mrPrefix()}-${pad(db.meta[kind])}`;
  return `${prefix}${pad(db.meta[kind])}`;
}

function dbKey(suffix) {
  const code = hospital.code();
  return code ? `opd_${suffix}_${code}` : `opd_${suffix}`;
}

function saveDB() {
  localStorage.setItem(dbKey("p"),    JSON.stringify(db.patients));
  localStorage.setItem(dbKey("v"),    JSON.stringify(db.visits));
  localStorage.setItem(dbKey("a"),    JSON.stringify(db.admissions));
  localStorage.setItem(dbKey("meta"), JSON.stringify(db.meta));
  fbSync.schedulePush();
}

function normPatient(p, i) {
  const a = calcAge(p.dob || "");
  return {
    id: p.id || `PAT-${Date.now()}-${i}`,
    uhid: p.uhid || `MR-${pad(i + 1)}`,
    name: text(p.name),
    dob: p.dob || "",
    ageValue: Number(p.ageValue ?? p.age) || a.ageValue,
    ageUnit: p.ageUnit || a.ageUnit,
    gender: text(p.gender),
    area: text(p.area || p.address),
    address: text(p.address),
    guardian: text(p.guardian),
    phone: text(p.phone),
    emergencyName: text(p.emergencyName || p.emName),
    emergencyPhone: text(p.emergencyPhone || p.emPhone),
    bloodGroup: text(p.bloodGroup || p.blood),
    allergies: text(p.allergies || p.allergy),
    birthHistory: text(p.birthHistory),
    feedingHistory: text(p.feedingHistory),
    milestoneHistory: text(p.milestoneHistory || p.milestonesHistory),
    familyHistory: text(p.familyHistory),
    differentialDx: text(p.differentialDx),
    regNotes: text(p.regNotes || p.notes),
    weight: num(p.weight),
    height: num(p.height),
    createdAt: p.createdAt || iso(),
    hospitalId: p.hospitalId || (window.geolocationModule?.detectedHospital?.id || "HOSP-001"),
    registrationLocation: p.registrationLocation || (window.geolocationModule?.currentLocation || null),
  };
}

function normVisit(v, i) {
  return {
    id: v.id || `VIS-${pad(i + 1)}`,
    pid: v.pid || "",
    date: v.date || iso(),
    severity: text(v.severity) || "Routine",
    complaints: Array.isArray(v.complaints)
      ? v.complaints.filter(Boolean)
      : text(v.complaints).split(",").map((x) => x.trim()).filter(Boolean),
    notes: text(v.notes),
    source: text(v.source) || (text(v.severity) === "Emergency" ? "ER" : "OPD"),
    opdExam: text(v.opdExam),
    conditionAtPresentation: text(v.conditionAtPresentation || v.condition),
    erExam: text(v.erExam),
    erOtherSystems: text(v.erOtherSystems || v.erSystems),
    erManagement: text(v.erManagement),
    erOutcome: text(v.erOutcome),
    attendantName: text(v.attendantName),
    attendantPhone: text(v.attendantPhone),
    wt: num(v.wt),
    ht: num(v.ht),
    muac: num(v.muac),
    temp: num(v.temp),
    hr: num(v.hr),
    spo2: num(v.spo2),
    rr: num(v.rr),
    dx: text(v.dx),
    rx: text(v.rx),
    fu: v.fu || "",
    admitted: !!v.admitted,
    ward: text(v.ward),
    admReason: text(v.admReason),
    admissionId: text(v.admissionId),
    consultant: text(v.consultant),
    hospitalId: v.hospitalId || hospital.code() || "",
    hospitalName: v.hospitalName || hospital.get()?.name || "",
  };
}

function normAdmission(a, i) {
  return {
    id: a.id || `ADM-${pad(i + 1)}`,
    pid: a.pid || "",
    visitId: a.visitId || "",
    openedOn: a.openedOn || a.date || iso(),
    dischargeDate: a.dischargeDate || "",
    status: text(a.status) || "Admitted",
    source: text(a.source) || "OPD",
    wardBed: text(a.wardBed || a.ward),
    consultant: text(a.consultant),
    reason: text(a.reason || a.admReason),
    history: text(a.history),
    pastHistory: text(a.pastHistory),
    familyHistory: text(a.familyHistory),
    allergies: text(a.allergies),
    diagnosis: text(a.diagnosis || a.dx),
    treatment: text(a.treatment || a.rx),
    labs: text(a.labs),
    procedures: text(a.procedures),
    managementTimeline: text(a.managementTimeline),
    anthropometryNote: text(a.anthropometryNote),
    outcome: text(a.outcome),
    specialNotes: text(a.specialNotes),
    exam: {
      general: text(a.exam?.general),
      respiratory: text(a.exam?.respiratory),
      cvs: text(a.exam?.cvs),
      cns: text(a.exam?.cns),
      git: text(a.exam?.git),
    },
    createdAt: a.createdAt || iso(),
    updatedAt: a.updatedAt || iso(),
    hospitalId: a.hospitalId || hospital.code() || "",
    hospitalName: a.hospitalName || hospital.get()?.name || "",
  };
}

function seed() {
  db.patients = [
    normPatient({ id: "PAT-1", uhid: "MR-000001", name: "Ahmed Ali", ageValue: 5, ageUnit: "Years", gender: "Male", area: "Bahawalpur", guardian: "Tariq Ali", phone: "03001234567", bloodGroup: "O+", allergies: "No known drug allergies", weight: 18, height: 108, createdAt: "2026-04-01" }, 0),
    normPatient({ id: "PAT-2", uhid: "MR-000002", name: "Fatima Bibi", ageValue: 8, ageUnit: "Months", gender: "Female", area: "Rahim Yar Khan", guardian: "Nasreen", phone: "03119876543", allergies: "Cow milk protein allergy", weight: 7.4, height: 66, createdAt: "2026-04-02" }, 1),
    normPatient({ id: "PAT-3", uhid: "MR-000003", name: "Bilal Khan", ageValue: 3, ageUnit: "Years", gender: "Male", area: "Multan", guardian: "Imran Khan", phone: "03211112222", weight: 13, height: 95, createdAt: "2026-04-03" }, 2),
  ];
  db.visits = [
    normVisit({ id: "VIS-000001", pid: "PAT-1", date: "2026-04-05", severity: "Routine", complaints: ["Fever", "Cough"], notes: "Runny nose for 2 days.", wt: 18, ht: 108, temp: 101.2, hr: 118, spo2: 97, rr: 28, dx: "URTI", rx: "Paracetamol and fluids.", fu: "2026-04-08" }, 0),
    normVisit({ id: "VIS-000002", pid: "PAT-2", date: "2026-04-06", severity: "Routine", complaints: ["Diarrhea", "Vomiting"], notes: "Watery stools and poor intake.", wt: 7.2, ht: 66, temp: 99.8, hr: 134, spo2: 99, rr: 34, dx: "AGE with dehydration", rx: "ORS, IV fluids, Zinc.", admitted: true, ward: "Ward B / Bed 2", admReason: "Needs IV fluids and input-output monitoring", consultant: "Dr. Sara" }, 1),
    normVisit({ id: "VIS-000003", pid: "PAT-3", date: "2026-04-07", severity: "Routine", complaints: ["Fever", "Rash"], notes: "Rash over trunk.", wt: 13, ht: 95, temp: 102.5, dx: "Measles suspected", rx: "Vitamin A, Paracetamol", fu: "2026-04-10" }, 2),
    normVisit({ id: "VIS-000004", pid: "PAT-1", date: iso(), severity: "Follow-up", complaints: ["Cough"], notes: "Follow-up visit. Fever resolved.", wt: 17.8, ht: 108, temp: 98.6, dx: "Resolving URTI", rx: "Paracetamol if needed." }, 3),
  ];
  db.admissions = [
    normAdmission({ id: "ADM-000001", pid: "PAT-2", visitId: "VIS-000002", openedOn: "2026-04-06", status: "Admitted", wardBed: "Ward B / Bed 2", consultant: "Dr. Sara", reason: "AGE with dehydration requiring IV fluids.", history: "Loose stools x6, vomiting x3, poor oral intake, reduced urine output.", allergies: "Cow milk protein allergy", diagnosis: "Acute gastroenteritis with dehydration", treatment: "IV fluids, ORS, Zinc, monitoring charting.", labs: "CBC, electrolytes sent.", specialNotes: "Watch hydration status closely.", exam: { general: "Irritable, dry mucosa, mild sunken eyes.", respiratory: "No distress.", cvs: "Tachycardia, delayed refill.", cns: "Alert, no focal deficit." } }, 0),
  ];
  db.meta = { patientCounter: 3, visitCounter: 4, admissionCounter: 1 };
}

function loadDB() {
  // Per-hospital key with fallback to legacy unprefixed key (migration)
  const get = (s) => localStorage.getItem(dbKey(s)) || localStorage.getItem(`opd_${s}`) || null;
  db.patients   = (JSON.parse(get("p")    || "[]") || []).map(normPatient);
  db.visits     = (JSON.parse(get("v")    || "[]") || []).map(normVisit);
  db.admissions = (JSON.parse(get("a")    || "[]") || []).map(normAdmission);
  db.meta       = JSON.parse(get("meta")  || '{"patientCounter":0,"visitCounter":0,"admissionCounter":0}') || db.meta;
  if (!db.patients.length && !db.visits.length && !db.admissions.length) seed();
  const pids = new Set(db.patients.map((p) => p.id));
  db.visits = db.visits.filter((v) => pids.has(v.pid));
  db.admissions = db.admissions.filter((a) => pids.has(a.pid));
  db.visits.forEach((v) => {
    if (!v.admitted) return;
    let a = db.admissions.find((x) => x.id === v.admissionId);
    if (!a) {
      a = normAdmission({ id: `ADM-${pad(db.admissions.length + 1)}`, pid: v.pid, visitId: v.id, openedOn: v.date, wardBed: v.ward, reason: v.admReason, history: v.notes, diagnosis: v.dx, treatment: v.rx, consultant: v.consultant, status: "Admitted" }, db.admissions.length);
      db.admissions.push(a);
      v.admissionId = a.id;
    }
  });
  db.meta.patientCounter = Math.max(db.meta.patientCounter || 0, ...db.patients.map((p) => idNum(p.uhid)), db.patients.length);
  db.meta.visitCounter = Math.max(db.meta.visitCounter || 0, ...db.visits.map((v) => idNum(v.id)), db.visits.length);
  db.meta.admissionCounter = Math.max(db.meta.admissionCounter || 0, ...db.admissions.map((a) => idNum(a.id)), db.admissions.length);
  saveDB();
}

function byDateDesc(a, b, key) {
  return new Date(b[key]) - new Date(a[key]);
}

function patient(pid) {
  return db.patients.find((p) => p.id === pid);
}

function visit(vid) {
  return db.visits.find((v) => v.id === vid);
}

function admission(aid) {
  return db.admissions.find((a) => a.id === aid);
}

function patientVisits(pid) {
  return db.visits.filter((v) => v.pid === pid).sort((a, b) => byDateDesc(a, b, "date"));
}

function patientAdmissions(pid) {
  return db.admissions.filter((a) => a.pid === pid).sort((a, b) => byDateDesc(a, b, "openedOn"));
}

function activeAdmission(pid) {
  return db.admissions.find((a) => a.pid === pid && a.status === "Admitted");
}

function searchPatients(q) {
  q = lc(q);
  if (!q) return [];
  return db.patients
    .map((p) => {
      let s = 0;
      const n = lc(p.name), g = lc(p.guardian), ar = lc(p.area), ph = lc(p.phone), mr = lc(p.uhid);
      if (mr === q) s += 120;
      if (n === q) s += 100;
      if (n.includes(q)) s += 45;
      if (g.includes(q)) s += 20;
      if (ar.includes(q)) s += 18;
      if (ph.includes(q)) s += 18;
      return { p, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}

function dupes() {
  const name = lc($("#rName").value);
  const area = lc($("#rArea").value);
  const guardian = lc($("#rGuardian").value);
  const gender = lc($("#rGender").value);
  const age = Number($("#rAge").value || 0);
  if (!name) return [];
  return db.patients
    .map((p) => {
      let s = 0;
      if (lc(p.name) === name) s += 70;
      else if (lc(p.name).includes(name) || name.includes(lc(p.name))) s += 35;
      if (area && lc(p.area) === area) s += 20;
      if (guardian && lc(p.guardian) === guardian) s += 16;
      if (gender && lc(p.gender) === gender) s += 5;
      if (age && Math.abs((p.ageValue || 0) - age) <= 1) s += 8;
      return { p, s };
    })
    .filter((x) => x.s >= 30)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
}

function moveInk() {
  const a = $(".tab.active");
  const ink = $("#tabInk");
  if (!a) return;
  const p = $("#tabsInner").getBoundingClientRect();
  const r = a.getBoundingClientRect();
  ink.style.left = `${r.left - p.left}px`;
  ink.style.width = `${r.width}px`;
}

function switchTab(name) {
  if (security.role !== "editor" && ["register", "visit"].includes(name)) {
    toast("Unlock editing to add or modify records.", "err");
    name = "search";
  }
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("active", p.id === `pane-${name}`));
  moveInk();
  if (name === "dashboard") renderDash();
  if (name === "admissions") renderAdmissions();
}

function renderDupes() {
  const list = dupes();
  const card = $("#rDupesCard");
  if (!list.length) {
    card.style.display = "none";
    $("#rDupes").innerHTML = "";
    return;
  }
  card.style.display = "";
  $("#rDupes").innerHTML = list
    .map(
      ({ p, s }) => `
        <div class="mini-card">
          <div>
            <div class="mini-title">${esc(p.name)} <span class="tag tag-bl">${esc(p.uhid)}</span></div>
            <div class="mini-sub">${esc(ageLabel(p))} · ${esc(p.gender)} · ${esc(p.area || "No area")}</div>
            <div class="mini-sub">${esc(p.guardian || "No guardian")} · match ${s}%</div>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" onclick="useExistingPatient('${p.id}')">Open</button>
        </div>
      `
    )
    .join("");
}

function renderDash() {
  const today = iso();
  const tvis = db.visits.filter((v) => v.date === today);
  const active = db.admissions.filter((a) => a.status === "Admitted");
  const opdToday = tvis.filter((v) => v.source === "OPD").length;
  const erToday = tvis.filter((v) => v.source === "ER").length;
  const wardToday = tvis.filter((v) => v.admissionId).length;
  $("#stPat").textContent = db.patients.length;
  $("#stTod").textContent = tvis.length;
  $("#stAdm").textContent = active.length;
  $("#stVis").textContent = db.visits.length;
  $("#deskFlowStrip").innerHTML = `
    <div class="audit-stat tone-blue"><span>OPD Today</span><strong>${opdToday}</strong></div>
    <div class="audit-stat tone-red"><span>ER Today</span><strong>${erToday}</strong></div>
    <div class="audit-stat tone-green"><span>Sent to Ward</span><strong>${wardToday}</strong></div>
    <div class="audit-stat tone-violet"><span>Flow Rate</span><strong>${tvis.length} seen</strong></div>
  `;

  $("#dashToday").innerHTML = tvis.length
    ? tvis
        .map((v) => {
          const p = patient(v.pid);
          return `<div class="li" onclick="openVisitInRecord('${v.id}')"><div class="li-top"><span class="li-name">${esc(p?.name || "Unknown")}</span><span><span class="tag tag-${sevTag(v.severity)}">${esc(v.severity)}</span><span class="tag tag-pp">${esc(v.source)}</span>${v.admissionId ? '<span class="tag tag-rd">ADM</span>' : ""}</span></div><div class="li-sub">${esc(p?.uhid || "")} · ${esc(v.dx || "Diagnosis pending")}</div></div>`;
        })
        .join("")
    : '<p class="empty">No visits today.</p>';

  $("#dashAdmissions").innerHTML = active.length
    ? active
        .slice(0, 6)
        .map((a) => {
          const p = patient(a.pid);
          return `<div class="mini-card"><div><div class="mini-title">${esc(p?.name || "Unknown")} <span class="tag tag-rd">${esc(a.id)}</span></div><div class="mini-sub">${esc(p?.uhid || "")} · ${esc(a.wardBed || "Ward pending")}</div><div class="mini-sub">${esc(a.reason || a.diagnosis || "No reason entered")}</div></div><button class="btn btn-ghost btn-sm" type="button" onclick="openAdmissionInRecord('${a.id}')">Open</button></div>`;
        })
        .join("")
    : '<p class="empty">No active admissions.</p>';

  const alerts = [];
  db.patients.forEach((p) => {
    const pv = patientVisits(p.id);
    const recent = pv.filter((v) => (new Date(`${today}T00:00:00`) - new Date(`${v.date}T00:00:00`)) / 86400000 <= 14);
    if (recent.length >= 3) alerts.push(`<strong>${esc(p.name)}</strong> had ${recent.length} visits in 14 days.`);
    const w = pv.filter((v) => v.wt);
    if (w.length >= 2 && w[0].wt < w[1].wt) alerts.push(`<strong>${esc(p.name)}</strong> lost ${(w[1].wt - w[0].wt).toFixed(1)} kg since last visit.`);
    if (p.allergies && pv[0]) alerts.push(`<strong>${esc(p.name)}</strong> allergies: ${esc(p.allergies)}.`);
  });

  $("#alertCard").style.display = alerts.length ? "" : "none";
  $("#dashAlerts").innerHTML = alerts.slice(0, 8).map((a) => `<div class="alert-i">${a}</div>`).join("");
}

function renderPatientDD(list) {
  $("#vDD").innerHTML = list.length
    ? list
        .slice(0, 8)
        .map((p) => `<div class="dd-item" data-id="${p.id}"><strong>${esc(p.name)}</strong><small>${esc(p.uhid)} · ${esc(ageLabel(p))} · ${esc(p.area || "No area")}</small></div>`)
        .join("")
    : '<div class="dd-item"><small>No patients found</small></div>';
  $("#vDD").classList.add("show");
}

function pickVisitPatient(p) {
  state.patientId = p.id;
  $("#vPid").value = p.id;
  $("#vSearch").value = "";
  $("#vDD").classList.remove("show");
  $("#vBadge").innerHTML = `<span><strong>${esc(p.name)}</strong> · ${esc(p.uhid)} · ${esc(ageLabel(p))} · ${esc(p.area || "No area")}</span><button class="badge-x" type="button" onclick="clearVisitPt()">×</button>`;
  $("#vBadge").style.display = "flex";
  if (p.allergies) {
    $("#vAllergyWarn").style.display = "block";
    $("#vAllergyWarn").textContent = `Allergy alert: ${p.allergies}`;
  } else {
    $("#vAllergyWarn").style.display = "none";
  }
}

function clearVisitPt() {
  state.patientId = "";
  $("#vPid").value = "";
  $("#vBadge").style.display = "none";
  $("#vAllergyWarn").style.display = "none";
}

function setSeverity(v) {
  $("#vSev").value = v;
  const source = v === "Emergency" ? "ER" : "OPD";
  $("#vSource").value = source;
  $("#vSourceNote").textContent = `Encounter source: ${source}`;
  $("#vAdmitLabel").textContent = source === "ER" ? "Refer / admit to ward from ER" : `Admit from ${source}`;
  $("#visitGuide").textContent =
    source === "ER"
      ? "Emergency encounters capture condition at presentation, provisional examination, ER management, and whether the child was sent onward to the ward."
      : "OPD encounters capture focused examination, diagnosis, treatment advised, and follow-up.";
  $("#vOpdSection").style.display = source === "OPD" ? "block" : "none";
  $("#vErSection").style.display = source === "ER" ? "block" : "none";
  $$(".sev").forEach((b) => {
    b.classList.remove("on-routine", "on-urgent", "on-emergency", "on-followup");
    if (b.dataset.s === v) b.classList.add({ Routine: "on-routine", Emergency: "on-emergency", "Follow-up": "on-followup" }[v]);
  });
}

function resetVisit() {
  $("#frmVisit").reset();
  clearVisitPt();
  state.complaints.clear();
  $$(".chip").forEach((c) => c.classList.remove("on"));
  $("#vAdmitBox").style.display = "none";
  setSeverity("Routine");
}

function applyRole() {
  const viewer = security.role !== "editor";
  $("#roleLabel").textContent = viewer ? "View-only" : "Editing unlocked";
  $("#roleBtn").textContent = viewer ? "Unlock Editing" : "Lock Editing";
  $("#importBtn").style.display = viewer ? "none" : "";

  ["register", "visit"].forEach((tabName) => {
    const tab = document.querySelector(`.tab[data-tab="${tabName}"]`);
    if (!tab) return;
    tab.classList.toggle("locked", viewer);
    tab.disabled = viewer;
    tab.title = viewer ? "Unlock editing to use this tab" : "";
  });

  ["#pane-register", "#pane-visit"].forEach((pane) => {
    document.querySelectorAll(`${pane} input, ${pane} select, ${pane} textarea, ${pane} button`).forEach((el) => {
      if (el.classList.contains("tab")) return;
      el.disabled = viewer;
    });
  });

  document.querySelectorAll("#frmAdmission input, #frmAdmission select, #frmAdmission textarea, #frmAdmission button").forEach((el) => {
    el.disabled = viewer;
  });

  // Re-lock historically sealed fields — even editors cannot alter past encounter records
  document.querySelectorAll("[data-hist-locked]").forEach((el) => { el.disabled = true; });

  if (viewer && ["pane-register", "pane-visit"].includes(document.querySelector(".pane.active")?.id)) {
    switchTab("search");
  }
}

async function toggleRole() {
  if (security.role === "editor") {
    security.role = "viewer";
    applyRole();
    toast("Editing locked.", "ok");
    return;
  }

  const hospName = hospital.get()?.name || "this hospital";
  if (!getEditorPin()) {
    const first = await showPinModal(
      "Set Hospital PIN",
      `Create a PIN (4\u20136 digits) for ${hospName}. Only doctors at this hospital will be able to unlock editing.`,
      "Set PIN"
    );
    if (first === null) return;
    if (first.length < 4) { toast("PIN must be at least 4 digits.", "err"); return; }
    const second = await showPinModal(
      "Confirm PIN",
      "Re-enter your PIN to confirm.",
      "Confirm"
    );
    if (second === null) return;
    if (first !== second) { toast("PINs did not match. Try again.", "err"); return; }
    setEditorPin(first);
    fbSync.pushPin(first);
    security.role = "editor";
    applyRole();
    toast(`PIN set for ${hospName}. Editing unlocked.`, "ok");
    return;
  }

  const entered = await showPinModal(
    "Unlock Editing",
    `Enter the PIN for ${hospName} to enable editing mode.`,
    "Unlock"
  );
  if (entered === null) return;
  if (entered !== getEditorPin()) {
    toast("Incorrect PIN.", "err");
    return;
  }
  security.role = "editor";
  applyRole();
  toast("Editing unlocked.", "ok");
}

function spark(points, color) {
  if (!points.length) return "";
  const w = 260;
  const h = 90;
  const p = 12;
  const min = Math.min(...points.map((x) => x.value));
  const max = Math.max(...points.map((x) => x.value));
  const spread = max - min || 1;
  const step = points.length === 1 ? 0 : (w - p * 2) / (points.length - 1);
  const line = points.map((pt, i) => `${p + step * i},${h - p - ((pt.value - min) / spread) * (h - p * 2)}`).join(" ");
  const dots = points.map((pt, i) => `<circle cx="${p + step * i}" cy="${h - p - ((pt.value - min) / spread) * (h - p * 2)}" r="3" fill="${color}"></circle>`).join("");
  const labels = points.map((pt, i) => `<text x="${p + step * i}" y="${h - 2}" text-anchor="middle">${esc(i ? pt.date.slice(5) : "Reg")}</text>`).join("");
  return `<svg class="trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="${p}" y1="${h - p}" x2="${w - p}" y2="${h - p}" class="trend-axis"></line><polyline fill="none" stroke="${color}" stroke-width="2.5" points="${line}"></polyline>${dots}<text x="${p}" y="12">${min.toFixed(1)}</text><text x="${w - p}" y="12" text-anchor="end">${max.toFixed(1)}</text>${labels}</svg>`;
}

function metricSeries(p, visits, key, seedVal) {
  const out = [];
  if (seedVal) out.push({ date: p.createdAt, value: seedVal });
  visits.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((v) => { if (v[key]) out.push({ date: v.date, value: v[key] }); });
  return out.slice(-8);
}

function visitCard(v) {
  const vitals = [v.wt ? `Wt ${v.wt} kg` : "", v.ht ? `Ht ${v.ht} cm` : "", v.muac ? `MUAC ${v.muac} cm` : "", v.temp ? `Temp ${v.temp} F` : "", v.hr ? `HR ${v.hr}` : "", v.spo2 ? `SpO2 ${v.spo2}%` : "", v.rr ? `RR ${v.rr}` : ""].filter(Boolean).join(" · ");
  return `<div class="v-card ${v.admissionId ? "adm" : ""}"><div class="v-card-top"><span class="v-card-date">${fmtDate(v.date)}</span><span><span class="tag tag-${sevTag(v.severity)}">${esc(v.severity)}</span><span class="tag tag-pp">${esc(v.source)}</span>${v.admissionId ? `<button class="tag-btn" type="button" onclick="openAdmission('${v.admissionId}', true)">Open Admission</button>` : ""}</span></div><div class="v-card-body"><div class="wrap-tags">${v.complaints.map((c) => `<span class="tag tag-bl">${esc(c)}</span>`).join("")}</div>${v.dx ? `<strong>Diagnosis:</strong> ${esc(v.dx)}<br>` : ""}${v.rx ? `<strong>Plan:</strong> ${esc(v.rx)}<br>` : ""}${v.notes ? `${esc(v.notes)}<br>` : ""}${v.attendantName ? `<strong>Attendant:</strong> ${esc(v.attendantName)}${v.attendantPhone ? ` · ${esc(v.attendantPhone)}` : ""}<br>` : ""}${vitals ? `<strong>Vitals:</strong> ${esc(vitals)}<br>` : ""}${v.fu ? `<strong>Follow-up:</strong> ${fmtDate(v.fu)}` : ""}</div></div>`;
}

function admMini(a) {
  return `<div class="mini-card"><div><div class="mini-title">${esc(a.id)} <span class="tag tag-${a.status === "Admitted" ? "rd" : "gn"}">${esc(a.status)}</span> <span class="tag tag-pp">${esc(a.source)}</span></div><div class="mini-sub">${fmtDate(a.openedOn)} · ${esc(a.wardBed || "Ward pending")}</div><div class="mini-sub">${esc(a.reason || a.diagnosis || "No reason entered")}</div></div><button class="btn btn-ghost btn-sm" type="button" onclick="openAdmission('${a.id}', true)">Open</button></div>`;
}

function showDetail(pid) {
  const p = patient(pid);
  if (!p) return;
  state.patientId = pid;
  const pv = patientVisits(pid);
  const pa = patientAdmissions(pid);
  const active = pa.filter((a) => a.status === "Admitted");
  const latest = pv[0];
  const wt = metricSeries(p, pv, "wt", p.weight);
  const ht = metricSeries(p, pv, "ht", p.height);
  const muac = latest?.muac ? `${latest.muac} cm` : "—";
  const init = p.name.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "P";

  let html = `<div class="det-hdr"><div class="det-av">${esc(init)}</div><div><div class="det-name">${esc(p.name)}</div><div class="det-meta">${esc(p.uhid)} · ${esc(ageLabel(p))} · ${esc(p.gender || "Gender not entered")}</div><div class="det-meta">${esc(p.area || "No area")} · ${esc(p.guardian || "No guardian")}${p.phone ? ` · ${esc(p.phone)}` : ""}</div></div></div><div class="btn-row">${security.role === "editor" ? `<button class="btn btn-ghost btn-sm" type="button" onclick="startVisitForPatient('${p.id}')">New Visit</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" onclick="focusAdmissionsForPatient('${p.id}')">View Admissions</button><button class="btn btn-ghost btn-sm" type="button" onclick="sharePatientTimeline('${p.id}')">Share Timeline</button></div><div class="summary-strip"><div class="summary-pill"><span>Total Visits</span><strong>${pv.length}</strong></div><div class="summary-pill"><span>Admissions</span><strong>${pa.length}</strong></div><div class="summary-pill"><span>Latest Dx</span><strong>${esc(latest?.dx || "—")}</strong></div><div class="summary-pill"><span>Allergies</span><strong>${esc(p.allergies || "—")}</strong></div></div>`;

  if (wt.length || ht.length || muac !== "—") {
    html += `<div class="det-stitle">Anthropometric Trend</div><div class="trend-grid"><div class="trend-card"><div class="trend-head">Weight</div><div class="trend-value">${wt.length ? `${wt[wt.length - 1].value} kg` : "—"}</div>${wt.length ? spark(wt, "#58a6ff") : '<div class="empty-inline">No weight history</div>'}</div><div class="trend-card"><div class="trend-head">Height / Length</div><div class="trend-value">${ht.length ? `${ht[ht.length - 1].value} cm` : "—"}</div>${ht.length ? spark(ht, "#3fb950") : '<div class="empty-inline">No height history</div>'}</div><div class="trend-card"><div class="trend-head">Latest MUAC</div><div class="trend-value">${esc(muac)}</div><div class="mini-sub">Pulled from the most recent OPD visit if entered.</div></div></div>`;
  }

  html += `<div class="det-stitle">Profile</div><dl class="info-grid"><dt>Guardian</dt><dd>${esc(p.guardian || "—")}</dd><dt>Area</dt><dd>${esc(p.area || "—")}</dd><dt>Address</dt><dd>${esc(p.address || "—")}</dd><dt>Emergency</dt><dd>${esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(" · ") || "—")}</dd><dt>Blood Group</dt><dd>${esc(p.bloodGroup || "—")}</dd><dt>Registered</dt><dd>${fmtDate(p.createdAt)}</dd></dl>`;

  if (pa.length) {
    html += `<div class="det-stitle">Admissions</div>${active.length ? active.map(admMini).join("") : '<div class="mini-sub">No active admission right now.</div>'}`;
    const old = pa.filter((a) => a.status === "Discharged");
    if (old.length) html += `<div class="mini-sub mt12">Previous admissions</div>${old.slice(0, 5).map(admMini).join("")}`;
  }

  html += `<div class="det-stitle">OPD Visits (${pv.length})</div>${pv.length ? pv.map(visitCard).join("") : '<p class="empty">No visits recorded.</p>'}`;
  $("#detailBody").innerHTML = html;
  $("#detailCard").style.display = "";
  $("#sResults").innerHTML = "";
  $("#sInput").value = "";
  switchTab("search");
}

function formatVitals(v) {
  return [
    v.wt ? `Wt ${v.wt} kg` : "",
    v.ht ? `Ht ${v.ht} cm` : "",
    v.muac ? `MUAC ${v.muac} cm` : "",
    v.temp ? `Temp ${v.temp} F` : "",
    v.hr ? `HR ${v.hr}` : "",
    v.spo2 ? `SpO2 ${v.spo2}%` : "",
    v.rr ? `RR ${v.rr}` : "",
  ].filter(Boolean).join(" · ");
}

function recordVisitCard(v) {
  const a = admission(v.admissionId);
  const ward = a ? `<button class="tag-btn" type="button" onclick="openAdmissionInRecord('${a.id}')">Ward</button>` : "";
  return `<div class="v-card ${state.recordFocusType === "visit" && state.recordFocusId === v.id ? "focus" : ""}"><div class="v-card-top"><span class="v-card-date">${fmtDate(v.date)}</span><span><span class="tag tag-${sevTag(v.severity)}">${esc(v.severity)}</span><span class="tag tag-${v.source === "ER" ? "rd" : "pp"}">${esc(v.source)}</span>${ward}</span></div><div class="v-card-body"><div class="wrap-tags">${v.complaints.map((c) => `<span class="tag tag-bl">${esc(c)}</span>`).join("")}</div>${v.dx ? `<strong>Diagnosis:</strong> ${esc(v.dx)}<br>` : ""}${formatVitals(v) ? `<strong>Vitals:</strong> ${esc(formatVitals(v))}<br>` : ""}${v.source === "ER" ? `<strong>Condition:</strong> ${esc(v.conditionAtPresentation || "—")} · <strong>Outcome:</strong> ${esc(v.erOutcome || "—")}` : `${v.fu ? `<strong>Follow-up:</strong> ${fmtDate(v.fu)}` : ""}`}<div class="btn-row mt12"><button class="btn btn-ghost btn-sm" type="button" onclick="openVisitInRecord('${v.id}')">Open</button></div></div></div>`;
}

function recordAdmissionMini(a) {
  return `<div class="mini-card"><div><div class="mini-title">${esc(a.id)} <span class="tag tag-${a.status === "Admitted" ? "rd" : "gn"}">${esc(a.status)}</span> <span class="tag tag-pp">${esc(a.source)}</span></div><div class="mini-sub">${fmtDate(a.openedOn)} · ${esc(a.wardBed || "Ward pending")}</div><div class="mini-sub">${esc(a.reason || a.diagnosis || "No reason entered")}</div></div><button class="btn btn-ghost btn-sm" type="button" onclick="openAdmissionInRecord('${a.id}')">Open</button></div>`;
}

function renderTimelineVisitItem(v) {
  const hosp = v.hospitalName || v.hospitalId || "";
  const hospBadge = hosp ? `<span class="hosp-badge-sm">${esc(hosp)}</span>` : "";
  const vitals = formatVitals(v);
  const isER = v.source === "ER";
  const dotCls = isER ? "tl-dot-er" : v.severity === "Follow-up" ? "tl-dot-fu" : "tl-dot-opd";
  return `<div class="tl-event">
    <div class="tl-dot ${dotCls}"></div>
    <div class="tl-body">
      <div class="tl-hdr">
        <span class="tl-date">${fmtDate(v.date)}</span>
        <span class="tag tag-${sevTag(v.severity)}">${esc(v.severity)}</span>
        <span class="tag tag-${isER ? "rd" : "pp"}">${esc(v.source)}</span>
        ${hospBadge}
        ${v.admissionId ? `<button class="tag-btn" type="button" onclick="openAdmissionInRecord('${v.admissionId}')">Ward</button>` : ""}
      </div>
      <div class="tl-content">
        ${v.complaints.length ? `<div class="wrap-tags" style="margin-bottom:5px">${v.complaints.map((c) => `<span class="tag tag-bl">${esc(c)}</span>`).join("")}</div>` : ""}
        ${v.dx ? `<div class="tl-row"><strong>Diagnosis:</strong> ${esc(v.dx)}</div>` : ""}
        ${v.rx ? `<div class="tl-row"><strong>Plan:</strong> ${esc(v.rx)}</div>` : ""}
        ${vitals ? `<div class="tl-row"><strong>Vitals:</strong> ${esc(vitals)}</div>` : ""}
        ${v.attendantName ? `<div class="tl-row"><strong>Attendant:</strong> ${esc(v.attendantName)}${v.attendantPhone ? ` · ${esc(v.attendantPhone)}` : ""}</div>` : ""}
        ${v.fu ? `<div class="tl-row"><strong>Follow-up:</strong> ${fmtDate(v.fu)}</div>` : ""}
        ${isER && v.conditionAtPresentation ? `<div class="tl-row"><strong>Condition:</strong> ${esc(v.conditionAtPresentation)} · <strong>Outcome:</strong> ${esc(v.erOutcome || "—")}</div>` : ""}
      </div>
      <div class="btn-row mt12"><button class="btn btn-ghost btn-sm" type="button" onclick="openVisitInRecord('${v.id}')">Details</button></div>
    </div>
  </div>`;
}

function renderTimelineAdmissionItem(a) {
  const hosp = a.hospitalName || a.hospitalId || "";
  const hospBadge = hosp ? `<span class="hosp-badge-sm">${esc(hosp)}</span>` : "";
  const spanDays = Math.max(1, Math.round((new Date(`${a.dischargeDate || iso()}T00:00:00`) - new Date(`${a.openedOn}T00:00:00`)) / 86400000) + 1);
  return `<div class="tl-event tl-event-adm">
    <div class="tl-dot tl-dot-adm"></div>
    <div class="tl-body tl-body-adm">
      <div class="tl-hdr">
        <span class="tl-date">${fmtDate(a.openedOn)}</span>
        <span class="tag tag-${a.status === "Admitted" ? "rd" : "gn"}">${esc(a.status)}</span>
        <span class="tag tag-pp">${esc(a.source)}</span>
        ${hospBadge}
      </div>
      <div class="tl-subtitle">${esc(a.id)} · ${esc(a.wardBed || "Ward pending")} · ${spanDays} day${spanDays > 1 ? "s" : ""}${a.dischargeDate ? ` · Discharged ${fmtDate(a.dischargeDate)}` : ""}</div>
      <div class="tl-content">
        ${a.reason ? `<div class="tl-row"><strong>Reason:</strong> ${esc(a.reason)}</div>` : ""}
        ${a.diagnosis ? `<div class="tl-row"><strong>Diagnosis:</strong> ${esc(a.diagnosis)}</div>` : ""}
        ${a.treatment ? `<div class="tl-row"><strong>Treatment:</strong> ${esc(a.treatment)}</div>` : ""}
        ${a.outcome ? `<div class="tl-row"><strong>Outcome:</strong> ${esc(a.outcome)}</div>` : ""}
        ${a.consultant ? `<div class="tl-row"><strong>Consultant:</strong> ${esc(a.consultant)}</div>` : ""}
      </div>
      <div class="btn-row mt12"><button class="btn btn-ghost btn-sm" type="button" onclick="openAdmissionInRecord('${a.id}')">Open Ward Record</button></div>
    </div>
  </div>`;
}

function renderRecordFocus(p) {
  if (state.recordFocusType === "admission" && state.recordFocusId) {
    const a = admission(state.recordFocusId);
    if (!a) return "";
    const spanDays = Math.max(1, Math.round((new Date(`${a.dischargeDate || iso()}T00:00:00`) - new Date(`${a.openedOn}T00:00:00`)) / 86400000) + 1);
    return `<div class="det-stitle">Selected Ward Record</div><div class="focus-panel"><div class="summary-strip"><div class="summary-pill"><span>Ward</span><strong>${esc(a.wardBed || "—")}</strong></div><div class="summary-pill"><span>Status</span><strong>${esc(a.status)}</strong></div><div class="summary-pill"><span>Hospital Span</span><strong>${spanDays} day${spanDays > 1 ? "s" : ""}</strong></div><div class="summary-pill"><span>Diagnosis</span><strong>${esc(a.diagnosis || "—")}</strong></div></div><div class="focus-grid"><div><strong>History</strong><p>${esc(a.history || "—")}</p></div><div><strong>Family History</strong><p>${esc(a.familyHistory || "—")}</p></div><div><strong>Allergies</strong><p>${esc(a.allergies || p.allergies || "—")}</p></div><div><strong>Anthropometry</strong><p>${esc(a.anthropometryNote || "—")}</p></div><div><strong>Systemic Exam</strong><p>${esc([a.exam.general, a.exam.respiratory, a.exam.cvs, a.exam.cns, a.exam.git].filter(Boolean).join(" | ") || "—")}</p></div><div><strong>Labs / Management</strong><p>${esc([a.labs, a.managementTimeline, a.treatment, a.procedures].filter(Boolean).join(" | ") || "—")}</p></div><div><strong>Outcome</strong><p>${esc(a.outcome || "—")}</p></div></div></div>`;
  }
  if (state.recordFocusType === "visit" && state.recordFocusId) {
    const v = visit(state.recordFocusId);
    if (!v) return "";
    const linked = admission(v.admissionId);
    const body = v.source === "ER"
      ? `<div><strong>Condition at presentation</strong><p>${esc(v.conditionAtPresentation || "—")}</p></div><div><strong>Provisional examination</strong><p>${esc(v.erExam || "—")}</p></div><div><strong>Other systems</strong><p>${esc(v.erOtherSystems || "—")}</p></div><div><strong>ER management</strong><p>${esc(v.erManagement || v.rx || "—")}</p></div><div><strong>Outcome</strong><p>${esc(v.erOutcome || "—")}</p></div>`
      : `<div><strong>Focused OPD exam</strong><p>${esc(v.opdExam || "—")}</p></div><div><strong>Treatment advised</strong><p>${esc(v.rx || "—")}</p></div><div><strong>Follow-up</strong><p>${esc(v.fu ? fmtDate(v.fu) : "—")}</p></div>`;
    return `<div class="det-stitle">Selected ${esc(v.source)} Encounter</div><div class="focus-panel"><div class="summary-strip"><div class="summary-pill"><span>Date</span><strong>${fmtDate(v.date)}</strong></div><div class="summary-pill"><span>Source</span><strong>${esc(v.source)}</strong></div><div class="summary-pill"><span>Severity</span><strong>${esc(v.severity)}</strong></div><div class="summary-pill"><span>Diagnosis</span><strong>${esc(v.dx || "—")}</strong></div></div><div class="focus-grid"><div><strong>Complaints</strong><p>${esc(v.complaints.join(", ") || "—")}</p></div><div><strong>Encounter notes</strong><p>${esc(v.notes || "—")}</p></div><div><strong>Vitals</strong><p>${esc(formatVitals(v) || "—")}</p></div><div><strong>Attendant</strong><p>${esc([v.attendantName, v.attendantPhone].filter(Boolean).join(" · ") || "—")}</p></div>${body}</div>${linked ? `<div class="focus-link"><button class="btn btn-ghost btn-sm" type="button" onclick="openAdmissionInRecord('${linked.id}')">Open Linked Ward Record</button></div>` : ""}</div>`;
  }
  return "";
}

function savePatientProfile(pid) {
  const p = patient(pid);
  if (!p || security.role !== "editor") return;
  Object.assign(p, normPatient({ ...p, birthHistory: $("#pBirthHistory")?.value, feedingHistory: $("#pFeedingHistory")?.value, milestoneHistory: $("#pMilestoneHistory")?.value, familyHistory: $("#pFamilyHistory")?.value, differentialDx: $("#pDifferentialDx")?.value }, 0));
  saveDB();
  toast("Patient longitudinal history saved.", "ok");
  showDetail(pid, { section: "history" });
}

function openRecordSection(section) {
  state.recordSection = section;
  showDetail(state.patientId);
}

function openVisitInRecord(visitId) {
  const v = visit(visitId);
  if (!v) return;
  state.recordSection = "encounters";
  state.recordFocusType = "visit";
  state.recordFocusId = visitId;
  showDetail(v.pid);
}

function openAdmissionInRecord(admissionId) {
  const a = admission(admissionId);
  if (!a) return;
  state.recordSection = "encounters";
  state.recordFocusType = "admission";
  state.recordFocusId = admissionId;
  showDetail(a.pid);
}

function openCaseFromAudit(visitId) {
  openVisitInRecord(visitId);
}

function showDetail(pid, opts = {}) {
  const p = patient(pid);
  if (!p) return;
  if (!opts.section && pid !== state.patientId) {
    state.recordSection = "overview";
    state.recordFocusType = "";
    state.recordFocusId = "";
  }
  state.patientId = pid;
  if (opts.section) state.recordSection = opts.section;
  if (opts.focusType !== undefined) state.recordFocusType = opts.focusType;
  if (opts.focusId !== undefined) state.recordFocusId = opts.focusId;
  const pv = patientVisits(pid);
  const pa = patientAdmissions(pid);
  const latest = pv[0];
  const wt = metricSeries(p, pv, "wt", p.weight);
  const ht = metricSeries(p, pv, "ht", p.height);
  const muac = latest?.muac ? `${latest.muac} cm` : "—";
  const init = p.name.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "P";
  const section = state.recordSection || "overview";
  let sectionHtml = "";

  if (section === "overview") {
    sectionHtml += renderRecordFocus(p);
    if (wt.length || ht.length || muac !== "—") {
      sectionHtml += `<div class="det-stitle">Anthropometric Trend</div><div class="trend-grid"><div class="trend-card"><div class="trend-head">Weight</div><div class="trend-value">${wt.length ? `${wt[wt.length - 1].value} kg` : "—"}</div>${wt.length ? spark(wt, "#58a6ff") : '<div class="empty-inline">No weight history</div>'}</div><div class="trend-card"><div class="trend-head">Height / Length</div><div class="trend-value">${ht.length ? `${ht[ht.length - 1].value} cm` : "—"}</div>${ht.length ? spark(ht, "#3fb950") : '<div class="empty-inline">No height history</div>'}</div><div class="trend-card"><div class="trend-head">Latest MUAC</div><div class="trend-value">${esc(muac)}</div><div class="mini-sub">Pulled from all recorded encounters.</div></div></div>`;
    }
    sectionHtml += `<div class="det-stitle">Summary</div><dl class="info-grid"><dt>Guardian</dt><dd>${esc(p.guardian || "—")}</dd><dt>Area</dt><dd>${esc(p.area || "—")}</dd><dt>Address</dt><dd>${esc(p.address || "—")}</dd><dt>Emergency</dt><dd>${esc([p.emergencyName, p.emergencyPhone].filter(Boolean).join(" · ") || "—")}</dd><dt>Blood Group</dt><dd>${esc(p.bloodGroup || "—")}</dd><dt>Latest Diagnosis</dt><dd>${esc(latest?.dx || "—")}</dd></dl>`;
  } else if (section === "history") {
    sectionHtml += `<div class="det-stitle">Longitudinal History</div>${security.role === "editor" ? `<div class="focus-panel"><label class="lbl">Birth History</label><textarea class="inp" id="pBirthHistory" rows="3">${esc(p.birthHistory || "")}</textarea><label class="lbl">Feeding History</label><textarea class="inp" id="pFeedingHistory" rows="3">${esc(p.feedingHistory || "")}</textarea><label class="lbl">Milestones History</label><textarea class="inp" id="pMilestoneHistory" rows="3">${esc(p.milestoneHistory || "")}</textarea><label class="lbl">Family History</label><textarea class="inp" id="pFamilyHistory" rows="3">${esc(p.familyHistory || "")}</textarea><label class="lbl">Suspicion / Differential Diagnosis</label><textarea class="inp" id="pDifferentialDx" rows="3">${esc(p.differentialDx || "")}</textarea><div class="btn-row"><button class="btn btn-green" type="button" onclick="savePatientProfile('${p.id}')">Save Record History</button></div></div>` : `<div class="focus-grid"><div><strong>Birth History</strong><p>${esc(p.birthHistory || "—")}</p></div><div><strong>Feeding History</strong><p>${esc(p.feedingHistory || "—")}</p></div><div><strong>Milestones</strong><p>${esc(p.milestoneHistory || "—")}</p></div><div><strong>Family History</strong><p>${esc(p.familyHistory || "—")}</p></div><div><strong>Suspicion / Differential Diagnosis</strong><p>${esc(p.differentialDx || "—")}</p></div></div>`}`;
  } else {
    sectionHtml += renderRecordFocus(p);
    // Unified chronological timeline across all hospitals
    const tlevents = [
      ...pv.map((v) => ({ type: "visit", date: v.date, data: v })),
      ...pa.map((a) => ({ type: "admission", date: a.openedOn, data: a })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    const hospSet = new Set(
      [...pv.map((v) => v.hospitalName), ...pa.map((a) => a.hospitalName)].filter(Boolean)
    );
    const multiHospNote = hospSet.size > 1
      ? `<div class="quick-note" style="margin-bottom:8px">Records span <strong>${hospSet.size} hospitals</strong>: ${[...hospSet].map((h) => `<strong>${esc(h)}</strong>`).join(", ")}.</div>`
      : "";

    sectionHtml += `<div class="det-stitle">Full Timeline (${tlevents.length} event${tlevents.length !== 1 ? "s" : ""})</div>${multiHospNote}`;
    sectionHtml += `<div class="tl-track">${tlevents.length
      ? tlevents.map((evt) => evt.type === "visit"
          ? renderTimelineVisitItem(evt.data)
          : renderTimelineAdmissionItem(evt.data)).join("")
      : '<p class="empty">No records yet.</p>'}</div>`;
  }

  const html = `<div class="det-hdr"><div class="det-av">${esc(init)}</div><div><div class="det-name">${esc(p.name)}</div><div class="det-meta">${esc(p.uhid)} · ${esc(ageLabel(p))} · ${esc(ageBand(p))} · ${esc(p.gender || "Gender not entered")}</div><div class="det-meta">${esc(p.area || "No area")} · ${esc(p.guardian || "No guardian")}${p.phone ? ` · ${esc(p.phone)}` : ""}</div></div></div><div class="btn-row">${security.role === "editor" ? `<button class="btn btn-ghost btn-sm" type="button" onclick="startVisitForPatient('${p.id}')">New Visit</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" onclick="sharePatientTimeline('${p.id}')">Share Timeline</button></div><div class="summary-strip"><div class="summary-pill"><span>Total Visits</span><strong>${pv.length}</strong></div><div class="summary-pill"><span>Ward Records</span><strong>${pa.length}</strong></div><div class="summary-pill"><span>Latest Diagnosis</span><strong>${esc(latest?.dx || "—")}</strong></div><div class="summary-pill"><span>Allergies</span><strong>${esc(p.allergies || "—")}</strong></div></div><div class="segment-row"><button class="seg ${section === "overview" ? "active" : ""}" type="button" onclick="openRecordSection('overview')">Overview</button><button class="seg ${section === "history" ? "active" : ""}" type="button" onclick="openRecordSection('history')">History</button><button class="seg ${section === "encounters" ? "active" : ""}" type="button" onclick="openRecordSection('encounters')">Encounters</button></div>${sectionHtml}`;
  $("#detailBody").innerHTML = html;
  $("#detailCard").style.display = "";
  $("#sResults").innerHTML = "";
  $("#sInput").value = "";
  switchTab("search");
}

function renderSearch(q) {
  const res = searchPatients(q);
  if (!text(q)) {
    $("#sResults").innerHTML = '<p class="empty">Type to search.</p>';
    $("#detailCard").style.display = "none";
    return;
  }
  if (!res.length) {
    $("#sResults").innerHTML = '<p class="empty">No patients found.</p>';
    $("#detailCard").style.display = "none";
    return;
  }
  $("#sResults").innerHTML = res
    .map((p) => {
      const vc = db.visits.filter((v) => v.pid === p.id).length;
      const adm = db.admissions.some((a) => a.pid === p.id && a.status === "Admitted");
      return `<div class="li" onclick="showDetail('${p.id}', { section: 'overview', focusType: '', focusId: '' })"><div class="li-top"><span class="li-name">${esc(p.name)}</span><span>${adm ? '<span class="tag tag-rd">Active ADM</span>' : ""}<span class="tag tag-bl">${vc} visits</span></span></div><div class="li-sub">${esc(p.uhid)} · ${esc(ageLabel(p))} · ${esc(p.area || "No area")}</div></div>`;
    })
    .join("");
}

function rankCounts(items, fallbackLabel = "Not entered") {
  const map = new Map();
  items.forEach((item) => {
    const key = text(item) || fallbackLabel;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function barRow(label, value, max, tone = "blue", extra = "") {
  const pct = max ? Math.max(12, Math.round((value / max) * 100)) : 0;
  return `<div class="audit-row"><div class="audit-row-top"><span>${esc(label)}</span><strong>${value}${extra}</strong></div><div class="audit-bar"><span class="audit-fill tone-${tone}" style="width:${pct}%"></span></div></div>`;
}

function listRow(label, value, meta = "") {
  return `<div class="audit-item"><div><div class="audit-item-title">${esc(label)}</div>${meta ? `<div class="audit-item-meta">${esc(meta)}</div>` : ""}</div><strong>${esc(value)}</strong></div>`;
}

function renderAdmissionAnalytics() {
  const month = state.admMonth || iso().slice(0, 7);
  const monthVisits = db.visits.filter((v) => (v.date || "").slice(0, 7) === month);
  const monthAdmissions = db.admissions.filter((a) => (a.openedOn || "").slice(0, 7) === month);
  const activeMonthAdmissions = monthAdmissions.filter((a) => a.status === "Admitted");
  const dischargedMonthAdmissions = monthAdmissions.filter((a) => a.status === "Discharged");
  const opdAdmissions = monthAdmissions.filter((a) => a.source === "OPD").length;
  const erAdmissions = monthAdmissions.filter((a) => a.source === "ER").length;

  const patientVisitCounts = new Map();
  monthVisits.forEach((v) => {
    patientVisitCounts.set(v.pid, (patientVisitCounts.get(v.pid) || 0) + 1);
  });
  const recurrentPatients = [...patientVisitCounts.values()].filter((count) => count > 1).length;
  const returningPatients = [...patientVisitCounts.keys()].filter((pid) =>
    db.visits.some((v) => v.pid === pid && (v.date || "") < `${month}-01`)
  ).length;

  const diagnoses = rankCounts([
    ...monthAdmissions.map((a) => a.diagnosis || a.reason),
    ...monthVisits.map((v) => v.dx),
  ]);
  const wards = rankCounts(monthAdmissions.map((a) => a.wardBed || "Ward pending"));
  const rollingMonths = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5));
  const rollingSeries = rollingMonths.map((key) => ({
    date: `${key}-01`,
    value: db.admissions.filter((a) => (a.openedOn || "").slice(0, 7) === key).length,
  }));
  const diseaseSelect = $("#admDiseaseFilter");
  const ageSelect = $("#admAgeFilter");
  const currentDisease = diseaseSelect.value;
  const availableDiagnoses = Array.from(
    new Set([...monthVisits.map((v) => text(v.dx)), ...monthAdmissions.map((a) => text(a.diagnosis))].filter(Boolean).sort((a, b) => a.localeCompare(b)))
  );
  diseaseSelect.innerHTML = '<option value="">All diagnoses</option>' + availableDiagnoses.map((dx) => `<option>${esc(dx)}</option>`).join("");
  diseaseSelect.value = availableDiagnoses.includes(currentDisease) ? currentDisease : "";
  if (!ageSelect.value) ageSelect.value = "";

  const repeatRows = [...patientVisitCounts.entries()]
    .map(([pid, count]) => ({
      pid,
      count,
      patient: patient(pid),
      returning: db.visits.some((v) => v.pid === pid && (v.date || "") < `${month}-01`),
    }))
    .filter((row) => row.count > 1 || row.returning)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const flowMax = Math.max(opdAdmissions, erAdmissions, monthVisits.length, monthAdmissions.length, 1);

  $("#admMonth").value = month;
  $("#admMonthLabel").textContent = monthLabel(month);
  $("#admMonthSub").textContent = `${monthVisits.length} total visits, ${monthAdmissions.length} admissions opened, ${returningPatients} returning patients this month.`;

  $("#admAuditStrip").innerHTML = `
    <div class="audit-stat tone-blue"><span>Total Visits</span><strong>${monthVisits.length}</strong></div>
    <div class="audit-stat tone-red"><span>Admissions Opened</span><strong>${monthAdmissions.length}</strong></div>
    <div class="audit-stat tone-green"><span>Currently Active</span><strong>${activeMonthAdmissions.length}</strong></div>
    <div class="audit-stat tone-amber"><span>Discharged</span><strong>${dischargedMonthAdmissions.length}</strong></div>
    <div class="audit-stat tone-violet"><span>Returning Patients</span><strong>${returningPatients}</strong></div>
    <div class="audit-stat tone-cyan"><span>Recurrent This Month</span><strong>${recurrentPatients}</strong></div>
  `;

  $("#admTrendChart").innerHTML = spark(rollingSeries, "#f85149");
  $("#admTrendCaption").textContent = `${rollingSeries[rollingSeries.length - 1]?.value || 0} admissions opened in ${monthLabel(month)} compared with ${rollingSeries[rollingSeries.length - 2]?.value || 0} in the previous month.`;

  $("#admFlowBars").innerHTML = [
    barRow("Visits seen", monthVisits.length, flowMax, "blue"),
    barRow("Admissions opened", monthAdmissions.length, flowMax, "red"),
    barRow("Admitted from OPD", opdAdmissions, flowMax, "green"),
    barRow("Admitted from ER", erAdmissions, flowMax, "violet"),
  ].join("");

  $("#admDxList").innerHTML = diagnoses.length
    ? diagnoses.slice(0, 5).map(([label, value]) => listRow(label, value, `${monthLabel(month)}`)).join("")
    : '<div class="empty-inline">No diagnosis pattern for this month.</div>';

  $("#admWardList").innerHTML = wards.length
    ? wards.slice(0, 5).map(([label, value]) => listRow(label, value, value > 1 ? "cases this month" : "case this month")).join("")
    : '<div class="empty-inline">No ward usage recorded.</div>';

  $("#admReturnList").innerHTML = repeatRows.length
    ? repeatRows
        .map((row) => listRow(`${row.patient?.name || "Unknown"} (${row.patient?.uhid || row.pid})`, `${row.count} visit${row.count > 1 ? "s" : ""}`, row.returning ? "Returning patient" : "Repeated this month"))
        .join("")
    : '<div class="empty-inline">No frequent or returning patients this month.</div>';
}

function renderAdmissions() {
  const q = lc($("#admSearch").value);
  const month = state.admMonth || iso().slice(0, 7);
  const disease = text($("#admDiseaseFilter").value);
  const ageFilter = text($("#admAgeFilter").value);
  renderAdmissionAnalytics();
  let list = db.visits
    .filter((v) => (v.date || "").slice(0, 7) === month)
    .slice()
    .sort((a, b) => byDateDesc(a, b, "date"));
  if (state.admFilter === "active") list = list.filter((v) => v.admissionId && admission(v.admissionId)?.status === "Admitted");
  if (state.admFilter === "discharged") list = list.filter((v) => v.admissionId && admission(v.admissionId)?.status === "Discharged");
  if (disease) list = list.filter((v) => text(v.dx) === disease || text(admission(v.admissionId)?.diagnosis) === disease);
  if (ageFilter) list = list.filter((v) => ageBand(patient(v.pid)) === ageFilter);
  if (q) {
    list = list.filter((v) => {
      const p = patient(v.pid);
      const a = admission(v.admissionId);
      return [v.id, v.source, v.dx, p?.name, p?.uhid, a?.id, a?.wardBed, a?.diagnosis, a?.reason].map(lc).join(" ").includes(q);
    });
  }
  $("#admList").innerHTML = list.length
    ? list
        .map((v) => {
          const p = patient(v.pid);
          const a = admission(v.admissionId);
          const wardTag = a ? `<span class="tag tag-${a.status === "Admitted" ? "rd" : "gn"}">${esc(a.status)}</span>` : "";
          const sourceTone = v.source === "ER" ? "rd" : "pp";
          return `<div class="li" onclick="openCaseFromAudit('${v.id}')"><div class="li-top"><span class="li-name">${esc(p?.name || "Unknown patient")}</span><span><span class="tag tag-${sevTag(v.severity)}">${esc(v.severity)}</span><span class="tag tag-${sourceTone}">${esc(v.source)}</span>${wardTag}</span></div><div class="li-sub">${esc(p?.uhid || "")} · ${esc(ageBand(p || {}))} · ${fmtDate(v.date)}</div><div class="li-sub">${esc(v.dx || "No diagnosis entered")}</div><div class="li-sub">${a ? `Ward case ${esc(a.id)} · ${esc(a.wardBed || "Ward pending")}` : "No ward admission linked"}</div></div>`;
        })
        .join("")
    : '<p class="empty">No cases in this view.</p>';
}

function fillAdmission(a) {
  const p = patient(a.pid);
  const v = visit(a.visitId);
  state.admissionId = a.id;
  $("#aId").value = a.id;
  $("#aStatus").value = a.status;
  $("#aOpenedOn").value = a.openedOn;
  $("#aDischargeDate").value = a.dischargeDate;
  $("#aSource").value = a.source || "OPD";
  $("#aWardBed").value = a.wardBed;
  $("#aConsultant").value = a.consultant;
  $("#aReason").value = a.reason;
  $("#aHistory").value = a.history;
  $("#aPastHistory").value = a.pastHistory;
  $("#aFamilyHistory").value = a.familyHistory;
  $("#aAllergies").value = a.allergies || p?.allergies || "";
  $("#aAnthropometry").value = a.anthropometryNote;
  $("#aDiagnosis").value = a.diagnosis;
  $("#aTreatment").value = a.treatment;
  $("#aLabs").value = a.labs;
  $("#aProcedures").value = a.procedures;
  $("#aManagementTimeline").value = a.managementTimeline;
  $("#aOutcome").value = a.outcome;
  $("#aSpecialNotes").value = a.specialNotes;
  $("#aExamGeneral").value = a.exam.general;
  $("#aExamResp").value = a.exam.respiratory;
  $("#aExamCvs").value = a.exam.cvs;
  $("#aExamCns").value = a.exam.cns;
  $("#aExamGit").value = a.exam.git;
  $("#admTitle").textContent = `${p?.name || "Admission"} · ${a.id}`;
  const spanDays = Math.max(1, Math.round((new Date(`${a.dischargeDate || iso()}T00:00:00`) - new Date(`${a.openedOn}T00:00:00`)) / 86400000) + 1);
  $("#admSummary").innerHTML = `<div class="summary-pill"><span>Patient</span><strong>${esc(p?.uhid || "—")}</strong></div><div class="summary-pill"><span>Source</span><strong>${esc(a.source || "—")}</strong></div><div class="summary-pill"><span>Ward</span><strong>${esc(a.wardBed || "—")}</strong></div><div class="summary-pill"><span>Hospital Span</span><strong>${spanDays} day${spanDays > 1 ? "s" : ""}</strong></div><div class="summary-pill"><span>Current Dx</span><strong>${esc(a.diagnosis || v?.dx || "—")}</strong></div>`;
  $("#admDetailCard").style.display = "";

  // Seal historical fields — locked once they have content, regardless of role
  const HIST_SEALS = ["#aHistory", "#aReason", "#aPastHistory", "#aFamilyHistory",
    "#aAllergies", "#aExamGeneral", "#aExamResp", "#aExamCvs", "#aExamCns", "#aExamGit"];
  HIST_SEALS.forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    delete el.dataset.histLocked;
    el.disabled = false;
    if (el.value.trim()) {
      el.dataset.histLocked = "1";
      el.disabled = true;
      el.title = "\uD83D\uDD12 Historical record \u2014 cannot be modified once entered";
    }
  });
}

function openAdmission(id, go = true) {
  const a = admission(id);
  if (!a) return;
  if (go) switchTab("admissions");
  fillAdmission(a);
}

function clearAdmissionDetail() {
  state.admissionId = "";
  $("#admDetailCard").style.display = "none";
  $("#frmAdmission").reset();
}

function openAdmissionPatient() {
  const a = admission($("#aId").value);
  if (a) showDetail(a.pid, { section: "encounters", focusType: "admission", focusId: a.id });
}

function markAdmissionDischarged() {
  if (!$("#aId").value) return;
  $("#aStatus").value = "Discharged";
  if (!$("#aDischargeDate").value) $("#aDischargeDate").value = iso();
  $("#frmAdmission").requestSubmit();
}

function startVisitForPatient(pid) {
  const p = patient(pid);
  if (!p) return;
  switchTab("visit");
  pickVisitPatient(p);
}

function focusAdmissionsForPatient(pid) {
  const a = activeAdmission(pid) || patientAdmissions(pid)[0];
  if (a) openAdmissionInRecord(a.id);
  else showDetail(pid, { section: "encounters" });
}

function syncMRPreview() {
  $("#regNextUhid").textContent = nextUhidPreview();
}

function patientTimelineText(pid) {
  const p = patient(pid);
  if (!p) return "";
  const pv = patientVisits(pid);
  const pa = patientAdmissions(pid);

  const events = [
    ...pv.map((v) => ({ type: "visit", date: v.date, data: v })),
    ...pa.map((a) => ({ type: "admission", date: a.openedOn, data: a })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const lines = events.map((evt) => {
    if (evt.type === "visit") {
      const v = evt.data;
      return [
        `[${fmtDate(v.date)}] ${v.source} · ${v.severity}${v.hospitalName ? ` @ ${v.hospitalName}` : ""}`,
        `  Complaints: ${v.complaints.join(", ") || "—"}`,
        `  Diagnosis: ${v.dx || "Pending"}`,
        v.rx ? `  Plan: ${v.rx}` : null,
        formatVitals(v) ? `  Vitals: ${formatVitals(v)}` : null,
        v.attendantName ? `  Attendant: ${v.attendantName}${v.attendantPhone ? ` · ${v.attendantPhone}` : ""}` : null,
        v.fu ? `  Follow-up: ${fmtDate(v.fu)}` : null,
      ].filter(Boolean).join("\n");
    } else {
      const a = evt.data;
      return [
        `[${fmtDate(a.openedOn)}] WARD ADMISSION${a.hospitalName ? ` @ ${a.hospitalName}` : ""} · ${a.id}`,
        `  Status: ${a.status}${a.dischargeDate ? ` | Discharged: ${fmtDate(a.dischargeDate)}` : ""}`,
        `  Ward: ${a.wardBed || "—"} · Consultant: ${a.consultant || "—"}`,
        `  Diagnosis: ${a.diagnosis || a.reason || "—"}`,
        a.treatment ? `  Treatment: ${a.treatment}` : null,
        a.outcome ? `  Outcome: ${a.outcome}` : null,
      ].filter(Boolean).join("\n");
    }
  }).join("\n\n");

  return `PATIENT TIMELINE\n${"─".repeat(40)}\n${p.name} (${p.uhid})\nAge: ${ageLabel(p)} · ${p.gender || "—"}\nArea: ${p.area || "—"} · Guardian: ${p.guardian || "—"}\nAllergies: ${p.allergies || "—"}\n${"─".repeat(40)}\n\n${lines || "No records found."}`;
}

function sharePatientTimeline(pid) {
  const summary = patientTimelineText(pid);
  if (!summary) return;
  if (navigator.share) {
    navigator.share({ title: `Timeline ${patient(pid)?.uhid || ""}`, text: summary }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(summary).then(
    () => toast("Timeline copied for sharing.", "ok"),
    () => toast("Sharing not available on this device.", "err")
  );
}

function bind() {
  $$(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  window.addEventListener("resize", moveInk);
  $$(".sev").forEach((b) => b.addEventListener("click", () => setSeverity(b.dataset.s)));
  $$(".chip").forEach((c) =>
    c.addEventListener("click", () => {
      const x = c.dataset.c;
      if (state.complaints.has(x)) {
        state.complaints.delete(x);
        c.classList.remove("on");
      } else {
        state.complaints.add(x);
        c.classList.add("on");
      }
    })
  );

  ["#rName", "#rArea", "#rGuardian", "#rAge", "#rGender"].forEach((s) => {
    $(s).addEventListener("input", renderDupes);
    $(s).addEventListener("change", renderDupes);
  });

  $("#rDob").addEventListener("change", () => {
    const a = calcAge($("#rDob").value);
    if (!$("#rAge").value) $("#rAge").value = a.ageValue || "";
    $("#rAgeUnit").value = a.ageUnit;
  });

  $("#frmReg").addEventListener("submit", (e) => {
    e.preventDefault();
    let ageValue = Number($("#rAge").value || 0);
    let ageUnit = $("#rAgeUnit").value;
    const dob = $("#rDob").value;
    if (!ageValue && dob) {
      const a = calcAge(dob);
      ageValue = a.ageValue;
      ageUnit = a.ageUnit;
    }
    const name = text($("#rName").value);
    const gender = $("#rGender").value;
    const area = text($("#rArea").value);
    if (!name || !gender || !area || (!ageValue && !dob)) {
      toast("Name, gender, age/DOB, and area are required.", "err");
      return;
    }
    const duplicateFlag = dupes().length > 0;
    const p = normPatient(
      {
        id: `PAT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        uhid: nextId("patientCounter", "MR-"),
        name,
        dob,
        ageValue,
        ageUnit,
        gender,
        area,
        guardian: $("#rGuardian").value,
        phone: $("#rPhone").value,
        address: $("#rAddr").value,
        emergencyName: $("#rEmName").value,
        emergencyPhone: $("#rEmPhone").value,
        bloodGroup: $("#rBlood").value,
        allergies: $("#rAllergy").value,
        regNotes: $("#rNote").value,
        weight: $("#rWeight").value,
        height: $("#rHeight").value,
        createdAt: iso(),
      },
      db.patients.length
    );
    db.patients.push(p);
    saveDB();
    e.target.reset();
    renderDupes();
    syncMRPreview();
    renderDash();
    applyRole();
    if ((e.submitter?.value || "stay") === "visit") {
      switchTab("visit");
      pickVisitPatient(p);
    }
    toast(`${p.uhid} created${duplicateFlag ? " after duplicate check" : ""}.`, "ok");
  });

  $("#vSearch").addEventListener("input", (e) => {
    const q = text(e.target.value);
    if (!q) {
      $("#vDD").classList.remove("show");
      return;
    }
    renderPatientDD(searchPatients(q));
  });

  $("#vDD").addEventListener("click", (e) => {
    const row = e.target.closest(".dd-item");
    if (!row?.dataset.id) return;
    const p = patient(row.dataset.id);
    if (p) pickVisitPatient(p);
  });

  $("#vAdmit").addEventListener("change", (e) => {
    $("#vAdmitBox").style.display = e.target.checked ? "block" : "none";
  });

  $("#frmVisit").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!$("#vPid").value) {
      toast("Select a patient first.", "err");
      return;
    }
    if (!state.complaints.size) {
      toast("Select at least one complaint.", "err");
      return;
    }
    const v = normVisit(
      {
        id: nextId("visitCounter", "VIS-"),
        pid: $("#vPid").value,
        date: iso(),
        severity: $("#vSev").value,
        source: $("#vSource").value,
        complaints: [...state.complaints],
        notes: $("#vNotes").value,
        opdExam: $("#vOpdExam").value,
        conditionAtPresentation: $("#vCondition").value,
        erExam: $("#vErExam").value,
        erOtherSystems: $("#vErSystems").value,
        erManagement: $("#vErManagement").value,
        erOutcome: $("#vErOutcome").value,
        attendantName: $("#vAttendant").value,
        attendantPhone: $("#vAttendantPhone").value,
        wt: $("#vWt").value,
        ht: $("#vHt").value,
        muac: $("#vMuac").value,
        temp: $("#vTemp").value,
        hr: $("#vHr").value,
        spo2: $("#vSpo2").value,
        rr: $("#vRr").value,
        dx: $("#vSource").value === "ER" ? $("#vDxEr").value : $("#vDx").value,
        rx: $("#vSource").value === "ER" ? $("#vErManagement").value : $("#vRx").value,
        fu: $("#vFu").value,
        admitted: $("#vAdmit").checked,
        ward: $("#vWard").value,
        admReason: $("#vAdmReason").value,
        consultant: $("#vConsultant").value,
      },
      db.visits.length
    );
    db.visits.push(v);

    let a = null;
    if (v.admitted) {
      a = activeAdmission(v.pid);
      if (a) {
        a.source = a.source || v.source;
        a.wardBed = v.ward || a.wardBed;
        a.consultant = v.consultant || a.consultant;
        a.reason = v.admReason || a.reason;
        a.history = a.history || text($("#vAdmHistory").value) || v.notes;
        a.diagnosis = v.dx || a.diagnosis;
        a.treatment = v.rx || a.treatment;
        a.updatedAt = iso();
        v.admissionId = a.id;
      } else {
        a = normAdmission(
          {
            id: nextId("admissionCounter", "ADM-"),
            pid: v.pid,
            visitId: v.id,
            openedOn: v.date,
            status: "Admitted",
            source: v.source,
            wardBed: v.ward,
            consultant: v.consultant,
            reason: v.admReason,
            history: text($("#vAdmHistory").value) || v.notes,
            allergies: patient(v.pid)?.allergies || "",
            diagnosis: v.dx,
            treatment: v.rx,
            updatedAt: iso(),
          },
          db.admissions.length
        );
        db.admissions.push(a);
        v.admissionId = a.id;
      }
    }

    saveDB();
    resetVisit();
    renderDash();
    renderAdmissions();
    state.recordSection = "encounters";
    state.recordFocusType = "visit";
    state.recordFocusId = v.id;
    showDetail(v.pid, { section: "encounters", focusType: "visit", focusId: v.id });
    toast(a ? `Visit saved and linked to ${a.id}.` : "Visit saved.", "ok");
  });

  $("#sInput").addEventListener("input", (e) => renderSearch(e.target.value));

  // PIN modal — submit on Enter key
  const pinInput = $("#pinInput");
  if (pinInput) pinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") window.pinModalConfirm?.(); });

  // Hospital modal text-transform for code inputs
  ["#detectedHospCode", "#hospCodeInput"].forEach((s) => {
    const el = $(s);
    if (el) el.addEventListener("input", () => { el.value = el.value.toUpperCase(); });
  });
  $$(".seg").forEach((b) =>
    b.addEventListener("click", () => {
      state.admFilter = b.dataset.admFilter;
      $$(".seg").forEach((x) => x.classList.toggle("active", x === b));
      renderAdmissions();
    })
  );
  $("#admSearch").addEventListener("input", renderAdmissions);
  $("#admDiseaseFilter").addEventListener("change", renderAdmissions);
  $("#admAgeFilter").addEventListener("change", renderAdmissions);
  $("#admMonth").addEventListener("change", (e) => {
    state.admMonth = e.target.value || iso().slice(0, 7);
    renderAdmissions();
  });
  $("#admPrevMonth").addEventListener("click", () => {
    state.admMonth = shiftMonth(state.admMonth || iso().slice(0, 7), -1);
    renderAdmissions();
  });
  $("#admNextMonth").addEventListener("click", () => {
    state.admMonth = shiftMonth(state.admMonth || iso().slice(0, 7), 1);
    renderAdmissions();
  });

  $("#frmAdmission").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = admission($("#aId").value);
    if (!a) {
      toast("Admission not found.", "err");
      return;
    }
    Object.assign(
      a,
      normAdmission(
        {
          ...a,
          status: $("#aStatus").value,
          openedOn: $("#aOpenedOn").value || a.openedOn,
          dischargeDate: $("#aDischargeDate").value,
          source: $("#aSource").value,
          wardBed: $("#aWardBed").value,
          consultant: $("#aConsultant").value,
          reason: $("#aReason").value,
          history: $("#aHistory").value,
          pastHistory: $("#aPastHistory").value,
          familyHistory: $("#aFamilyHistory").value,
          allergies: $("#aAllergies").value,
          anthropometryNote: $("#aAnthropometry").value,
          diagnosis: $("#aDiagnosis").value,
          treatment: $("#aTreatment").value,
          labs: $("#aLabs").value,
          procedures: $("#aProcedures").value,
          managementTimeline: $("#aManagementTimeline").value,
          outcome: $("#aOutcome").value,
          specialNotes: $("#aSpecialNotes").value,
          exam: {
            general: $("#aExamGeneral").value,
            respiratory: $("#aExamResp").value,
            cvs: $("#aExamCvs").value,
            cns: $("#aExamCns").value,
            git: $("#aExamGit").value,
          },
          updatedAt: iso(),
        },
        0
      )
    );
    saveDB();
    fillAdmission(a);
    renderAdmissions();
    renderDash();
    toast(`Saved ${a.id}.`, "ok");
  });
}

function exportData() {
  const blob = new Blob(
    [
      JSON.stringify(
        {
          version: 2,
          exportedAt: new Date().toISOString(),
          patients: db.patients,
          visits: db.visits,
          admissions: db.admissions,
          meta: db.meta,
        },
        null,
        2
      ),
    ],
    { type: "application/json" }
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `opd-backup-${iso()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function triggerImport() {
  $("#importFile").click();
}

function importData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const x = JSON.parse(r.result);
      if (!Array.isArray(x.patients) || !Array.isArray(x.visits)) throw new Error();
      db.patients = x.patients.map(normPatient);
      db.visits = x.visits.map(normVisit);
      db.admissions = (x.admissions || []).map(normAdmission);
      db.meta = x.meta || db.meta;
      saveDB();
      loadDB();
      syncMRPreview();
      renderDash();
      renderAdmissions();
      toast("Backup imported.", "ok");
    } catch {
      toast("Backup could not be imported.", "err");
    }
    e.target.value = "";
  };
  r.readAsText(file);
}

function useExistingPatient(pid) {
  showDetail(pid);
}

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Load & render hospital context first (affects MR# preview)
  hospital.load();
  hospital.render();

  // 2. Init Firebase (uses hospital code as Firestore collection path)
  fbSync.init();

  // 3. Load local data and render UI immediately
  loadDB();
  bind();
  $("#headerDate").textContent = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  syncMRPreview();
  setSeverity("Routine");
  moveInk();
  renderDash();
  renderAdmissions();
  applyRole();

  // 4. Background cloud pull — updates UI if remote has more records
  if (fbSync.isReady()) {
    const remote = await fbSync.pull();
    if (remote && remote.patients.length > db.patients.length) {
      db.patients   = remote.patients.map(normPatient);
      db.visits     = remote.visits.map(normVisit);
      db.admissions = (remote.admissions || []).map(normAdmission);
      if (remote.meta) db.meta = { ...db.meta, ...remote.meta };
      saveDB();
      renderDash();
      renderAdmissions();
      syncMRPreview();
      toast("Records synced from cloud.", "ok");
    }
  }

  // 5. First-run: open hospital setup if not yet configured
  if (!hospital.get()) {
    setTimeout(() => openHospitalModal(), 1400);
  }
});

window.switchTab = switchTab;
window.showDetail = showDetail;
window.openAdmission = openAdmission;
window.clearVisitPt = clearVisitPt;
window.startVisitForPatient = startVisitForPatient;
window.focusAdmissionsForPatient = focusAdmissionsForPatient;
window.clearAdmissionDetail = clearAdmissionDetail;
window.openAdmissionPatient = openAdmissionPatient;
window.markAdmissionDischarged = markAdmissionDischarged;
window.openVisitInRecord = openVisitInRecord;
window.openAdmissionInRecord = openAdmissionInRecord;
window.openRecordSection = openRecordSection;
window.openCaseFromAudit = openCaseFromAudit;
window.savePatientProfile = savePatientProfile;
window.toggleRole = toggleRole;
window.sharePatientTimeline = sharePatientTimeline;
window.exportData = exportData;
window.triggerImport = triggerImport;
window.importData = importData;
window.useExistingPatient = useExistingPatient;
