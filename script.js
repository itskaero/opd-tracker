/* ==========================================================
   OPD Patient Tracking System — GitHub Dark Theme
   Uses localStorage for offline-first data persistence
   ========================================================== */

// ────────────────────────────────────────────
// 1. DATA LAYER
// ────────────────────────────────────────────

const DB = {
  getPatients() {
    return JSON.parse(localStorage.getItem("opd_patients") || "{}");
  },
  savePatients(map) {
    localStorage.setItem("opd_patients", JSON.stringify(map));
  },
  addPatient(p) {
    const map = this.getPatients();
    map[p.patient_id] = p;
    this.savePatients(map);
  },
  getPatientById(id) {
    return this.getPatients()[id] || null;
  },
  findByPhone(phone) {
    const map = this.getPatients();
    return Object.values(map).find((p) => p.phone === phone) || null;
  },
  searchPatients(query) {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return Object.values(this.getPatients()).filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.father_name.toLowerCase().includes(q)
    );
  },

  getVisits() {
    return JSON.parse(localStorage.getItem("opd_visits") || "[]");
  },
  saveVisits(arr) {
    localStorage.setItem("opd_visits", JSON.stringify(arr));
  },
  addVisit(v) {
    const arr = this.getVisits();
    arr.push(v);
    this.saveVisits(arr);
  },
  getVisitsByPatient(patientId) {
    return this.getVisits()
      .filter((v) => v.patient_id === patientId)
      .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
  },

  nextPatientId() {
    let seq = parseInt(localStorage.getItem("opd_pat_seq") || "0", 10);
    seq++;
    localStorage.setItem("opd_pat_seq", String(seq));
    return "P-" + String(seq).padStart(5, "0");
  },
  nextVisitId() {
    let seq = parseInt(localStorage.getItem("opd_vis_seq") || "0", 10);
    seq++;
    localStorage.setItem("opd_vis_seq", String(seq));
    return "V-" + String(seq).padStart(6, "0");
  },
};

// ────────────────────────────────────────────
// 2. UTILITIES
// ────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function ageString(patient) {
  if (patient.dob) {
    const now = new Date();
    const birth = new Date(patient.dob + "T00:00:00");
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years > 0) return `${years}y ${months}m`;
    return `${months}m`;
  }
  const y = patient.age || 0;
  const m = patient.ageMonths || 0;
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
