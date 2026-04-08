/* ==========================================================
   OPD Patient Tracking System — Core Logic
   Uses localStorage (IndexedDB-free for maximum compatibility)
   ========================================================== */

// ────────────────────────────────────────────
// 1. DATA LAYER — localStorage helpers
// ────────────────────────────────────────────

/**
 * All patients stored under key "opd_patients"
 * Structure: { [patient_id]: PatientObject }
 *
 * PatientObject = {
 *   patient_id, name, dob, age, ageMonths, gender,
 *   father_name, phone, address, created_at
 * }
 *
 * All visits stored under key "opd_visits"
 * Structure: [ VisitObject, ... ]
 *
 * VisitObject = {
 *   visit_id, patient_id, visit_date, weight, complaint,
 *   duration, diagnosis, treatment, followup,
 *   admitted, admission: { date, diagnosis, outcome } | null
 * }
 */

const DB = {
  // --- Patients ---
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

  // --- Visits ---
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

  // --- ID Generators ---
  nextPatientId() {
    let seq = parseInt(localStorage.getItem("opd_pat_seq") || "0", 10);
    seq++;
    localStorage.setItem("opd_pat_seq", seq);
    return "P-" + String(seq).padStart(5, "0");
  },
  nextVisitId() {
    let seq = parseInt(localStorage.getItem("opd_vis_seq") || "0", 10);
    seq++;
    localStorage.setItem("opd_vis_seq", seq);
    return "V-" + String(seq).padStart(6, "0");
  },
};

// ────────────────────────────────────────────
// 2. UTILITY HELPERS
// ────────────────────────────────────────────

/** Today as YYYY-MM-DD */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Format date for display */
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Calculate age string from dob or stored age */
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

/** Show a feedback alert inside a container */
function showFeedback(elId, message, type = "success") {
  const el = document.getElementById(elId);
  el.className = `alert alert-${type} py-2`;
  el.textContent = message;
  el.classList.remove("d-none");
  setTimeout(() => el.classList.add("d-none"), 3000);
}

/** Sanitize input to prevent XSS in innerHTML */
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ────────────────────────────────────────────
// 3. SEED SAMPLE DATA (runs once)
// ────────────────────────────────────────────

