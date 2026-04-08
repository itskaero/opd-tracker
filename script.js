/* =============================================
   OPD Tracker — script.js
   ============================================= */

// ---------- DATA LAYER ----------
const DB = {
  _get(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  },
  _set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
  patients() {
    return this._get("opd_patients");
  },
  savePatients(arr) {
    this._set("opd_patients", arr);
  },
  visits() {
    return this._get("opd_visits");
  },
  saveVisits(arr) {
    this._set("opd_visits", arr);
  },
};

// ---------- SEED DUMMY DATA ----------
function seedData() {
  if (localStorage.getItem("opd_seeded")) return;
  const patients = [
    {
      id: "P001",
      name: "Ahmed Ali",
      age: 5,
      ageUnit: "years",
      gender: "Male",
      weight: 18,
      phone: "03001234567",
      guardian: "Tariq Ali",
      address: "Bahawalpur",
      createdAt: "2026-04-01T09:00:00",
    },
    {
      id: "P002",
      name: "Fatima Bibi",
      age: 8,
      ageUnit: "months",
      gender: "Female",
      weight: 7.5,
      phone: "03119876543",
      guardian: "Nasreen",
      address: "Rahim Yar Khan",
      createdAt: "2026-04-02T10:00:00",
    },
    {
      id: "P003",
      name: "Bilal Khan",
      age: 3,
      ageUnit: "years",
      gender: "Male",
      weight: 13,
      phone: "03211112222",
      guardian: "Imran Khan",
      address: "Multan",
      createdAt: "2026-04-03T08:30:00",
    },
  ];

  const today = "2026-04-08";
  const visits = [
    {
      id: "V001",
      patientId: "P001",
      date: "2026-04-05",
      complaints: ["Fever", "Cough"],
      notes: "Running nose since 2 days",
      weight: 18,
      temp: 101.2,
      diagnosis: "URTI",
      rx: "Paracetamol 250mg TDS x 3 days",
      followup: "2026-04-08",
      admitted: false,
      ward: "",
      admitReason: "",
    },
    {
      id: "V002",
      patientId: "P002",
      date: "2026-04-06",
      complaints: ["Diarrhea", "Vomiting"],
      notes: "Watery stools x6, vomiting x3",
      weight: 7.2,
      temp: 99.8,
      diagnosis: "AGE with mild dehydration",
      rx: "ORS, Zinc 10mg OD x 14 days",
      followup: "2026-04-08",
      admitted: true,
      ward: "Ward-B Bed-2",
      admitReason: "Dehydration requiring IV fluids",
    },
    {
      id: "V003",
      patientId: "P003",
      date: "2026-04-07",
      complaints: ["Fever", "Rash"],
      notes: "Maculopapular rash on trunk",
      weight: 13,
      temp: 102.5,
      diagnosis: "Measles — suspected",
      rx: "Vitamin A, Paracetamol",
      followup: "2026-04-10",
      admitted: false,
      ward: "",
      admitReason: "",
    },
    {
      id: "V004",
      patientId: "P001",
      date: today,
      complaints: ["Cough"],
      notes: "Follow-up — fever resolved, cough persists",
      weight: 17.8,
      temp: 98.6,
      diagnosis: "Resolving URTI",
      rx: "Continue Paracetamol PRN, honey for cough",
      followup: "",
      admitted: false,
      ward: "",
      admitReason: "",
    },
    {
      id: "V005",
      patientId: "P002",
      date: today,
      complaints: ["Diarrhea"],
      notes: "Stools improving, tolerating ORS",
      weight: 7.3,
      temp: 98.9,
      diagnosis: "AGE — improving",
      rx: "Continue ORS + Zinc",
      followup: "2026-04-10",
      admitted: true,
      ward: "Ward-B Bed-2",
      admitReason: "Continued monitoring",
    },
  ];

  DB.savePatients(patients);
  DB.saveVisits(visits);
  localStorage.setItem("opd_seeded", "true");
}

// ---------- UTILITY ----------
function uid() {
  return "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function vidGen() {
  return "V" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (type ? " " + type : "");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.className = "toast";
  }, 2500);
}

// ---------- TAB SYSTEM ----------
let currentTab = "dashboard";

