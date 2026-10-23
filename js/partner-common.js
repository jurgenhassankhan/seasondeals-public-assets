(() => {
  "use strict";
  const routes = { "/partner/bookings": "bookings.html", "/partner/vouchers": "vouchers.html", "/partner/settings": "settings.html" };
  document.querySelectorAll("a[href]").forEach((link) => {
    const route = routes[link.getAttribute("href")];
    if (route) link.setAttribute("href", route);
  });
  document.querySelectorAll(".sd-navigation").forEach((nav) => {
    if (nav.querySelector('a[href="integrations.html"]')) return;
    const accountLabel = nav.querySelector(".sd-nav-label-secondary");
    if (!accountLabel) return;
    const link = document.createElement("a");
    link.href = "integrations.html";
    link.className = "sd-nav-item";
    link.innerHTML = '<span aria-hidden="true">⇄</span><span>Integraties</span>';
    nav.insertBefore(link, accountLabel);
  });
  document.querySelectorAll('.sd-icon-button[aria-label="Notifications"]').forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById("sd-notifications-panel");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else location.href = "index.html#sd-notifications-panel";
    });
  });
  if (location.hash === "#sd-notifications-panel") {
    setTimeout(() => document.getElementById("sd-notifications-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  }
})();
