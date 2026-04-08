/* =============================================
   Pediatric OPD Tracker
   Vanilla JS · localStorage · Zero dependencies
   ============================================= */

/* ── Storage helpers ── */
const Store = {
  get(k, fb) {
    try { return JSON.parse(localStorage.getItem(k)) || fb; }
    catch { return fb; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
  patients()      { return this.get("opd_p", []); },
  savePatients(a) { this.set("opd_p", a); },
  visits()        { return this.get("opd_v", []); },
  saveVisits(a)   { this.set("opd_v", a); },
};

/* ── Utility ── */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const uid = () => "P" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const vid = () => "V" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const todayISO = () => new Date().toISOString().slice(0, 10);
const esc = (s) => { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; };

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return dt.getDate() + " " + m[dt.getMonth()] + " " + dt.getFullYear();
}

function toast(msg, type) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (type ? " " + type : "");
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.className = "toast"), 2600);
}

/* ── Seed dummy data ── */
(function seed() {
  if (localStorage.getItem("opd_seeded")) return;
  const td = todayISO();
  Store.savePatients([
    { id:"P001", name:"Ahmed Ali",   age:5, ageUnit:"Years",  gender:"Male",   weight:18,  phone:"03001234567", guardian:"Tariq Ali",  address:"Bahawalpur",     createdAt:"2026-04-01" },
    { id:"P002", name:"Fatima Bibi", age:8, ageUnit:"Months", gender:"Female", weight:7.5, phone:"03119876543", guardian:"Nasreen",     address:"Rahim Yar Khan", createdAt:"2026-04-02" },
    { id:"P003", name:"Bilal Khan",  age:3, ageUnit:"Years",  gender:"Male",   weight:13,  phone:"03211112222", guardian:"Imran Khan",  address:"Multan",         createdAt:"2026-04-03" },
  ]);
  Store.saveVisits([
    { id:"V001", pid:"P001", date:"2026-04-05", complaints:["Fever","Cough"],       notes:"Runny nose x2 days",              wt:18,   temp:101.2, dx:"URTI",                        rx:"Paracetamol 250mg TDS x3d",        fu:"2026-04-08", admitted:false, ward:"", admReason:"" },
    { id:"V002", pid:"P002", date:"2026-04-06", complaints:["Diarrhea","Vomiting"], notes:"Watery stools x6, vomiting x3",   wt:7.2,  temp:99.8,  dx:"AGE — mild dehydration",      rx:"ORS, Zinc 10mg OD x14d",           fu:"2026-04-08", admitted:true,  ward:"Ward-B Bed-2", admReason:"IV fluids needed" },
    { id:"V003", pid:"P003", date:"2026-04-07", complaints:["Fever","Rash"],        notes:"Maculopapular rash trunk",        wt:13,   temp:102.5, dx:"Measles — suspected",         rx:"Vitamin A, Paracetamol",           fu:"2026-04-10", admitted:false, ward:"", admReason:"" },
    { id:"V004", pid:"P001", date:td,            complaints:["Cough"],               notes:"Follow-up, fever resolved",       wt:17.8, temp:98.6,  dx:"Resolving URTI",              rx:"Paracetamol PRN",                  fu:"",           admitted:false, ward:"", admReason:"" },
    { id:"V005", pid:"P002", date:td,            complaints:["Diarrhea"],            notes:"Improving, tolerating ORS",       wt:7.3,  temp:98.9,  dx:"AGE — improving",             rx:"Continue ORS + Zinc",              fu:"2026-04-10", admitted:true,  ward:"Ward-B Bed-2", admReason:"Monitoring" },
  ]);
  localStorage.setItem("opd_seeded", "1");
})();

/* ── Tab system ── */
function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + name));
  moveInk();
  if (name === "dashboard") refreshDash();
}

function moveInk() {
  const active = $(".tab.active");
  const ink = $("#tabInk");
  if (!active || !ink) return;
  const parent = $("#tabsInner").getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  ink.style.left = (rect.left - parent.left) + "px";
  ink.style.width = rect.width + "px";
}

$$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));
window.addEventListener("resize", moveInk);

