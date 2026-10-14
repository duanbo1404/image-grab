/**
 * 图提取 ImageGrab · 官网交互脚本
 * 纯原生 JS，无依赖。包含：
 *  1) 页脚年份
 *  2) 导航吸顶（毛玻璃）
 *  3) 移动端汉堡菜单
 *  4) 锚点平滑滚动（补偿吸顶导航高度）
 *  5) 滚动进入视口的淡入上移动画（IntersectionObserver）
 *  6) 当前区块导航高亮（滚动监听）
 *  7) 占位下载按钮的提示反馈
 */

(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var navToggle = document.getElementById("navToggle");
  var primaryNav = document.getElementById("primaryNav");
  var downloadBtn = document.getElementById("downloadBtn");
  var yearEl = document.getElementById("year");

  var MOBILE_MAX = 767; // 与 CSS 断点保持一致

  /* ---------------------------------------------------------------
     1. 页脚年份
     --------------------------------------------------------------- */
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* ---------------------------------------------------------------
     工具：读取吸顶导航的实际高度（用于滚动偏移计算）
     --------------------------------------------------------------- */
  function getHeaderHeight() {
    return header ? header.getBoundingClientRect().height : 64;
  }

  /* ---------------------------------------------------------------
     2 & 3. 导航状态：吸顶毛玻璃 / 汉堡菜单
     --------------------------------------------------------------- */
  function updateHeaderState() {
    if (!header) return;
    // 滚动超过 20px 即切换为白色毛玻璃样式
    if (window.scrollY > 20) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }

  function isMenuOpen() {
    return primaryNav && primaryNav.classList.contains("is-open");
  }

  function setMenu(open) {
    if (!navToggle || !primaryNav) return;
    primaryNav.classList.toggle("is-open", open);
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "收起导航菜单" : "展开导航菜单");
  }

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setMenu(!isMenuOpen());
    });
  }

  // 点击菜单外部时收起
  document.addEventListener("click", function (event) {
    if (!isMenuOpen()) return;
    if (header && header.contains(event.target)) return;
    setMenu(false);
  });

  // Esc 键收起并把焦点交还按钮
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isMenuOpen()) {
      setMenu(false);
      if (navToggle) navToggle.focus();
    }
  });

  // 从移动端切回桌面时，清掉展开状态避免样式残留
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      if (window.innerWidth > MOBILE_MAX && isMenuOpen()) {
        setMenu(false);
      }
      updateHeaderState();
      setActiveNav();
    }, 120);
  });

  /* ---------------------------------------------------------------
     4. 锚点平滑滚动：减去导航高度，避免标题被遮住
     --------------------------------------------------------------- */
  function smoothScrollTo(target) {
    var top =
      target.getBoundingClientRect().top +
      window.pageYOffset -
      getHeaderHeight() -
      12;

    var reduceMotion =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.scrollTo({
      top: top < 0 ? 0 : top,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (event) {
      var hash = link.getAttribute("href");
      if (!hash || hash === "#") return;

      var target = document.getElementById(hash.slice(1));
      if (!target) return;

      event.preventDefault();

      // 移动端点击后先收起菜单，再滚动
      if (isMenuOpen()) setMenu(false);

      smoothScrollTo(target);

      // 更新地址栏但不触发浏览器默认跳转
      if (history.replaceState) {
        history.replaceState(null, "", hash);
      }
    });
  });

  /* ---------------------------------------------------------------
     5. 滚动进入视口的淡入上移动画
     --------------------------------------------------------------- */
  var revealItems = Array.prototype.slice.call(
    document.querySelectorAll(".reveal")
  );

  if ("IntersectionObserver" in window && revealItems.length) {
    // 逐个元素读取 data-reveal-delay，形成同组卡片的错落节奏
    revealItems.forEach(function (el) {
      var delay = el.getAttribute("data-reveal-delay");
      if (delay) {
        el.style.setProperty("--reveal-delay", delay + "ms");
      }
    });

    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          // 只播一次，避免来回滚动反复动画
          revealObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    revealItems.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // 不支持时直接全部显示，保证内容可见
    revealItems.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------------------------------------------------------------
     6. 导航当前区块高亮
     --------------------------------------------------------------- */
  // 只统计内容区块，排除 Hero 与页脚
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-link[href^="#"]')
  );

  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute("href").slice(1);
      var section = document.getElementById(id);
      return section ? { link: link, section: section } : null;
    })
    .filter(Boolean);

  function setActiveNav() {
    if (!sections.length) return;

    // 判定线：导航下方约 1/3 视口处
    var line = window.scrollY + getHeaderHeight() + window.innerHeight * 0.28;
    var current = null;

    sections.forEach(function (item) {
      var top = item.section.offsetTop;
      var bottom = top + item.section.offsetHeight;
      if (line >= top && line < bottom) {
        current = item;
      }
    });

    // 滚到页面底部时，强制高亮最后一个区块
    var atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 4;
    if (atBottom) current = sections[sections.length - 1];

    sections.forEach(function (item) {
      var active = item === current;
      item.link.classList.toggle("is-active", active);
      if (active) {
        item.link.setAttribute("aria-current", "true");
      } else {
        item.link.removeAttribute("aria-current");
      }
    });
  }

  /* ---------------------------------------------------------------
     7. 占位下载按钮：给出明确提示，而不是跳转到空链接
     --------------------------------------------------------------- */
  var toastTimer = null;

  function showToast(message) {
    var toast = document.getElementById("siteToast");

    if (!toast) {
      toast = document.createElement("div");
      toast.id = "siteToast";
      toast.setAttribute("role", "status");
      // 内联样式：该提示是脚本产物，避免污染主样式表
      toast.style.cssText = [
        "position:fixed",
        "left:50%",
        "bottom:32px",
        "transform:translate(-50%,16px)",
        "z-index:300",
        "max-width:min(420px,calc(100vw - 40px))",
        "padding:13px 20px",
        "border-radius:999px",
        "background:rgba(12,18,40,.94)",
        "color:rgba(236,240,255,.94)",
        "font-size:13.5px",
        "text-align:center",
        "box-shadow:0 12px 32px rgba(4,8,24,.35)",
        "opacity:0",
        "transition:opacity .24s ease,transform .24s ease",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(toast);
    }

    toast.textContent = message;

    requestAnimationFrame(function () {
      toast.style.opacity = "1";
      toast.style.transform = "translate(-50%,0)";
    });

    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%,16px)";
    }, 2600);
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", function (event) {
      var href = downloadBtn.getAttribute("href");
      // href 仍为占位符时，拦截点击并提示
      if (!href || href === "#") {
        event.preventDefault();
        showToast("演示站点：请把按钮链接替换为插件压缩包的实际下载地址");
      }
    });
  }

  /* ---------------------------------------------------------------
     滚动监听：用 rAF 节流，避免高频触发造成卡顿
     --------------------------------------------------------------- */
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      updateHeaderState();
      setActiveNav();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  /* 初始化 */
  updateHeaderState();
  setActiveNav();
})();