function switchTab(tab) {
  currentTab = tab;
  // Update buttons
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  // Update sections
  document.querySelectorAll(".section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === "sec-" + tab);
  });
  // Move indicator
  moveIndicator();
  // Refresh data if needed
  if (tab === "dashboard") refreshDashboard();
}

function moveIndicator() {
  const activeBtn = document.querySelector(".tab.active");
  const indicator = document.getElementById("tabIndicator");
  if (!activeBtn || !indicator) return;
  const nav = document.querySelector(".tabnav-inner");
  const navRect = nav.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  indicator.style.left = btnRect.left - navRect.left + "px";
  indicator.style.width = btnRect.width + "px";
}

// ---------- DASHBOARD ----------
function refreshDashboard() {
  const patients = DB.patients();
  const visits = DB.visits();
  const today = todayStr();

  document.getElementById("statPatients").textContent = patients.length;
  document.getElementById("statToday").textContent = visits.filter(
    (v) => v.date === today
  ).length;
  document.getElementById("statAdmitted").textContent = visits.filter(
    (v) => v.admitted
  ).length;
  document.getElementById("statTotal").textContent = visits.length;

  // Recent visits (last 10)
  const sorted = [...visits].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const recent = sorted.slice(0, 10);
  const container = document.getElementById("recentVisits");

  if (recent.length === 0) {
    container.innerHTML = '<div class="empty-state">No visits yet</div>';
  } else {
    container.innerHTML = recent
      .map((v) => {
        const p = patients.find((pt) => pt.id === v.patientId);
        const name = p ? p.name : "Unknown";
        const tags = v.complaints
          .map((c) => `<span class="tag tag-blue">${c}</span>`)
          .join(" ");
        const admitTag = v.admitted
          ? ' <span class="tag tag-red">Admitted</span>'
          : "";
        return `
        <div class="list-item" onclick="showPatientFromVisit('${v.patientId}')">
          <div class="list-item-header">
            <span class="list-item-name">${name}</span>
            <span class="list-item-date">${fmtDate(v.date)}</span>
          </div>
          <div class="list-item-sub">${tags}${admitTag}</div>
          ${v.diagnosis ? `<div class="list-item-sub" style="margin-top:3px">${v.diagnosis}</div>` : ""}
        </div>`;
      })
      .join("");
  }

  // Alerts
  buildAlerts(patients, visits);
}

function buildAlerts(patients, visits) {
  const alerts = [];
  const today = todayStr();

  patients.forEach((p) => {
    const pVisits = visits
      .filter((v) => v.patientId === p.id)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Frequent visitor (3+ visits in 14 days)
    const recent14 = pVisits.filter((v) => {
      const diff =
        (new Date(today) - new Date(v.date)) / (1000 * 60 * 60 * 24);
      return diff <= 14;
    });
    if (recent14.length >= 3) {
      alerts.push(
        `<div class="alert-item">⚠ <strong>${p.name}</strong> — ${recent14.length} visits in 14 days</div>`
      );
    }

    // Weight loss
    if (pVisits.length >= 2) {
      const latest = pVisits[0];
      const prev = pVisits[1];
      if (latest.weight && prev.weight && latest.weight < prev.weight) {
        const loss = (prev.weight - latest.weight).toFixed(1);
        alerts.push(
          `<div class="alert-item">⚠ <strong>${p.name}</strong> — weight loss of ${loss} kg</div>`
        );
      }
    }

    // Follow-up due today
    pVisits.forEach((v) => {
      if (v.followup === today) {
        alerts.push(
          `<div class="alert-item">📅 <strong>${p.name}</strong> — follow-up due today</div>`
        );
      }
    });
  });

  const panel = document.getElementById("alertsPanel");
  const list = document.getElementById("alertsList");
  if (alerts.length > 0) {
    panel.style.display = "block";
    list.innerHTML = alerts.join("");
  } else {
    panel.style.display = "none";
  }
}

function showPatientFromVisit(patientId) {
  switchTab("search");
  setTimeout(() => showPatientDetail(patientId), 100);
}

