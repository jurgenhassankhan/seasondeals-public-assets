(() => {
  "use strict";
  const core = window.AdminCore;
  const form = document.getElementById("admin-login-form");
  const message = document.getElementById("login-message");
  const submit = document.getElementById("login-submit");
  const password = document.getElementById("password");

  if (sessionStorage.getItem(core.config.tokenKey)) core.redirectToDashboard();

  document.getElementById("toggle-password")?.addEventListener("click", (event) => {
    const hidden = password.type === "password";
    password.type = hidden ? "text" : "password";
    event.currentTarget.textContent = hidden ? "Verberg" : "Toon";
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.className = "login-message";
    const email = form.elements.email.value.trim();
    const passwordValue = password.value;
    if (!email || !passwordValue) return show("Vul je e-mailadres en wachtwoord in.");
    setBusy(true);
    try {
      const data = await core.request("/auth/login", { method: "POST", body: JSON.stringify({ email, password: passwordValue }) });
      const token = data?.auth_token || data?.authToken || data?.token;
      if (!token) throw new Error("Er is geen toegangstoken ontvangen.");
      sessionStorage.setItem(core.config.tokenKey, token);
      sessionStorage.setItem(core.config.userKey, JSON.stringify(data?.admin || {}));
      core.redirectToDashboard();
    } catch (error) {
      show(error.status === 403 ? "Dit beheerdersaccount is gedeactiveerd of heeft geen toegang." : error.message);
    } finally { setBusy(false); }
  });

  function show(text) { message.textContent = text; message.className = "login-message is-visible"; }
  function setBusy(busy) { submit.disabled = busy; submit.textContent = busy ? "Beveiligd inloggen..." : "Inloggen"; }
})();
