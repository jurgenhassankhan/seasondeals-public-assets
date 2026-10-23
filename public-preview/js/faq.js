(() => {
  "use strict";

  const search = document.getElementById("faq-search");
  const items = [...document.querySelectorAll(".faq-item")];
  const groups = [...document.querySelectorAll(".faq-group")];
  const empty = document.getElementById("faq-empty");

  if (!search) return;
  search.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase("nl");
    let visible = 0;
    items.forEach((item) => {
      const match = !query || item.textContent.toLocaleLowerCase("nl").includes(query);
      item.hidden = !match;
      item.open = Boolean(query && match);
      if (match) visible += 1;
    });
    groups.forEach((group) => {
      group.hidden = ![...group.querySelectorAll(".faq-item")].some((item) => !item.hidden);
    });
    empty?.classList.toggle("is-visible", visible === 0);
  });
})();