// ---------- REGISTER ----------
document.getElementById("formRegister").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("regName").value.trim();
  const age = parseInt(document.getElementById("regAge").value);
  const ageUnit = document.getElementById("regAgeUnit").value;
  const gender = document.getElementById("regGender").value;
  const weight = parseFloat(document.getElementById("regWeight").value) || null;
  const phone = document.getElementById("regPhone").value.trim();
  const guardian = document.getElementById("regGuardian").value.trim();
  const address = document.getElementById("regAddress").value.trim();

  if (!name || isNaN(age) || !gender || !phone) {
    showToast("Please fill all required fields", "error");
    return;
  }

  // Validate phone uniqueness
  const patients = DB.patients();
  if (patients.find((p) => p.phone === phone)) {
    showToast("Phone number already registered!", "error");
    return;
  }

  const patient = {
    id: uid(),
    name,
    age,
    ageUnit,
    gender,
    weight,
    phone,
    guardian,
    address,
    createdAt: new Date().toISOString(),
  };

  patients.push(patient);
  DB.savePatients(patients);
  e.target.reset();
  showToast("✓ Patient registered", "success");
});

// ---------- VISIT ----------
let selectedComplaints = new Set();

// Chip toggle
document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const val = chip.dataset.val;
    if (selectedComplaints.has(val)) {
      selectedComplaints.delete(val);
      chip.classList.remove("active");
    } else {
      selectedComplaints.add(val);
      chip.classList.add("active");
    }
  });
});

// Admit toggle
document.getElementById("visitAdmit").addEventListener("change", (e) => {
  document.getElementById("admitFields").style.display = e.target.checked
    ? "block"
    : "none";
});

// Patient search for visit
function searchPatientForVisit() {
  const q = document.getElementById("visitSearch").value.trim().toLowerCase();
  const container = document.getElementById("visitSearchResults");
  if (q.length < 2) {
    container.style.display = "none";
    return;
  }
  const patients = DB.patients().filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.phone.includes(q)
  );
  if (patients.length === 0) {
    container.innerHTML =
      '<div class="dropdown-item"><small>No patients found</small></div>';
  } else {
    container.innerHTML = patients
      .map(
        (p) =>
          `<div class="dropdown-item" onclick="selectPatientForVisit('${p.id}')">
            <strong>${p.name}</strong> <small>— ${p.phone} · ${p.age} ${p.ageUnit}</small>
          </div>`
      )
      .join("");
  }
  container.style.display = "block";
}

function selectPatientForVisit(id) {
  const p = DB.patients().find((pt) => pt.id === id);
  if (!p) return;
  document.getElementById("visitPatientId").value = id;
  document.getElementById("visitSearch").value = "";
  document.getElementById("visitSearchResults").style.display = "none";

  const badge = document.getElementById("visitPatientBadge");
  badge.innerHTML = `
    <span><strong>${p.name}</strong> — ${p.age} ${p.ageUnit}, ${p.gender} · ${p.phone}</span>
    <button class="badge-close" onclick="clearVisitPatient()">✕</button>
  `;
  badge.style.display = "flex";
}

function clearVisitPatient() {
  document.getElementById("visitPatientId").value = "";
  document.getElementById("visitPatientBadge").style.display = "none";
}

// Submit visit
document.getElementById("formVisit").addEventListener("submit", (e) => {
  e.preventDefault();
  const patientId = document.getElementById("visitPatientId").value;
  if (!patientId) {
    showToast("Please select a patient", "error");
    return;
  }
  if (selectedComplaints.size === 0) {
    showToast("Please select at least one complaint", "error");
    return;
  }

  const visit = {
    id: vidGen(),
    patientId,
    date: todayStr(),
    complaints: [...selectedComplaints],
    notes: document.getElementById("visitNotes").value.trim(),
    weight:
      parseFloat(document.getElementById("visitWeight").value) || null,
    temp: parseFloat(document.getElementById("visitTemp").value) || null,
    diagnosis: document.getElementById("visitDiagnosis").value.trim(),
    rx: document.getElementById("visitRx").value.trim(),
    followup: document.getElementById("visitFollowup").value,
    admitted: document.getElementById("visitAdmit").checked,
    ward: document.getElementById("visitWard").value.trim(),
    admitReason: document.getElementById("visitAdmitReason").value.trim(),
  };

  const visits = DB.visits();
  visits.push(visit);
  DB.saveVisits(visits);

  // Reset form
  e.target.reset();
  selectedComplaints.clear();
  document.querySelectorAll(".chip").forEach((c) =>
    c.classList.remove("active")
  );
  clearVisitPatient();
  document.getElementById("admitFields").style.display = "none";
  showToast("✓ Visit saved", "success");
});

