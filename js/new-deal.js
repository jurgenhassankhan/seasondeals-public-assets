(() => {
  "use strict";

  const CONFIG = {
    dealsEndpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-partner/deals",
    loginUrl: "/seasondeals-public-assets/login.html",
    dealsUrl: "deals.html",
    tokenKey: "sd_partner_token",
    userKey: "sd_partner_user"
  };

  const elements = {
    form: document.getElementById("sd-deal-form"),
    submit: document.getElementById("sd-submit-deal"),
    message: document.getElementById("sd-global-message"),
    title: document.getElementById("sd-title"),
    shortDescription: document.getElementById("sd-short-description"),
    titleCount: document.getElementById("sd-title-count"),
    shortCount: document.getElementById("sd-short-count"),
    imageFile: document.getElementById("sd-image-file"),
    uploadField: document.getElementById("sd-upload-field"),
    removeImage: document.getElementById("sd-remove-image"),
    imagePreview: document.getElementById("sd-image-preview"),
    sidebar: document.getElementById("sd-sidebar"),
    overlay: document.getElementById("sd-mobile-overlay"),
    menuToggle: document.getElementById("sd-menu-toggle"),
    sidebarClose: document.getElementById("sd-sidebar-close"),
    userMenuButton: document.getElementById("sd-user-menu-button"),
    userDropdown: document.getElementById("sd-user-dropdown"),
    sidebarLogout: document.getElementById("sd-sidebar-logout"),
    dropdownLogout: document.getElementById("sd-dropdown-logout"),
    sidebarHotel: document.getElementById("sd-sidebar-hotel"),
    sidebarRole: document.getElementById("sd-sidebar-role"),
    hotelAvatar: document.getElementById("sd-hotel-avatar"),
    topbarHotel: document.getElementById("sd-topbar-hotel"),
    userName: document.getElementById("sd-user-name"),
    userRole: document.getElementById("sd-user-role"),
    userAvatar: document.getElementById("sd-user-avatar"),
    dropdownName: document.getElementById("sd-dropdown-name"),
    dropdownEmail: document.getElementById("sd-dropdown-email")
  };

  let previewObjectUrl = "";

  init();

  function init() {
    if (!sessionStorage.getItem(CONFIG.tokenKey)) {
      redirectToLogin();
      return;
    }
    renderUser(readStoredUser());
    bindEvents();
    setDateDefaults();
    updateCounters();
  }

  function bindEvents() {
    elements.form?.addEventListener("submit", submitDeal);
    elements.title?.addEventListener("input", updateCounters);
    elements.shortDescription?.addEventListener("input", updateCounters);
    elements.imageFile?.addEventListener("change", updateImagePreview);
    elements.removeImage?.addEventListener("click", clearSelectedImage);
    ["dragenter", "dragover"].forEach((eventName) => {
      elements.uploadField?.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.uploadField.classList.add("is-dragging");
      });
    });
    elements.uploadField?.addEventListener("dragleave", () => {
      elements.uploadField.classList.remove("is-dragging");
    });
    elements.uploadField?.addEventListener("drop", (event) => {
      event.preventDefault();
      elements.uploadField.classList.remove("is-dragging");
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      elements.imageFile.files = transfer.files;
      updateImagePreview();
    });
    elements.menuToggle?.addEventListener("click", openSidebar);
    elements.sidebarClose?.addEventListener("click", closeSidebar);
    elements.overlay?.addEventListener("click", closeSidebar);
    elements.userMenuButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      elements.userDropdown?.classList.toggle("is-open");
    });
    document.addEventListener("click", () => elements.userDropdown?.classList.remove("is-open"));
    elements.sidebarLogout?.addEventListener("click", logout);
    elements.dropdownLogout?.addEventListener("click", logout);
  }

  async function submitDeal(event) {
    event.preventDefault();
    clearMessage();

    if (!elements.form.reportValidity()) return;

    const payload = await buildPayload();
    const validationError = validatePayload(payload);
    if (validationError) {
      showMessage(validationError, "error");
      return;
    }

    setLoading(true);
    try {
      const result = await apiRequest(CONFIG.dealsEndpoint, payload);
      const createdDeal = result?.deal || result?.data?.deal || result?.data || null;
      const id = createdDeal?.id;
      showMessage(id
        ? `Xano meldt succes met deal-ID #${id}. Controleer dit ID nu in de deals-tabel.`
        : "Xano gaf een succesvolle HTTP-status terug, maar zonder herkenbaar deal-ID. Bekijk de technische response hieronder.",
        id ? "info" : "error");
      showTechnicalResponse(result);
      elements.submit.disabled = true;
      elements.submit.textContent = id ? `Opgeslagen als deal #${id}` : "Response ontvangen";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("SeasonDeals create deal failed:", error);
      showMessage(error?.message || "De deal kon niet worden opgeslagen. Probeer het opnieuw.", "error");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  }

  async function buildPayload() {
    const data = new FormData(elements.form);
    [
      "includes_breakfast",
      "includes_wifi",
      "includes_parking",
      "includes_late_checkout",
      "includes_welcome_drink"
    ].forEach((name) => {
      data.set(name, elements.form.elements[name].checked ? "true" : "false");
    });
    if (clean(data.get("original_price")) === "") data.delete("original_price");

    const imageFile = data.get("image_file");
    if (imageFile instanceof File && imageFile.size > 0) {
      const normalizedImage = await normalizeImageForXano(imageFile);
      data.set("image_file", normalizedImage, normalizedImage.name);
      data.set("image_extension", "jpg");
    }

    return data;
  }

  async function normalizeImageForXano(file) {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("De afbeelding kon niet worden voorbereid.")),
        "image/jpeg",
        0.88
      );
    });

    const safeBaseName = (file.name || "deal-afbeelding")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "deal-afbeelding";

    return new File([blob], `${safeBaseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  }

  function validatePayload(payload) {
    const price = toNumber(payload.get("price"));
    const originalPrice = toOptionalNumber(payload.get("original_price"));
    const validFrom = clean(payload.get("valid_from"));
    const validUntil = clean(payload.get("valid_until"));
    const file = payload.get("image_file");

    if (originalPrice !== null && originalPrice <= price) {
      return "De oorspronkelijke prijs moet hoger zijn dan de dealprijs.";
    }
    if (validUntil < validFrom) {
      return "De einddatum moet op of na de begindatum liggen.";
    }
    if (!(file instanceof File) || file.size === 0) {
      return "Kies een afbeelding voor deze deal.";
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return "Gebruik een JPG-, PNG- of WebP-afbeelding.";
    }
    if (file.size > 8 * 1024 * 1024) {
      return "De afbeelding mag maximaal 8 MB groot zijn.";
    }
    return "";
  }

  async function apiRequest(url, body) {
    const token = sessionStorage.getItem(CONFIG.tokenKey);
    if (!token) {
      redirectToLogin();
      throw new Error("Je sessie is verlopen.");
    }

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body
      });
    } catch {
      throw new Error("De dealservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw.");
    }

    const responseData = await readResponse(response);
    if (response.status === 401 || response.status === 403) {
      clearSession();
      window.setTimeout(redirectToLogin, 600);
      throw new Error("Je sessie is verlopen. Je wordt doorgestuurd naar de loginpagina.");
    }
    if (!response.ok) {
      const apiMessage = responseData?.message || responseData?.error || responseData?.detail;
      throw new Error(typeof apiMessage === "string"
        ? apiMessage
        : `Deal opslaan mislukt met status ${response.status}.`);
    }
    return responseData;
  }

  async function readResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return { message: text }; }
  }

  function setDateDefaults() {
    const from = document.getElementById("sd-valid-from");
    const until = document.getElementById("sd-valid-until");
    const today = new Date();
    const later = new Date(today);
    later.setMonth(later.getMonth() + 3);
    from.min = toDateInput(today);
    until.min = toDateInput(today);
    if (!from.value) from.value = toDateInput(today);
    if (!until.value) until.value = toDateInput(later);
    from.addEventListener("change", () => {
      until.min = from.value;
      if (until.value < from.value) until.value = from.value;
    });
  }

  function updateCounters() {
    elements.titleCount.textContent = `${elements.title.value.length}/120 tekens`;
    elements.shortCount.textContent = `${elements.shortDescription.value.length}/240 tekens`;
  }

  function updateImagePreview() {
    const file = elements.imageFile.files?.[0];
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";

    if (!file) {
      elements.imagePreview.style.backgroundImage = "";
      elements.imagePreview.classList.remove("has-image");
      return;
    }

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      elements.imageFile.value = "";
      showMessage(file.size > 8 * 1024 * 1024
        ? "De afbeelding mag maximaal 8 MB groot zijn."
        : "Gebruik een JPG-, PNG- of WebP-afbeelding.", "error");
      return;
    }

    clearMessage();
    previewObjectUrl = URL.createObjectURL(file);
    elements.imagePreview.style.backgroundImage = `url("${previewObjectUrl}")`;
    elements.imagePreview.classList.add("has-image");
  }

  function clearSelectedImage() {
    elements.imageFile.value = "";
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = "";
    elements.imagePreview.style.backgroundImage = "";
    elements.imagePreview.classList.remove("has-image");
  }

  function showTechnicalResponse(result) {
    let output = document.getElementById("sd-create-response");
    if (!output) {
      output = document.createElement("pre");
      output.id = "sd-create-response";
      output.className = "sd-create-response";
      elements.message.insertAdjacentElement("afterend", output);
    }
    output.textContent = JSON.stringify(result, null, 2);
  }

  function setLoading(loading) {
    elements.submit.disabled = loading;
    elements.submit.textContent = loading ? "Conceptdeal opslaan..." : "Conceptdeal opslaan";
  }

  function renderUser(user) {
    const name = fallback(user?.name || user?.full_name, "Partner");
    const role = fallback(user?.role, "hotel partner");
    const email = fallback(user?.email, "");
    const hotelName = fallback(user?.hotel_name || user?.hotel?.name || user?.hotel?.hotel_name, "SeasonDeals hotel partner");
    setText(elements.userName, name); setText(elements.userRole, formatLabel(role));
    setText(elements.dropdownName, name); setText(elements.dropdownEmail, email);
    setText(elements.userAvatar, initial(name)); setText(elements.hotelAvatar, initial(hotelName));
    setText(elements.sidebarHotel, hotelName); setText(elements.sidebarRole, formatLabel(role)); setText(elements.topbarHotel, hotelName);
  }

  function readStoredUser() { try { return JSON.parse(sessionStorage.getItem(CONFIG.userKey) || "{}"); } catch { return {}; } }
  function logout() { clearSession(); redirectToLogin(); }
  function clearSession() { sessionStorage.removeItem(CONFIG.tokenKey); sessionStorage.removeItem(CONFIG.userKey); }
  function redirectToLogin() { window.location.replace(CONFIG.loginUrl); }
  function openSidebar() { elements.sidebar?.classList.add("is-open"); elements.overlay?.classList.add("is-visible"); document.body.style.overflow = "hidden"; }
  function closeSidebar() { elements.sidebar?.classList.remove("is-open"); elements.overlay?.classList.remove("is-visible"); document.body.style.overflow = ""; }
  function showMessage(message, type) { elements.message.textContent = message; elements.message.className = `sd-global-message is-${type}`; }
  function clearMessage() { elements.message.textContent = ""; elements.message.className = "sd-global-message"; }
  function clean(value) { return String(value || "").trim(); }
  function toNumber(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
  function toOptionalNumber(value) { return clean(value) === "" ? null : toNumber(value); }
  function toInteger(value) { return Math.trunc(toNumber(value)); }
  function toDateInput(date) { return date.toISOString().slice(0, 10); }
  function fallback(value, backup) { return value == null || String(value).trim() === "" ? backup : String(value); }
  function initial(value) { return String(value || "S").trim().charAt(0).toUpperCase(); }
  function formatLabel(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  function setText(element, value) { if (element) element.textContent = value; }
})();
