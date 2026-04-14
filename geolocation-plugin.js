// ============================================================================
// Geolocation & Hospital Detection Plugin
// ============================================================================
// Handles:
// - Location detection via Geolocation API
// - Hospital proximity detection
// - Hospital-specific MR# generation (MR-[CODE]-000001)
// - Hospital selector UI
// - Integration with Firebase for hospital-scoped data

const geolocationModule = {
  currentLocation: null,
  detectedHospital: null,
  isListening: false,

  // ========================================================================
  // Initialization
  // ========================================================================
  init() {
    this.setupHospitalUI();
    this.requestLocation();
    // Auto-detect every 5 minutes for updated location
    setInterval(() => this.requestLocation(), 300000);
  },

  // ========================================================================
  // Location Detection
  // ========================================================================
  async requestLocation() {
    if (!navigator.geolocation) {
      console.log("Geolocation not supported on this device");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => this.onLocationSuccess(position),
      (error) => this.onLocationError(error),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  },

  onLocationSuccess(position) {
    const { latitude, longitude } = position.coords;
    this.currentLocation = { lat: latitude, lng: longitude };
    console.log(`Location detected: ${latitude}, ${longitude}`);
    
    this.detectNearbyHospital();
    this.saveLocationToRecord();
  },

  onLocationError(error) {
    console.log("Geolocation error:", error.message);
    if (error.code === error.PERMISSION_DENIED) {
      toast("Location permission denied. Hospital auto-detection disabled.", "err");
    }
  },

  // ========================================================================
  // Hospital Detection (Proximity Check)
  // ========================================================================
  detectNearbyHospital() {
    if (!this.currentLocation || !window.firebaseModule) return;

    const hospitals = window.firebaseModule.hospitals;
    let closestHospital = null;
    let closestDistance = Infinity;

    for (const [id, hospital] of Object.entries(hospitals)) {
      const distance = this.calculateDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        hospital.lat,
        hospital.lng
      );

      // Check if within hospital radius (in km)
      if (distance <= hospital.radius && distance < closestDistance) {
        closestHospital = { id, ...hospital, distance };
        closestDistance = distance;
      }
    }

    if (closestHospital) {
      this.setDetectedHospital(closestHospital);
      this.updateMRPreview();
      const msg = `📍 Detected at ${closestHospital.name} (${(closestHospital.distance * 1000).toFixed(0)}m away)`;
      console.log(msg);
    }
  },

  // Haversine formula: Calculate distance between two points
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  setDetectedHospital(hospital) {
    this.detectedHospital = hospital;
    if (window.firebaseModule) {
      window.firebaseModule.setCurrentHospital(hospital.id);
    }
    localStorage.setItem("opd_detected_hospital", JSON.stringify(hospital));
  },

  // ========================================================================
  // Hospital Selector UI
  // ========================================================================
  setupHospitalUI() {
    const saved = localStorage.getItem("opd_detected_hospital");
    if (saved) {
      try {
        this.detectedHospital = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to restore hospital:", e);
      }
    }

    // Add hospital selector button to header if not exists
    const hdrRight = document.querySelector(".hdr-right");
    if (hdrRight && !document.getElementById("hospitalBtn")) {
      const hospitalBtn = document.createElement("button");
      hospitalBtn.id = "hospitalBtn";
      hospitalBtn.className = "hdr-btn";
      hospitalBtn.title = "Select hospital";
      hospitalBtn.textContent = "Select Hospital";
      hospitalBtn.onclick = () => this.openHospitalSelector();
      
      // Insert before the Export button
      const exportBtn = document.querySelector('[onclick="exportData()"]');
      if (exportBtn) {
        hdrRight.insertBefore(hospitalBtn, exportBtn);
      } else {
        hdrRight.appendChild(hospitalBtn);
      }

      this.updateHospitalLabel();
    }
  },

  updateHospitalLabel() {
    const btn = document.getElementById("hospitalBtn");
    if (btn) {
      if (this.detectedHospital) {
        btn.textContent = `🏥 ${this.detectedHospital.code}`;
        btn.style.background = "#10b981";
        btn.style.color = "white";
      } else {
        btn.textContent = "Select Hospital";
        btn.style.background = "";
        btn.style.color = "";
      }
    }
  },

  openHospitalSelector() {
    if (!window.firebaseModule) return;

    const hospitals = window.firebaseModule.hospitals;
    const options = Object.entries(hospitals).map(([id, h]) => {
      const current = this.detectedHospital?.id === id ? "✓ " : "";
      return `${current}${h.code} - ${h.name}`;
    }).join("\n");

    const selected = window.prompt(
      "Select a hospital:\n\n" + options + "\n\nEnter hospital code:",
      this.detectedHospital?.code || ""
    );

    if (!selected) return;

    const hospitalId = Object.entries(hospitals).find(
      ([_, h]) => h.code === selected.trim() || h.code === selected.trim().split(" ")[0]
    )?.[0];

    if (hospitalId) {
      const hospital = hospitals[hospitalId];
      this.setDetectedHospital({ id: hospitalId, ...hospital });
      this.updateHospitalLabel();
      this.updateMRPreview();
      toast(`Hospital set to ${hospital.name}`, "ok");
    } else {
      toast("Invalid hospital code", "err");
    }
  },

  // ========================================================================
  // MR# Generation (Hospital-specific)
  // ========================================================================
  generateHospitalMRCode() {
    if (this.detectedHospital) {
      return this.detectedHospital.code;
    }
    if (window.firebaseModule) {
      return window.firebaseModule.getHospitalMRPrefix();
    }
    return "OPD";
  },

  updateMRPreview() {
    // Update the MR preview in registration form if exists
    const mrPreview = document.getElementById("regNextUhid");
    if (mrPreview && window.db && window.db.meta) {
      const code = this.generateHospitalMRCode();
      const nextNum = String((window.db.meta.patientCounter || 0) + 1).padStart(6, "0");
      mrPreview.textContent = `MR-${code}-${nextNum}`;
    }
  },

  // ========================================================================
  // Save Location to Patient Record
  // ========================================================================
  saveLocationToRecord() {
    if (!this.currentLocation) return;
    // Store in sessionStorage for current record being created
    sessionStorage.setItem("opd_patient_location", JSON.stringify(this.currentLocation));
  },

  // ========================================================================
  // Integration with Patient Registration
  // ========================================================================
  attachToPatientForm() {
    const frmReg = document.getElementById("frmReg");
    if (!frmReg) return;

    // Intercept form submission to add location + hospital
    const originalSubmit = frmReg.onsubmit;
    frmReg.addEventListener("submit", (e) => {
      // Location and hospital are automatically saved
      const currentLoc = sessionStorage.getItem("opd_patient_location");
      if (currentLoc) {
        try {
          const location = JSON.parse(currentLoc);
          // This will be available in the patient object during normalization
          sessionStorage.setItem("opd_current_patient_hospital", this.generateHospitalMRCode());
        } catch (e) {
          console.error("Location parsing error:", e);
        }
      }
    });
  },

  // ========================================================================
  // Get Hospital Context for Queries
  // ========================================================================
  getHospitalContext() {
    return {
      hospital: this.detectedHospital,
      location: this.currentLocation,
      mrCodePrefix: this.generateHospitalMRCode()
    };
  }
};

// Expose globally
window.geolocationModule = geolocationModule;
