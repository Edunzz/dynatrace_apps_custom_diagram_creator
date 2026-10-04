// Custom Diagram Creator documentation site: theme toggle, mobile menu, copy buttons, heading anchors.
(function () {
  var root = document.documentElement;

  function storedTheme() {
    try {
      return localStorage.getItem("cdc-theme");
    } catch (e) {
      return null;
    }
  }

  function storeTheme(value) {
    try {
      localStorage.setItem("cdc-theme", value);
    } catch (e) {
      /* storage unavailable: the choice lasts for this page only */
    }
  }

  var initial = storedTheme();
  if (initial === "light" || initial === "dark") {
    root.setAttribute("data-theme", initial);
  }

  function currentTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit) {
      return explicit;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.querySelector("[data-theme-toggle]");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var next = currentTheme() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        storeTheme(next);
      });
    }

    var menu = document.querySelector("[data-menu-toggle]");
    if (menu) {
      menu.addEventListener("click", function () {
        var open = document.body.classList.toggle("nav-open");
        menu.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    document.querySelectorAll(".code").forEach(function (block) {
      var pre = block.querySelector("pre");
      if (!pre || !navigator.clipboard) {
        return;
      }
      var button = document.createElement("button");
      button.type = "button";
      button.className = "copy-btn";
      button.textContent = "Copy";
      button.addEventListener("click", function () {
        navigator.clipboard.writeText(pre.innerText).then(function () {
          button.textContent = "Copied";
          setTimeout(function () {
            button.textContent = "Copy";
          }, 1400);
        });
      });
      block.appendChild(button);
    });

    document.querySelectorAll(".prose h2[id], .prose h3[id]").forEach(function (heading) {
      var link = document.createElement("a");
      link.className = "anchor";
      link.href = "#" + heading.id;
      link.setAttribute("aria-label", "Link to this section");
      link.textContent = "#";
      heading.appendChild(link);
    });
  });
})();