// ---------- SEARCH ----------
function searchPatients() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const container = document.getElementById("searchResults");
  document.getElementById("patientDetail").style.display = "none";

  if (q.length < 1) {
    container.innerHTML = '<div class="empty-state">Type to search…</div>';
    return;
  }

  const patients = DB.patients().filter(
    (p) =>
      p.name.toLowerCase().includes(q) || p.phone.includes(q)
  );
  const visits = DB.visits();

  if (patients.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No patients found</div>';
    return;
  }

  container.innerHTML = patients
    .map((p) => {
      const vCount = visits.filter((v) => v.patientId === p.id).length;
      const isAdmitted = visits.some(
        (v) => v.patientId === p.id && v.admitted
      );
      return `
      <div class="list-item" onclick="showPatientDetail('${p.id}')">
        <div class="list-item-header">
          <span class="list-item-name">${p.name}</span>
          <span>
            ${isAdmitted ? '<span class="tag tag-red">Admitted</span>' : ""}
            <span class="tag tag-green">${vCount} visits</span>
          </span>
        </div>
        <div class="list-item-sub">${p.age} ${p.ageUnit} · ${p.gender} · ${p.phone}</div>
      </div>`;
    })
    .join("");
}

function showPatientDetail(id) {
  const p = DB.patients().find((pt) => pt.id === id);
  if (!p) return;

  const visits = DB.visits()
    .filter((v) => v.patientId === id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const initials = p.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  let html = `
    <div class="detail-header">
      <div class="detail-avatar">${initials}</div>
      <div>
        <div class="detail-name">${p.name}</div>
        <div class="detail-meta">${p.age} ${p.ageUnit*  const m = patient.ageMonths || 0;
  if (y > 0) return `${y}y ${m}m`;
  return `${m}m`;
}

function showFeedback(elId, message, type = "success") {
  const el = document.getElementById(elId);
  el.className = `gh-feedback ${type}`;
  el.textContent = message;
  el.classList.remove("d-none");
  setTimeout(() => el.classList.add("d-none"), 3500);
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ────────────────────────────────────────────
// 3. SEED SAMPLE DATA
// ────────────────────────────────────────────

function seedSampleData() {
  if (localStorage.getItem("opd_seeded")) return;

  const today = todayISO();
  const patients = [
    {
      patient_id: "P-00001",
      name: "Ahmed Khan",
      dob: "2022-03-15",
      age: null,
      ageMonths: null,
      gender: "Male",
      father_name: "Imran Khan",
      phone: "03001234567",
      address: "Model Town, Bahawalpur",
      created_at: "2026-03-01",
    },
    {
      patient_id: "P-00002",
      name: "Fatima Bibi",
      dob: "",
      age: 5,
      ageMonths: 3,
      gender: "Female",
      father_name: "Muhammad Aslam",
      phone: "03219876543",
      address: "Satellite Town, Bahawalpur",
      created_at: "2026-03-10",
    },
    {
      patient_id: "P-00003",
      name: "Hamza Ali",
      dob: "2024-11-20",
      age: null,
      ageMonths: null,
      gender: "Male",
      father_name: "Ali Raza",
      phone: "03331112222",
      address: "",
      created_at: "2026-03-15",
    },
  ];

  const visits = [
    {
      visit_id: "V-000001",
      patient_id: "P-00001",
      visit_date: "2026-03-20",
      weight: 12.5,
      complaint: "Fever",
      duration: "2 days",
      diagnosis: "Viral URTI",
      treatment: "Paracetamol 120mg TDS x 3 days",
      followup: "Return if fever persists >3 days",
      admitted: false,
      admission: null,
    },
    {
      visit_id: "V-000002",
      patient_id: "P-00001",
      visit_date: "2026-04-01",
      weight: 12.3,
      complaint: "Cough",
      duration: "5 days",
      diagnosis: "Bronchiolitis",
      treatment: "Nebulization + Amoxicillin",
      followup: "Follow up in 5 days",
      admitted: false,
      admission: null,
    },
    {
      visit_id: "V-000003",
      patient_id: "P-00001",
      visit_date: today,
      weight: 12.0,
      complaint: "Fever",
      duration: "1 day",
      diagnosis: "AGE",
      treatment: "ORS + Zinc",
      followup: "Review in 2 days",
      admitted: false,
      admission: null,
    },
    {
      visit_id: "V-000004",
      patient_id: "P-00002",
      visit_date: today,
      weight: 17.0,
      complaint: "Diarrhea",
      duration: "3 days",
      diagnosis: "Acute Gastroenteritis",
      treatment: "ORS + Zinc + Probiotics",
      followup: "Follow up in 3 days",
      admitted: true,
      admission: {
        date: today,
        diagnosis: "Severe dehydration",
        outcome: "Admitted",
      },
    },
    {
      visit_id: "V-000005",
      patient_id: "P-00003",
      visit_date: "2026-04-05",
      weight: 5.2,
      complaint: "Vomiting",
      duration: "1 day",
      diagnosis: "GERD",
      treatment: "Domperidone drops",
      followup: "Follow up in 1 week",
      admitted: false,
      admission: null,
    },
  ];

  const map = {};
  patients.forEach((p) => (map[p.patient_id] = p));
  DB.savePatients(map);
  DB.saveVisits(visits);
  localStorage.setItem("opd_pat_seq", "3");
  localStorage.setItem("opd_vis_seq", "5");
  localStorage.setItem("opd_seeded", "1");
}

// ────────────────────────────────────────────
// 4. DASHBOARD
// ────────────────────────────────────────────

function renderDashboard() {
  const patients = DB.getPatients();
  const visits = DB.getVisits();
  const today = todayISO();

  const todayVisits = visits.filter((v) => v.visit_date === today);

  document.getElementById("statTodayVisits").textContent =
    todayVisits.length;
  document.getElementById("statTotalPatients").textContent =
    Object.keys(patients).length;

  // Active admissions
  const activeAdm = visits.filter(
    (v) => v.admitted && v.admission && v.admission.outcome === "Admitted"
  );
  document.getElementById("statAdmissions").textContent =
    activeAdm.length;

  // Top complaint today
  const cc = {};
  todayVisits.forEach((v) => {
    const c = v.complaint || "Other";
    cc[c] = (cc[c] || 0) + 1;
  });
  const top = Object.entries(cc).sort((a, b) => b[1] - a[1])[0] || null;
  document.getElementById("statTopComplaint").textContent = top
    ? top[0]
    : "—";

  // Today's visit list
  const listEl = document.getElementById("todayVisitsList");
  if (todayVisits.length === 0) {
    listEl.innerHTML =
      '<div class="gh-empty">No visits recorded today.</div>';
  } else {
    listEl.innerHTML = todayVisits
      .map((v) => {
        const p = patients[v.patient_id];
        const name = p ? esc(p.name) : v.patient_id;
        const admBadge = v.admitted
          ? ' <span class="gh-badge gh-badge-red">ADM</span>'
          : "";
        return `<div class="gh-list-item" onclick="openPatientDetail('${v.patient_id}')">
          <div class="d-flex justify-content-between align-items-center">
            <strong style="color:var(--gh-text)">${name}</strong>
            <span class="gh-badge gh-badge-blue">${esc(v.complaint)}</span>
          </div>
          <div style="font-size:12px;color:var(--gh-text-muted);margin-top:2px">
            ${esc(v.diagnosis || "—")} · <span style="font-family:monospace">${v.weight} kg</span>${admBadge}
          </div>
        </div>`;
      })
      .join("");
  }

  // Alerts
  const alertsEl = document.getElementById("alertsList");
  const alertItems = [];
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  Object.values(patients).forEach((p) => {
    const pv = DB.getVisitsByPatient(p.patient_id);

    // Frequent visits
    const recentCount = pv.filter(
      (v) => new Date(v.visit_date) >= thirtyAgo
    ).length;
    if (recentCount > 3) {
      alertItems.push({
        type: "warning",
        text: `${p.name} — ${recentCount} visits in 30 days`,
        pid: p.patient_id,
      });
    }

    // Weight loss
    if (pv.length >= 2) {
      const latest = pv[0].weight;
      const prev = pv[1].weight;
      if (latest < prev) {
        const diff = (prev - latest).toFixed(1);
        alertItems.push({
          type: "danger",
          text: `${p.name} — weight ↓ ${diff} kg (${prev} → ${latest})`,
          pid: p.patient_id,
        });
      }
    }
  });

  if (alertItems.length === 0) {
    alertsEl.innerHTML = '<div class="gh-empty">No alerts.</div>';
  } else {
    alertsEl.innerHTML = alertItems
      .map(
        (a) =>
          `<div class="gh-alert-item ${a.type}" onclick="openPatientDetail('${a.pid}')">
            <span>${a.type === "danger" ? "🔴" : "🟡"}</span>
            <span>${esc(a.text)}</span>
          </div>`
      )
      .join("");
  }
}

// ────────────────────────────────────────────
// 5. PATIENT REGISTRATION
// ────────────────────────────────────────────

document.getElementById("formRegister").addEventListener("submit", (e) => {
  e.preventDefault();

  const phone = document.getElementById("regPhone").value.trim();
  if (DB.findByPhone(phone)) {
    showFeedback(
      "regFeedback",
      `Patient with phone ${phone} already exists!`,
      "danger"
    );
    return;
  }

  const patient = {
    patient_id: DB.nextPatientId(),
    name: document.getElementById("regName").value.trim(),
    dob: document.getElementById("regDob").value || "",
    age: parseInt(document.getElementById("regAge").value) || 0,
    ageMonths:
      parseInt(document.getElementById("regAgeMonths").value) || 0,
    gender: document.getElementById("regGender").value,
    father_name: document.getElementById("regFather").value.trim(),
    phone: phone,
    address: document.getElementById("regAddress").value.trim(),
    created_at: todayISO(),
  };

  DB.addPatient(patient);
  showFeedback(
    "regFeedback",
    `✅ Registered ${patient.name} (${patient.patient_id})`,
    "success"
  );
  document.getElementById("formRegister").reset();
  renderDashboard();
});

// ────────────────────────────────────────────
// 6. VISIT ENTRY
// ────────────────────────────────────────────

let selectedPatientId = null;

// Visit patient search
function doVisitSearch() {
  const q = document.getElementById("visitPatientSearch").value.trim();
  const results = DB.searchPatients(q);
  const el = document.getElementById("visitPatientResults");
  if (!q) {
    el.innerHTML = "";
    return;
  }
  if (results.length === 0) {
    el.innerHTML =
      '<div class="gh-empty">No patients found. Register first.</div>';
    return;
  }
  el.innerHTML = results
    .map(
      (p) =>
        `<div class="gh-list-item" onclick="selectVisitPatient('${p.patient_id}')">
          <strong style="color:var(--gh-text)">${esc(p.name)}</strong>
          <span style="font-size:12px;color:var(--gh-text-muted)">
            · ${esc(p.phone)} · ${ageString(p)} · s/o ${esc(p.father_name)}
          </span>
        </div>`
    )
    .join("");
}

document
  .getElementById("btnVisitSearch")
  .addEventListener("click", doVisitSearch);
document
  .getElementById("visitPatientSearch")
  .addEventListener("keyup", (e) => {
    if (e.key === "Enter") doVisitSearch();
    if (e.target.value.trim().length >= 2) doVisitSearch();
  });

// Select patient for visit
window.selectVisitPatient = function (pid) {
  const p = DB.getPatientById(pid);
  if (!p) return;
  selectedPatientId = pid;
  document.getElementById("visitPatientId").value = pid;
  document.getElementById("visitPatientBadge").innerHTML =
    `<strong>${esc(p.name)}</strong>
     <span style="color:var(--gh-text-muted);font-size:12px">
       · ${ageString(p)} · ${esc(p.gender)} · ${esc(p.phone)}
     </span>`;

  document.getElementById("visitStep1").classList.add("d-none");
  document.getElementById("visitStep2").classList.remove("d-none");
  document.getElementById("visitPatientResults").innerHTML = "";

  document.getElementById("visitDate").value = todayISO();
  document.getElementById("admDate").value = todayISO();

  // Show previous weight
  const prevVisits = DB.getVisitsByPatient(pid);
  const banner = document.getElementById("weightAlertBanner");
  if (prevVisits.length > 0) {
    banner.textContent = `📋 Last weight: ${prevVisits[0].weight} kg on ${fmtDate(prevVisits[0].visit_date)}`;
    banner.classList.remove("d-none");
  } else {
    banner.classList.add("d-none");
  }
};

// Change patient
document.getElementById("btnChangePatient").addEventListener("click", () => {
  selectedPatientId = null;
  document.getElementById("visitStep1").classList.remove("d-none");
  document.getElementById("visitStep2").classList.add("d-none");
  document.getElementById("formVisit").reset();
  clearChips();
});

// Quick complaint chips
function clearChips() {
  document.querySelectorAll(".gh-chip").forEach((c) => {
    c.classList.remove("active");
  });
}

document.querySelectorAll(".gh-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    clearChips();
    chip.classList.add("active");
    document.getElementById("visitComplaint").value =
      chip.getAttribute("data-val");
  });
});

document.getElementById("visitComplaint").addEventListener("input", (e) => {
  const val = e.target.value.trim();
  clearChips();
  document.querySelectorAll(".gh-chip").forEach((chip) => {
    if (
      chip.getAttribute("data-val").toLowerCase() === val.toLowerCase()
    ) {
      chip.classList.add("active");
    }
  });
});

// Admission toggle
document.getElementById("visitAdmitted").addEventListener("change", (e) => {
  document
    .getElementById("admissionFields")
    .classList.toggle("d-none", !e.target.checked);
});

// Submit visit
document.getElementById("formVisit").addEventListener("submit", (e) => {
  e.preventDefault();

  const visit = {
    visit_id: DB.nextVisitId(),
    patient_id: document.getElementById("visitPatientId").value,
    visit_date: document.getElementById("visitDate").value || todayISO(),
    weight: parseFloat(document.getElementById("visitWeight").value),
    complaint: document.getElementById("visitComplaint").value.trim(),
    duration: document.getElementById("visitDuration").value.trim(),
    diagnosis: document.getElementById("visitDiagnosis").value.trim(),
    treatment: document.getElementById("visitTreatment").value.trim(),
    followup: document.getElementById("visitFollowup").value.trim(),
    admitted: document.getElementById("visitAdmitted").checked,
    admission: null,
  };

  if (visit.admitted) {
    visit.admission = {
      date: document.getElementById("admDate").value || todayISO(),
      diagnosis:
        document.getElementById("admDiagnosis").value.trim() ||
        visit.diagnosis,
      outcome: document.getElementById("admOutcome").value,
    };
  }

  DB.addVisit(visit);

  const patient = DB.getPatientById(visit.patient_id);
  showFeedback(
    "visitFeedback",
    `✅ Visit saved for ${patient ? patient.name : visit.patient_id}`,
    "success"
  );

  // Reset form, keep patient selected for rapid entry
  document.getElementById("formVisit").reset();
  document.getElementById("visitDate").value = todayISO();
  document.getElementById("admDate").value = todayISO();
  document.getElementById("admissionFields").classList.add("d-none");
  clearChips();

  // Refresh weight banner
  const pv = DB.getVisitsByPatient(visit.patient_id);
  const banner = document.getElementById("weightAlertBanner");
  if (pv.length > 0) {
    banner.textContent = `📋 Last weight: ${pv[0].weight} kg on ${fmtDate(pv[0].visit_date)}`;
    banner.classList.remove("d-none");
  }

  renderDashboard();
});

// ────────────────────────────────────────────
// 7. SEARCH & PATIENT HISTORY
// ────────────────────────────────────────────

function doSearch() {
  const q = document.getElementById("searchInput").value.trim();
  const results = DB.searchPatients(q_