/* ── Dashboard ── */
function refreshDash() {
  const pts = Store.patients();
  const vis = Store.visits();
  const td = todayISO();
  const todayV = vis.filter((v) => v.date === td);

  $("#sPatients").textContent = pts.length;
  $("#sToday").textContent = todayV.length;
  $("#sAdmit").textContent = vis.filter((v) => v.admitted).length;
  $("#sVisits").textContent = vis.length;

  // Today's visits
  const el = $("#dashToday");
  if (!todayV.length) {
    el.innerHTML = '<p class="empty">No visits today.</p>';
  } else {
    el.innerHTML = todayV.map((v) => {
      const p = pts.find((x) => x.id === v.pid);
      const nm = p ? esc(p.name) : v.pid;
      const tags = v.complaints.map((c) => `<span class="tag tag-bl">${esc(c)}</span>`).join(" ");
      const adm = v.admitted ? ' <span class="tag tag-rd">ADM</span>' : "";
      return `<div class="li" onclick="gotoDetail('${v.pid}')">
        <div class="li-top"><span class="li-name">${nm}</span>${tags}${adm}</div>
        <div class="li-sub">${esc(v.dx) || "—"} · ${v.wt ? v.wt + " kg" : ""}</div>
      </div>`;
    }).join("");
  }

  // Alerts
  const alerts = [];
  pts.forEach((p) => {
    const pv = vis.filter((v) => v.pid === p.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    // Frequent
    const cut = new Date(); cut.setDate(cut.getDate() - 14);
    const recent = pv.filter((v) => new Date(v.date) >= cut);
    if (recent.length >= 3) alerts.push(`⚠ <strong>${esc(p.name)}</strong> — ${recent.length} visits in 14 days`);
    // Weight loss
    if (pv.length >= 2 && pv[0].wt && pv[1].wt && pv[0].wt < pv[1].wt) {
      alerts.push(`⚠ <strong>${esc(p.name)}</strong> — weight ↓ ${(pv[1].wt - pv[0].wt).toFixed(1)} kg`);
    }
    // Follow-up due
    pv.forEach((v) => { if (v.fu === td) alerts.push(`📅 <strong>${esc(p.name)}</strong> — follow-up due today`); });
  });

  const ac = $("#alertCard");
  if (alerts.length) {
    ac.style.display = "";
    $("#dashAlerts").innerHTML = alerts.map((a) => `<div class="alert-i">${a}</div>`).join("");
  } else {
    ac.style.display = "none";
  }
}

window.gotoDetail = function (pid) {
  switchTab("search");
  showDetail(pid);
};

/* ── Register ── */
$("#frmReg").addEventListener("submit", (e) => {
  e.preventDefault();
  const phone = $("#rPhone").value.trim();
  const pts = Store.patients();

  if (pts.find((p) => p.phone === phone)) {
    toast("Phone already registered!", "err");
    return;
  }

  pts.push({
    id: uid(),
    name: $("#rName").value.trim(),
    age: parseInt($("#rAge").value) || 0,
    ageUnit: $("#rAgeUnit").value,
    gender: $("#rGender").value,
    weight: parseFloat($("#rWeight").value) || null,
    phone,
    guardian: $("#rGuardian").value.trim(),
    address: $("#rAddr").value.trim(),
    createdAt: todayISO(),
  });

  Store.savePatients(pts);
  e.target.reset();
  toast("✓ Patient registered", "ok");
});

/* ── Visit ── */
let selComplaints = new Set();

// Chips
$$(".chip").forEach((c) => {
  c.addEventListener("click", () => {
    const v = c.dataset.c;
    if (selComplaints.has(v)) { selComplaints.delete(v); c.classList.remove("on"); }
    else { selComplaints.add(v); c.classList.add("on"); }
  });
});

// Patient search
$("#vSearch").addEventListener("input", function () {
  const q = this.value.trim().toLowerCase();
  const dd = $("#vDD");
  if (q.length < 2) { dd.classList.remove("show"); return; }
  const res = Store.patients().filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  if (!res.length) {
    dd.innerHTML = '<div class="dd-item"><small>No patients found</small></div>';
  } else {
    dd.innerHTML = res.map((p) =>
      `<div class="dd-item" data-id="${p.id}"><strong>${esc(p.name)}</strong> <small>· ${esc(p.phone)} · ${p.age} ${p.ageUnit}</small></div>`
    ).join("");
  }
  dd.classList.add("show");
});

// Delegate click on dropdown
$("#vDD").addEventListener("click", (e) => {
  const item = e.target.closest(".dd-item");
  if (!item) return;
  const id = item.dataset.id;
  const p = Store.patients().find((x) => x.id === id);
  if (!p) return;
  pickVisitPatient(p);
});

function pickVisitPatient(p) {
  $("#vPid").value = p.id;
  $("#vSearch").value = "";
  $("#vDD").classList.remove("show");
  const b = $("#vBadge");
  b.innerHTML = `<span><strong>${esc(p.name)}</strong> — ${p.age} ${p.ageUnit}, ${p.gender} · ${esc(p.phone)}</span>
    <button class="badge-x" onclick="clearVisitPt()">✕</button>`;
  b.style.display = "flex";
}

window.clearVisitPt = function () {
  $("#vPid").value = "";
  $("#vBadge").style.display = "none";
};

// Admit toggle
$("#vAdmit").addEventListener("change", (e) => {
  $("#vAdmitBox").style.display = e.target.checked ? "block" : "none";
});

// Submit
$("#frmVisit").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!$("#vPid").value) { toast("Select a patient first", "err"); return; }
  if (!selComplaints.size) { toast("Select at least one complaint", "err"); return; }

  const vis = Store.visits();
  vis.push({
    id: vid(),
    pid: $("#vPid").value,
    date: todayISO(),
    complaints: [...selComplaints],
    notes: $("#vNotes").value.trim(),
    wt: parseFloat($("#vWt").value) || null,
    temp: parseFloat($("#vTemp").value) || null,
    dx: $("#vDx").value.trim(),
    rx: $("#vRx").value.trim(),
    fu: $("#vFu").value,
    admitted: $("#vAdmit").checked,
    ward: $("#vWard").value.trim(),
    admReason: $("#vAdmReason").value.trim(),
  });
  Store.saveVisits(vis);

  // Reset
  e.target.reset();
  selComplaints.clear();
  $$(".chip").forEach((c) => c.classList.remove("on"));
  clearVisitPt();
  $("#vAdmitBox").style.display = "none";
  toast("✓ Visit saved", "ok");
});

