(() => {
  "use strict";

  const CONFIG = {
    endpoint: "https://xgrq-dkge-tace.n7e.xano.io/api:seasondeals-partner/deals",
    xanoOrigin: "https://xgrq-dkge-tace.n7e.xano.io",
    loginUrl: "/seasondeals-public-assets/login.html",
    tokenKey: "sd_partner_token",
    userKey: "sd_partner_user"
  };

  const form = document.getElementById("sd-deal-form");
  const message = document.getElementById("sd-global-message");
  const preview = document.getElementById("sd-image-preview");
  const uploadField = document.getElementById("sd-upload-field");
  const imageInput = document.getElementById("sd-image-file");
  const removeImage = document.getElementById("sd-remove-image");
  const submit = document.getElementById("sd-submit-deal");
  const submitApproval = document.getElementById("sd-submit-approval");
  const actionTitle = document.getElementById("sd-action-title");
  const actionDescription = document.getElementById("sd-action-description");
  const titleHeading = document.getElementById("sd-detail-title");
  const dealId = Number(new URLSearchParams(location.search).get("id"));
  let currentDeal = null;
  let editing = false;
  let previewUrl = "";

  init();

  async function init() {
    if (!sessionStorage.getItem(CONFIG.tokenKey)) return redirectToLogin();
    renderUser(readStoredUser());
    bindShell();
    bindForm();
    setEditing(false);

    if (!Number.isInteger(dealId) || dealId < 1) {
      showMessage("Geen geldige deal geselecteerd.", "error");
      submit.disabled = true;
      return;
    }

    await loadDeal();
  }

  async function loadDeal() {
    setBusy(true, "Deal laden...");
    try {
      const data = await request(CONFIG.endpoint, { method: "GET" });
      currentDeal = resolveDeals(data).find((item) => Number(item.id) === dealId);
      if (!currentDeal) throw new Error("Deze deal is niet gevonden binnen je hotelaccount.");
      populate(currentDeal);
      setEditing(false);
      showMessage(`Deal #${dealId} is geladen.`, "info");
    } catch (error) {
      showMessage(error.message || "De deal kon niet worden geladen.", "error");
      submit.disabled = true;
    } finally {
      setBusy(false);
    }
  }

  function bindForm() {
    submit?.addEventListener("click", (event) => {
      if (editing || !currentDeal) return;
      event.preventDefault();
      if (currentDeal.status !== "draft") {
        showMessage("Alleen conceptdeals kunnen worden bewerkt.", "error");
        return;
      }
      setEditing(true);
      showMessage("Bewerk de gegevens en klik daarna op Wijzigingen opslaan.", "info");
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!currentDeal) return;
      if (!editing) {
        if (currentDeal.status !== "draft") {
          showMessage("Alleen conceptdeals kunnen worden bewerkt.", "error");
          return;
        }
        setEditing(true);
        showMessage("Bewerk de gegevens en klik daarna op Wijzigingen opslaan.", "info");
        return;
      }
      await saveDeal();
    });

    submitApproval?.addEventListener("click", submitForApproval);

    imageInput?.addEventListener("change", showSelectedImage);
    removeImage?.addEventListener("click", () => {
      imageInput.value = "";
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
      showCurrentImage();
    });
  }

  async function submitForApproval() {
    if (!currentDeal || currentDeal.status !== "draft" || editing) return;
    const confirmed = window.confirm(
      "Weet je zeker dat je deze deal wilt indienen? Na het indienen kun je de deal niet meer bewerken totdat SeasonDeals hem heeft beoordeeld."
    );
    if (!confirmed) return;

    setApprovalBusy(true);
    try {
      const data = await request(`${CONFIG.endpoint}/${encodeURIComponent(dealId)}/submit`, {
        method: "POST"
      });
      const returnedDeal = data?.deal || data?.data?.deal || data?.data;
      currentDeal = {
        ...currentDeal,
        ...(returnedDeal && typeof returnedDeal === "object" ? returnedDeal : {}),
        status: returnedDeal?.status || "pending_approval"
      };
      populate(currentDeal);
      setEditing(false);
      sessionStorage.setItem("sd_deal_flash", `Deal #${dealId} is ter goedkeuring ingediend.`);
      showMessage(data?.message || `Deal #${dealId} is ter goedkeuring ingediend.`, "info");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showMessage(error.message || "De deal kon niet ter goedkeuring worden ingediend.", "error");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setApprovalBusy(false);
    }
  }

  async function saveDeal() {
    const payload = new FormData(form);
    const file = payload.get("image_file");
    if (file instanceof File && file.size > 0) {
      try {
        const normalized = await normalizeImage(file);
        payload.set("image_file", normalized, normalized.name);
      } catch {
        showMessage("De gekozen afbeelding kon niet worden voorbereid.", "error");
        return;
      }
    } else {
      payload.delete("image_file");
    }

    ["includes_breakfast", "includes_wifi", "includes_parking", "includes_late_checkout", "includes_welcome_drink"]
      .forEach((name) => payload.set(name, form.elements[name]?.checked ? "true" : "false"));
    if (clean(payload.get("original_price")) === "") payload.delete("original_price");

    const error = validate(payload);
    if (error) return showMessage(error, "error");

    setBusy(true, "Wijzigingen opslaan...");
    try {
      const data = await request(`${CONFIG.endpoint}/${encodeURIComponent(dealId)}`, {
        method: "PATCH",
        body: payload
      });
      const updated = data?.deal || data?.data?.deal || data?.data;
      if (!updated?.id) throw new Error("Xano gaf geen bijgewerkte deal terug.");
      currentDeal = updated;
      populate(currentDeal);
      setEditing(false);
      sessionStorage.setItem("sd_deal_flash", `Conceptdeal #${dealId} is succesvol bijgewerkt.`);
      showMessage(`Conceptdeal #${dealId} is succesvol bijgewerkt.`, "info");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      showMessage(error.message || "De wijzigingen konden niet worden opgeslagen.", "error");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  function validate(data) {
    const required = [
      ["title", "Titel"], ["short_description", "Korte beschrijving"],
      ["long_description", "Lange beschrijving"], ["cancellation_policy", "Annuleringsbeleid"]
    ];
    for (const [name, label] of required) if (!clean(data.get(name))) return `${label} is verplicht.`;
    const price = Number(data.get("price"));
    const original = data.has("original_price") ? Number(data.get("original_price")) : null;
    if (!(price > 0)) return "De dealprijs moet groter zijn dan 0.";
    if (original !== null && original <= price) return "De oorspronkelijke prijs moet hoger zijn dan de dealprijs.";
    if (!(Number(data.get("inventory")) > 0)) return "Voorraad moet groter zijn dan 0.";
    if (!(Number(data.get("minimum_nights")) >= 1)) return "Minimaal aantal nachten moet minimaal 1 zijn.";
    if (!(Number(data.get("max_guests")) >= 1)) return "Maximaal aantal gasten moet minimaal 1 zijn.";
    if (clean(data.get("valid_until")) < clean(data.get("valid_from"))) return "De einddatum mag niet vóór de begindatum liggen.";
    return "";
  }

  function populate(deal) {
    setValue("title", deal.title);
    setValue("short_description", deal.short_description);
    setValue("long_description", deal.long_description);
    setValue("price", deal.price);
    setValue("original_price", deal.original_price);
    setValue("inventory", deal.inventory);
    setValue("minimum_nights", deal.minimum_nights);
    setValue("max_guests", deal.max_guests);
    setValue("valid_from", toDate(deal.travel_period_start));
    setValue("valid_until", toDate(deal.travel_period_end));
    setValue("cancellation_policy", deal.cancellation_policy);
    setChecked("includes_breakfast", deal.includes_breakfast);
    setChecked("includes_wifi", deal.includes_wifi);
    setChecked("includes_parking", deal.includes_parking);
    setChecked("includes_late_checkout", deal.includes_late_checkout);
    setChecked("includes_welcome_drink", deal.includes_welcome_drink);
    imageInput.value = "";
    showCurrentImage();
    if (titleHeading) titleHeading.textContent = deal.title || `Deal #${dealId}`;
    let environmentBadge = document.getElementById("sd-detail-environment");
    if (!environmentBadge && titleHeading) {
      environmentBadge = document.createElement("span");
      environmentBadge.id = "sd-detail-environment";
      titleHeading.insertAdjacentElement("afterend", environmentBadge);
    }
    if (environmentBadge) {
      const environment = String(deal.integration_environment || "").toLowerCase();
      environmentBadge.className = `sd-environment-badge sd-environment-${environment || "manual"}`;
      environmentBadge.textContent = environment === "production" ? "PRODUCTIE" : environment === "test" ? "TEST" : "HANDMATIG";
    }
  }

  function setEditing(enabled) {
    editing = enabled;
    Array.from(form?.elements || []).forEach((field) => {
      if (field === submit || field.type === "button") return;
      field.disabled = !enabled;
    });
    uploadField?.classList.toggle("is-hidden", !enabled);
    if (removeImage) removeImage.hidden = !enabled;
    if (submit && currentDeal && currentDeal.status !== "draft") {
      submit.type = "button";
      submit.disabled = true;
      submit.textContent = formatLabel(currentDeal.status);
    } else if (submit) {
      submit.type = enabled ? "submit" : "button";
      submit.disabled = !currentDeal;
      submit.textContent = enabled ? "Wijzigingen opslaan" : "Bewerken";
    }
    updateApprovalAction();
  }

  function updateApprovalAction() {
    if (!submitApproval) return;
    const status = currentDeal?.status;
    const isDraft = status === "draft";
    submitApproval.disabled = !currentDeal || !isDraft || editing;
    submitApproval.textContent = status === "pending_approval"
      ? "Ingediend ter goedkeuring"
      : "Indienen ter goedkeuring";
    if (actionTitle) actionTitle.textContent = status === "pending_approval" ? "Deal wordt beoordeeld" : "Dealgegevens";
    if (actionDescription) {
      actionDescription.textContent = status === "pending_approval"
        ? "SeasonDeals beoordeelt deze deal. Bewerken is tijdelijk uitgeschakeld."
        : editing
          ? "Sla je wijzigingen op voordat je de deal indient."
          : "Controleer de gegevens voordat je de deal indient.";
    }
  }

  function setApprovalBusy(busy) {
    if (!submitApproval) return;
    submitApproval.disabled = busy;
    submitApproval.textContent = busy ? "Deal indienen..." : "Indienen ter goedkeuring";
    if (submit) submit.disabled = busy;
    if (!busy) setEditing(editing);
  }

  function showCurrentImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    const image = currentDeal?.images?.[0]?.url || currentDeal?.images?.[0]?.path;
    if (!image) {
      preview.style.backgroundImage = "";
      preview.classList.remove("has-image");
      return;
    }
    const url = image.startsWith("http") ? image : CONFIG.xanoOrigin + image;
    preview.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    preview.classList.add("has-image");
  }

  function showSelectedImage() {
    const file = imageInput.files?.[0];
    if (!file) return showCurrentImage();
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      imageInput.value = "";
      showMessage(file.size > 8 * 1024 * 1024 ? "De afbeelding mag maximaal 8 MB groot zijn." : "Gebruik een JPG-, PNG- of WebP-afbeelding.", "error");
      return showCurrentImage();
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.style.backgroundImage = `url("${previewUrl}")`;
    preview.classList.add("has-image");
  }

  async function normalizeImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((value) => value ? resolve(value) : reject(), "image/jpeg", .88)
    );
    return new File([blob], `deal-${dealId}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  }

  async function request(url, options) {
    const token = sessionStorage.getItem(CONFIG.tokenKey);
    let response;
    try {
      response = await fetch(url, {
        ...options, mode: "cors", credentials: "omit",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
      });
    } catch {
      throw new Error("De dealservice is niet bereikbaar.");
    }
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text }; }
    if (response.status === 401 || response.status === 403) {
      clearSession(); setTimeout(redirectToLogin, 500);
      throw new Error("Je sessie is verlopen.");
    }
    if (!response.ok) throw new Error(data.message || data.error || data.detail || `Aanroep mislukt (${response.status}).`);
    return data;
  }

  function resolveDeals(data) {
    return [data, data?.items, data?.deals, data?.data, data?.data?.items, data?.result?.items].find(Array.isArray) || [];
  }
  function setBusy(busy, label) {
    if (!submit) return;
    submit.disabled = busy;
    if (busy && label) submit.textContent = label;
    else if (!busy) setEditing(editing);
  }
  function setValue(name, value) { const field = form?.elements?.[name]; if (field) field.value = value ?? ""; }
  function setChecked(name, value) { const field = form?.elements?.[name]; if (field) field.checked = Boolean(value); }
  function clean(value) { return String(value ?? "").trim(); }
  function toDate(value) {
    if (!value) return "";
    const number = Number(value);
    const date = Number.isFinite(number) ? new Date(number) : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }

  function bindShell() {
    const sidebar = document.getElementById("sd-sidebar");
    const overlay = document.getElementById("sd-mobile-overlay");
    document.getElementById("sd-menu-toggle")?.addEventListener("click", () => { sidebar?.classList.add("is-open"); overlay?.classList.add("is-visible"); });
    const close = () => { sidebar?.classList.remove("is-open"); overlay?.classList.remove("is-visible"); };
    document.getElementById("sd-sidebar-close")?.addEventListener("click", close);
    overlay?.addEventListener("click", close);
    const menu = document.getElementById("sd-user-dropdown");
    document.getElementById("sd-user-menu-button")?.addEventListener("click", (event) => { event.stopPropagation(); menu?.classList.toggle("is-open"); });
    document.addEventListener("click", () => menu?.classList.remove("is-open"));
    ["sd-sidebar-logout", "sd-dropdown-logout"].forEach((id) => document.getElementById(id)?.addEventListener("click", () => { clearSession(); redirectToLogin(); }));
  }

  function renderUser(user) {
    const name = user?.name || user?.full_name || "Partner";
    const role = formatLabel(user?.role || "hotel partner");
    const hotel = user?.hotel_name || user?.hotel?.name || "SeasonDeals hotel partner";
    setText("sd-user-name", name); setText("sd-user-role", role);
    setText("sd-dropdown-name", name); setText("sd-dropdown-email", user?.email || "");
    setText("sd-user-avatar", initial(name)); setText("sd-hotel-avatar", initial(hotel));
    setText("sd-sidebar-hotel", hotel); setText("sd-sidebar-role", role); setText("sd-topbar-hotel", hotel);
  }

  function showMessage(text, type) { message.textContent = text; message.className = `sd-global-message is-${type}`; }
  function readStoredUser() { try { return JSON.parse(sessionStorage.getItem(CONFIG.userKey) || "{}"); } catch { return {}; } }
  function clearSession() { sessionStorage.removeItem(CONFIG.tokenKey); sessionStorage.removeItem(CONFIG.userKey); }
  function redirectToLogin() { location.replace(CONFIG.loginUrl); }
  function formatLabel(value) { return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
  function initial(value) { return String(value || "S").trim().charAt(0).toUpperCase(); }
  function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
})();
