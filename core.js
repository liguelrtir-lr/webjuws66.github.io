/* =========================================================================
   CORE.JS — Moteur commun pour tous les formulaires "Ordre de Mission"
   Ligue de Tir Languedoc-Roussillon
   =========================================================================
   Ce fichier centralise TOUT ce qui est identique entre les différents
   formulaires (bénévoles, arbitres, comité, formation, divers, encadrement...)
   Chaque page mission-xxx.html ne contient plus que :
     - le formulaire HTML propre à son type de mission
     - un petit objet de config (titre, couleur, champs propres)
     - une fonction calculateTotal() spécifique
     - une fonction buildPdfBody() spécifique (contenu du PDF)
   et appelle MissionApp.init(config) à la fin.

   Pour ajouter un nouveau type de mission : dupliquer un des fichiers
   mission-xxx.html qui a un mode de calcul proche du besoin, et n'adapter
   que le formulaire + calculateTotal + buildPdfBody.
   ========================================================================= */

const MissionApp = (function () {

  // ---- Configuration partagée (identique pour tous les formulaires) ----
  const SHEET_URL =
    "https://script.google.com/macros/s/AKfycbwsCwL9_sRFXu-9AWZWN4etqAvnslb2UWEBfOsFGUP3bm36YR54cBfecnAzlBEKs7qVtA/exec";

  const ADMIN_PIN = "2409"; // à changer si besoin

  let cfg = null;         // config injectée par la page (voir init())
  let missions = [];      // historique local (localStorage)
  let emailConfig = null; // config EmailJS (localStorage, modifiable en admin)

  // ======================= ADMIN LOCK (localStorage) =====================

  function isAdmin() {
    return localStorage.getItem("om_admin") === "1";
  }

  function adminLogin() {
    const pin = prompt("Code admin :");
    if (pin === null) return;
    if (pin === ADMIN_PIN) {
      localStorage.setItem("om_admin", "1");
      updateAdminUI();
      alert("Mode admin activé sur cet appareil.");
    } else {
      alert("Code incorrect.");
    }
  }

  function adminLogout() {
    localStorage.removeItem("om_admin");
    updateAdminUI();
    switchTab(null, "formulaire");
  }

  function updateAdminUI() {
    document.body.classList.toggle("is-admin", isAdmin());
    document.querySelectorAll('[data-admin="true"]').forEach((el) => {
      el.style.display = isAdmin() ? "" : "none";
    });
    const openBtn = document.getElementById("adminLink");
    const closeBtn = document.getElementById("adminClose");
    if (openBtn) openBtn.style.display = isAdmin() ? "none" : "";
    if (closeBtn) closeBtn.style.display = isAdmin() ? "" : "none";
  }

  // ============================ ONGLETS ==================================

  function switchTab(e, tabName) {
    if ((tabName === "config" || tabName === "historique") && !isAdmin()) {
      adminLogin();
      if (!isAdmin()) return;
    }
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));

    const btn =
      e && e.currentTarget
        ? e.currentTarget
        : document.querySelector(`.tab[onclick*="'${tabName}'"]`);
    if (btn) btn.classList.add("active");

    const panel = document.getElementById(tabName);
    if (panel) panel.classList.add("active");

    if (tabName === "historique") loadMissionsTable();
  }

  // ======================= ENVOI TABLEUR (Sheets) =========================

  function envoyerVersTableur(formData) {
    try {
      fetch(SHEET_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(formData),
      }).catch((err) => console.warn("Envoi tableur échoué:", err));
    } catch (err) {
      console.warn("Envoi tableur échoué:", err);
    }
  }

  // ============================= EMAILJS ==================================

  function loadEmailConfig() {
    emailConfig =
      JSON.parse(localStorage.getItem("emailConfig")) || {
        serviceId: "service_ypb4odc",
        templateId: "template_bwenz1e",
        publicKey: "sxP51N-7hje2L8h0l",
        emailLigue: "webjuws66@gmail.com",
      };
  }

  function initEmailJS() {
    try {
      if (emailConfig.publicKey) emailjs.init({ publicKey: emailConfig.publicKey });
    } catch (e) {
      console.warn("EmailJS init a échoué:", e);
    }
  }

  async function sendNotificationEmails(formData) {
    if (!(emailConfig.publicKey && emailConfig.serviceId && emailConfig.templateId)) return;
    const payload = {
      to_name: formData.nom + " " + formData.prenom,
      nom: formData.nom,
      prenom: formData.prenom,
      objet: formData.objet || "",
      lieu: formData.lieu || "",
      dateMission: formData.dateMission || "",
      total: formData.total,
      email: formData.email || "",
    };
    await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
      ...payload,
      to_email: formData.email || emailConfig.emailLigue,
    });
    await emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
      ...payload,
      to_email: emailConfig.emailLigue,
      to_name: "Ligue Languedoc Roussillon",
    });
  }

  function saveConfig() {
    emailConfig = {
      serviceId: document.getElementById("serviceId").value.trim(),
      templateId: document.getElementById("templateId").value.trim(),
      publicKey: document.getElementById("publicKey").value.trim(),
      emailLigue: document.getElementById("emailLigue").value.trim(),
    };
    localStorage.setItem("emailConfig", JSON.stringify(emailConfig));
    initEmailJS();
    const el = document.getElementById("configSuccess");
    el.textContent = "✅ Configuration sauvegardée avec succès !";
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), 3000);
  }

  function fillConfigForm() {
    if (document.getElementById("serviceId")) {
      document.getElementById("serviceId").value = emailConfig.serviceId || "";
      document.getElementById("templateId").value = emailConfig.templateId || "";
      document.getElementById("publicKey").value = emailConfig.publicKey || "";
      document.getElementById("emailLigue").value = emailConfig.emailLigue || "";
    }
  }

  // ============================ HISTORIQUE =================================

  function loadMissionsLocal() {
    missions = JSON.parse(localStorage.getItem("missions_" + cfg.storageKey)) || [];
  }

  function saveMissionsLocal() {
    localStorage.setItem("missions_" + cfg.storageKey, JSON.stringify(missions));
  }

  function loadMissionsTable() {
    const tbody = document.getElementById("missionsTableBody");
    if (!tbody) return;
    if (!missions.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:#999;padding:40px;">Aucune mission enregistrée</td></tr>';
      return;
    }
    tbody.innerHTML = missions
      .map(
        (m) => `
        <tr>
          <td>${new Date(m.dateCreation).toLocaleDateString("fr-FR")}</td>
          <td>${m.nom} ${m.prenom}</td>
          <td>${m.objet || ""}</td>
          <td>${m.lieu || ""}</td>
          <td style="font-weight:600;">${m.total} €</td>
          <td>
            <button onclick="MissionApp.regeneratePDF(${m.id})"
              style="background:#667eea;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;">
              📄 PDF
            </button>
          </td>
        </tr>`
      )
      .reverse()
      .join("");
  }

  function regeneratePDF(id) {
    const mission = missions.find((m) => m.id === id);
    if (mission) {
      const doc = generatePDF(mission);
      doc.save("Ordre_Mission_" + mission.nom + "_" + mission.prenom + ".pdf");
    }
  }

  function exportToExcel() {
    if (!missions.length) {
      alert("Aucune mission à exporter.");
      return;
    }
    const headers = [
      "Date création", "Objet", "Lieu", "Date mission", "Nom", "Prénom",
      "Adresse", "Email", "Total",
    ];
    const rows = missions
      .slice()
      .reverse()
      .map((m) => [
        new Date(m.dateCreation).toLocaleString("fr-FR"),
        m.objet || "", m.lieu || "", m.dateMission || "",
        m.nom, m.prenom, m.adresse || "", m.email || "", m.total,
      ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historique_missions_" + cfg.storageKey + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // =========================== GENERATION PDF ===============================
  // Le "chrome" (bandeau, logo, titre, footer, signatures, attestation) est
  // commun. Le contenu métier (sections mission/agent/frais) est fourni par
  // la page via cfg.buildPdfBody(doc, data, helpers).

  function drawSectionTitle(doc, y, text, color) {
    doc.setFontSize(13);
    doc.setFont(undefined, "bold");
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(text, 20, y);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
  }

  function drawInfoBox(doc, y, height) {
    doc.setFillColor(245, 247, 250);
    doc.rect(15, y - 5, 180, height, "F");
  }

  function drawField(doc, y, label, value) {
    doc.setFont(undefined, "bold");
    doc.text(label, 20, y);
    doc.setFont(undefined, "normal");
    doc.text(String(value ?? ""), 60, y);
  }

  // Dessine un tableau "NATURE / DÉTAIL / MONTANT" + ligne TOTAL.
  // rows: [[nature, detail, montant], ...]
  function drawFraisTable(doc, y, rows, total, color) {
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(15, y - 5, 180, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont(undefined, "bold");
    doc.text("NATURE", 20, y);
    doc.text("DÉTAIL", 90, y);
    doc.text("MONTANT", 165, y);

    y += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");

    rows.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(15, y - 5, 180, 8, "F");
      }
      doc.text(String(row[0]), 20, y);
      doc.text(String(row[1]), 90, y);
      doc.text(String(row[2]), 165, y);
      y += 8;
    });

    y += 2;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(15, y - 5, 180, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");
    doc.text("TOTAL À REMBOURSER", 20, y);
    doc.text((total || "0.00") + " €", 165, y);

    return y;
  }

  function generatePDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const color = cfg.bannerColor;

    // Bandeau + logo
    doc.setFillColor(color[0], color[1], color[2]);
    doc.rect(0, 0, 210, 35, "F");
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(10, 6, 22, 22, 3, 3, "F");
    try {
      doc.addImage(LOGO_DATA_URL, "PNG", 10.5, 6.5, 21, 21);
    } catch (e) {
      console.warn("Logo non ajouté:", e);
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, "bold");
    // Le titre est centré à x=105. Le logo occupe la zone x=10 à x=32.
    // On réduit la taille de police si besoin pour que le titre ne
    // déborde jamais sur le logo, quelle que soit la longueur du texte.
    const maxTitleWidth = 2 * (105 - 34); // = 142mm
    let titleFontSize = 22;
    doc.setFontSize(titleFontSize);
    while (titleFontSize > 12 && doc.getTextWidth(cfg.pdfTitle) > maxTitleWidth) {
      titleFontSize -= 1;
      doc.setFontSize(titleFontSize);
    }
    doc.text(cfg.pdfTitle, 105, 15, { align: "center" });
    doc.setFontSize(11);
    doc.setFont(undefined, "normal");
    doc.text("Ligue de Tir Languedoc Roussillon", 105, 25, { align: "center" });

    doc.setTextColor(0, 0, 0);

    const helpers = {
      sectionTitle: drawSectionTitle,
      infoBox: drawInfoBox,
      field: drawField,
      fraisTable: drawFraisTable,
      color: color,
      accentColor: cfg.accentColor || color,
    };

    // Contenu métier propre au type de mission (fourni par la page)
    let y = cfg.buildPdfBody(doc, data, helpers);

    // Attestation + signatures (commun)
    y += 18;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(
      "Je soussigné(e), " + (data.nom || "") + " " + (data.prenom || "") +
        ", atteste sur l'honneur l'exactitude",
      20, y
    );
    y += 5;
    doc.text("des informations ci-dessus et sollicite le remboursement des frais engagés.", 20, y);

    y += 15;
    doc.setFont(undefined, "bold");
    doc.text("Fait à " + (data.faitA || "") + ", le " + (data.dateComplete || ""), 20, y);

    y += 10;
    doc.setFont(undefined, "normal");
    doc.text("Signature du président :", 20, y);
    doc.text("Visa de l'ordonnateur :", 120, y);

    y += 15;
    doc.line(20, y, 80, y);
    doc.line(120, y, 180, y);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Document généré automatiquement", 105, 285, { align: "center" });

    return doc;
  }

  // ============================ SOUMISSION ==================================

  function showMessage(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
    setTimeout(() => (el.style.display = "none"), id === "successMessage" ? 6000 : 9000);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const total = cfg.calculateTotal();
    const formData = cfg.buildFormData(total);
    formData.formType = cfg.formType;
    formData.dateComplete = new Date().toLocaleDateString("fr-FR");

    const submitBtn = document.getElementById("submitBtn");
    const loader = document.getElementById("loader");
    if (submitBtn) submitBtn.disabled = true;
    if (loader) loader.classList.add("active");

    try {
      const doc = generatePDF(formData);
      doc.save("Ordre_Mission_" + formData.nom + "_" + formData.prenom + ".pdf");

      envoyerVersTableur(formData);
      await sendNotificationEmails(formData);

      missions.push({ ...formData, id: Date.now(), dateCreation: new Date().toISOString() });
      saveMissionsLocal();

      showMessage(
        "successMessage",
        "✅ PDF généré et téléchargé. Pensez à envoyer le PDF à la ligue avec vos justificatifs."
      );
      document.getElementById("missionForm").reset();
      cfg.calculateTotal();
    } catch (error) {
      console.error("Erreur complète:", error);
      showMessage("errorMessage", "❌ Erreur: " + (error.text || error.message || JSON.stringify(error)));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (loader) loader.classList.remove("active");
    }
  }

  // ================================ INIT =====================================

  function init(userConfig) {
    cfg = userConfig; // { formType, pdfTitle, bannerColor, accentColor, storageKey,
                       //   calculateTotal, buildFormData, buildPdfBody }
    loadEmailConfig();
    loadMissionsLocal();

    window.addEventListener("DOMContentLoaded", () => {
      updateAdminUI();
      initEmailJS();
      fillConfigForm();
      cfg.calculateTotal();
      const form = document.getElementById("missionForm");
      if (form) form.addEventListener("submit", handleSubmit);
    });
  }

  return {
    init,
    switchTab,
    adminLogin,
    adminLogout,
    saveConfig,
    exportToExcel,
    regeneratePDF,
  };
})();

// Raccourcis globaux utilisés par les attributs onclick= dans le HTML
function switchTab(e, name) { MissionApp.switchTab(e, name); }
function adminLogin() { MissionApp.adminLogin(); }
function adminLogout() { MissionApp.adminLogout(); }
function saveConfig() { MissionApp.saveConfig(); }
function exportToExcel() { MissionApp.exportToExcel(); }