/* ── Search ── */
$("#sInput").addEventListener("input", function () {
  const q = this.value.trim().toLowerCase();
  const el = $("#sResults");
  $("#detailCard").style.display = "none";
  if (q.length < 1) { el.innerHTML = '<p class="empty">Type to search…</p>'; return; }
  const res = Store.patients().filter((p) => p.name.toLowerCase().includes(q) || p.phone.includes(q));
  const vis = Store.visits();
  if (!res.length) { el.innerHTML = '<p class="empty">No patients found.</p>'; return; }
  el.innerHTML = res.map((p) => {
    const vc = vis.filter((v) => v.pid === p.id).length;
    const adm = vis.some((v) => v.pid === p.id && v.admitted);
    return `<div class="li" onclick="showDetail('${p.id}')">
      <div class="li-top">
        <span class="li-name">${esc(p.name)}</span>
        <span>${adm ? '<span class="tag tag-rd">ADM</span>' : ""}<span class="tag tag-gn">${vc}</span></span>
      </div>
      <div class="li-sub">${p.age} ${p.ageUnit} · ${p.gender} · ${esc(p.phone)}</div>
    </div>`;
  }).join("");
});

/* ── Patient Detail ── */
window.showDetail = function (pid) {
  const p = Store.patients().find((x) => x.id === pid);
  if (!p) return;
  const vis = Store.visits().filter((v) => v.pid === pid).sort((a, b) => new Date(b.date) - new Date(a.date));

  const initials = p.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  let html = `
    <div class="det-hdr">
      <div class="det-av">${initials}</div>
      <div>
        <div class="det-name">${esc(p.name)}</div>
        <div class="det-meta">${p.age} ${p.ageUnit} · ${p.gender} · ${esc(p.phone)}</div>
        <div class="det-meta">${esc(p.guardian ? "Guardian: " + p.guardian : "")} ${esc(p.address ? "· " + p.address : "")}</div>
      </div>
    </div>`;

  // Weight trend
  if (vis.length) {
    const wts = vis.filter((v) => v.wt).slice(0, 5).reverse();
    if (wts.length) {
      html += '<div class="det-stitle">Weight Trend</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
      wts.forEach((v, i) => {
        let cls = "";
        if (i > 0 && wts[i - 1].wt) {
          cls = v.wt < wts[i - 1].wt ? "tag-rd" : v.wt > wts[i - 1].wt ? "tag-gn" : "tag-bl";
        }
        html += `<span class="tag ${cls}" style="padding:4px 10px;font-size:.82rem">${v.wt} kg<br><small style="font-weight:400">${fmtDate(v.date)}</small></span>`;
      });
      html += "</div>";
    }
  }

  // Visits
  html += '<div class="det-stitle">Visits (' + vis.length + ")</div>";
  if (!vis.length) {
    html += '<p class="empty">No visits recorded.</p>';
  } else {
    vis.slice(0, 10).forEach((v) => {
      const tags = v.complaints.map((c) => `<span class="tag tag-bl">${esc(c)}</span>`).join(" ");
      const adm = v.admitted ? " adm" : "";
      html += `<div class="v-card${adm}">
        <div class="v-card-top"><span class="v-card-date">${fmtDate(v.date)}</span>${tags}${v.admitted ? ' <span class="tag tag-rd">Admitted</span>' : ""}</div>
        <div class="v-card-body">
          ${v.dx ? "<strong>Dx:</strong> " + esc(v.dx) + "<br>" : ""}
          ${v.rx ? "<strong>Rx:</strong> " + esc(v.rx) + "<br>" : ""}
          ${v.notes ? esc(v.notes) + "<br>" : ""}
          ${v.wt ? "Weight: " + v.wt + " kg · " : ""}${v.temp ? "Temp: " + v.temp + "°F" : ""}
          ${v.admitted && v.ward ? "<br><strong>Ward:</strong> " + esc(v.ward) : ""}
          ${v.admitted && v.admReason ? " · " + esc(v.admReason) : ""}
          ${v.fu ? "<br><strong>Follow-up:</strong> " + fmtDate(v.fu) : ""}
        </div>
      </div>`;
    });
  }

  $("#detailBody").innerHTML = html;
  $("#detailCard").style.display = "";
  $("#sResults").innerHTML = "";
  $("#sInput").value = "";
};

/* ── Init ── */
document.addEventListener("DOMContentLoaded", () => {
  const d = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  $("#headerDate").textContent = d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  moveInk();
  refreshDash();
});