function seedSampleData() {
  if (localStorage.getItem("opd_seeded")) return;

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

  const today = todayISO();
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

  // Stats
  const todayVisits = visits.filter((v) => v.visit_date === today);
  document.getElementById("statTodayVisits").textContent =
    todayVisits.length;
  document.getElementById("statTotalPatients").textContent =
    Object.keys(patients).length;

  // Active admissions (outcome === "Admitted")
  const activeAdm = visits.filter(
    (v) => v.admitted && v.admission && v.admission.outcome === "Admitted"
  );
  document.getElementById("statAdmissions").textContent =
    activeAdm.length;

  // Top complaint today
  const complaintCount = {};
  todayVisits.forEach((v) => {
    const c = v.complaint || "Other";
    complaintCount[c] = (complaintCount[c] || 0) + 1;
  });
  const topComplaint =
    Object.entries(complaintCount).sort((a, b) => b[1] - a[1])[0] ||
    null;
  document.getElementById("statTopComplaint").textContent = topComplaint
    ? topComplaint[0]
    : "—";

  // Today's visit list
  const listEl = document.getElementById("todayVisitsList");
  if (todayVisits.length === 0) {
    listEl.innerHTML =
      '<div class="text-muted text-center small py-3">No visits recorded today.</div>';
  } else {
    listEl.innerHTML = todayVisits
      .map((v) => {
        const p = patients[v.patient_id];
        const name = p ? esc(p.name) : v.patient_id;
        const admBadge = v.admitted
          ? ' <span class="badge bg-danger">ADM</span>'
          : "";
        return `<div class="list-group-item list-group-item-action py-2" onclick="openPatientDetail('${v.patient_id}')">
          <div class="d-flex justify-content-between">
            <strong>${name}</strong>
            <span class="badge bg-primary">${esc(v.complaint)}</span>
          </div>
          <small class="text-muted">${esc(v.diagnosis || "")} · ${v.weight} kg${admBadge}</small>
        </div>`;
      })
      .join("");
  }

  // Alerts: frequent visits or weight loss
  const alertsEl = document.getElementById("alertsList");
  const alertItems = [];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  Object.values(patients).forEach((p) => {
    const pVisits = DB.getVisitsByPatient(p.patient_id);

    // Frequent visits (>3 in 30 days)
    const recentCount = pVisits.filter(
      (v) => new Date(v.visit_date) >= thirtyDaysAgo
    ).length;
    if (recentCount > 3) {
      alertItems.push({
        type: "warning",
        text: `${p.name} — ${recentCount} visits in 30 days (frequent visitor)`,
        pid: p.patient_id,
      });
    }

    // Weight loss between last 2 visits
    if (pVisits.length >= 2) {
      const latest = pVisits[0].weight;
      const previous = pVisits[1].weight;
      if (latest < previous) {
        const diff = (previous - latest).toFixed(1);
        alertItems.push({
          type: "danger",
          text: `${p.name} — weight dropped by ${diff} kg (${previous}→${latest})`,
          pid: p.patient_id,
        });
      }
    }
  });

  if (alertItems.length === 0) {
    alertsEl.innerHTML =
      '<div class="text-muted text-center small py-3">No alerts.</div>';
  } else {
    alertsEl.innerHTML = alertItems
      .map(
        (a) =>
          `<div class="list-group-item alert-item ${a.type === "danger" ? "alert-danger-custom" : ""}" onclick="openPatientDetail('${a.pid}')">
            ${a.type === "danger" ? "🔴" : "⚠️"} ${esc(a.text)}
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

  // Duplicate check by phone
  if (DB.findByPhone(phone)) {
    showFeedback(
      "regFeedback",
      `⚠️ Patient with phone ${phone} already exists!`,
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

// -- Visit: Patient search --
function doVisitSearch() {
  const q = document.getElementById("visitPatientSearch").value.trim();
  const results = DB.searchPatients(q);
  const el = document.getElementById("visitPatientResults");
  if (results.length === 0) {
    el.innerHTML =
      '<div class="list-group-item text-muted small">No patients found.</div>';
    return;
  }
  el.innerHTML = results
    .map(
      (p) =>
        `<div class="list-group-item list-group-item-action py-2" onclick="selectVisitPatient('${p.patient_id}')">
          <strong>${esc(p.name)}</strong>
          <span class="text-muted small">· ${esc(p.phone)} · ${ageString(p)} · s/o ${esc(p.father_name)}</span>
        </div>`
    )
    .join("");
}

document.getElementById("btnVisitSearch").addEventListener("click", doVisitSearch);
document.getElementById("visitPatientSearch").addEventListener("keyup", (e) => {
  if (e.key === "Enter") doVisitSearch();
  // Live search after 2 chars
  if (e.target.value.trim().length >= 2) doVisitSearch();
});

// -- Visit: Select patient --
window.selectVisitPatient = function (pid) {
  const p = DB.getPatientById(pid);
  if (!p) return;
  selectedPatientId = pid;
  document.getElementById("visitPatientId").value = pid;
  document.getElementById("visitPatientBadge").innerHTML =
    `<strong>${esc(p.name)}</strong> · ${ageString(p)} · ${esc(p.phone)}`;

  // Show/hide steps
  document.getElementById("visitStep1").classList.add("d-none");
  document.getElementById("visitStep2").classList.remove("d-none");
  document.getElementById("visitPatientResults").innerHTML = "";

  // Set defaults
  document.getElementById("visitDate").value = todayISO();
  document.getElementById("admDate").value = todayISO();

  // Weight alert (show previous weight)
  const prevVisits = DB.getVisitsByPatient(pid);
  const banner = document.getElementById("weightAlertBanner");
  if (prevVisits.length > 0) {
    banner.textContent = `Last weight: ${prevVisits[0].weight} kg on ${fmtDate(prevVisits[0].visit_date)}`;
    banner.classList.remove("d-none");
  } else {
    banner.classList.add("d-none");
  }
};

// -- Visit: Change patient --
document.getElementById("btnChangePatient").addEventListener("click", () => {
  selectedPatientId = null;
  document.getElementById("visitStep1").classList.remove("d-none");
  document.getElementById("visitStep2").classList.add("d-none");
  document.getElementById("formVisit").reset();
  clearQuickComplaints();
});

// -- Quick complaint buttons --
function clearQuickComplaints() {
  document.querySelectorAll(".btn-quick").forEach((b) => {
    b.classList.remove("active-quick");
  });
}

document.querySelectorAll(".btn-quick").forEach((btn) => {
  btn.addEventListener("click", () => {
    clearQuickComplaints();
    btn.classList.add("active-quick");
    document.getElementById("visitComplaint").value =
      btn.getAttribute("data-val");
  });
});

// Sync text input with quick buttons
document.getElementById("visitComplaint").addEventListener("input", (e) => {
  const val = e.target.value.trim();
  clearQuickComplaints();
  document.querySelectorAll(".btn-quick").forEach((btn) => {
    if (btn.getAttribute("data-val").toLowerCase() === val.toLowerCase()) {
      btn.classList.add("active-quick");
    }
  });
});

// -- Admission toggle --
document.getElementById("visitAdmitted").addEventListener("change", (e) => {
  document
    .getElementById("admissionFields")
    .classList.toggle("d-none", !e.target.checked);
});

// -- Submit visit --
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

  // Reset form but keep patient selected for rapid entry
  document.getElementById("formVisit").reset();
  document.getElementById("visitDate").value = todayISO();
  document.getElementById("admDate").value = todayISO();
  document
    .getElementById("admissionFields")
    .classList.add("d-none");
  clearQuickComplaints();

  // Update weight banner
  const prevVisits = DB.getVisitsByPatient(visit.patient_id);
  const banner = document.getElementById("weightAlertBanner");
  if (prevVisits.length > 0) {
    banner.textContent = `Last weight: ${prevVisits[0].weight} kg on ${fmtDate(prevVisits[0].visit_date)}`;
    banner.classList.remove("d-none");
  }

  renderDashboard();
});

// ────────────────────────────────────────────
// 7. SEARCH & PATIENT HISTORY
// ────────────────────────────────────────────

function doSearch() {
  const q = document.getElementById("searchInput").value.trim();
  const results = DB.searchPatients(q);
  const el = document.getElementById("searchResults");
  document.getElementById("patientDetail").classList.add("d-none");

  if (results.length === 0) {
    el.innerHTML =
      '<div class="list-group-item text-muted small">No patients found.</div>';
    return;
  }
  el.innerHTML = results
    .map(
      (p) =>
        `<div class="list-group-item list-group-item-action py-2" onclick="openPatientDetail('${p.patient_id}')">
          <div class="d-flex justify-content-between">
            <strong>${esc(p.name)}</strong>
            <span class="badge bg-secondary">${esc(p.patient_id)}</span>
          </div>
          <small class="text-muted">s/o ${esc(p.father_name)} · ${esc(p.phone)} · ${ageString(p)} · ${esc(p.gender)}</small>
        </div>`
    )
    .join("");
}

document.getElementById("btnSearch").addEventListener("click", doSearch);
document.getElementById("searchInput").addEventListener("keyup", (e) => {
  if (e.key === "Enter") doSearch();
  if (e.target.value.trim().length >= 2) doSearch();
});

// -- Open patient detail (used from search and dashboard) --
window.openPatientDetail = function (pid) {
  // Switch to search tab
  const searchTab = document.querySelector(
    '[data-bs-target="#tabSearch"]'
  );
  bootstrap.Tab.getOrCreateInstance(searchTab).show();

  const p = DB.getPatientById(pid);
  if (!p) return;

  document.getElementById("searchResults").innerHTML = "";
  document.getElementById("patientDetail").classList.remove("d-none");

  document.getElementById("detailName").textContent =
    `${p.name} (${p.patient_id})`;
  document.getElementById("detailMeta").textContent =
    `${ageString(p)} · ${p.gender} · s/o ${p.father_name}`;
  document.getElementById("detailPhone").innerHTML =
    `📞 ${esc(p.phone)}${p.address ? " · 📍 " + esc(p.address) : ""}`;

  const visits = DB.getVisitsByPatient(pid);

  // Weight trend (last 3)
  const trendEl = document.getElementById("weightTrend");
