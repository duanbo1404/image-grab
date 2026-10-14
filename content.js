/**
 * Content Script：仅在商品详情页注入悬浮按钮，并提取商品相关图片。
 * 支持淘宝 / 天猫 / 京东 / 拼多多（含商家相关详情页）。
 */

(function () {
  "use strict";

  const BUTTON_ID = "ecom-img-grab-btn";
  const MIN_SIZE = 100;

  /** 判断当前页面是否为支持的商品详情页 */
  function isProductDetailPage() {
    const host = location.hostname.toLowerCase();
    const path = location.pathname.toLowerCase();
    const search = location.search.toLowerCase();
    const href = location.href.toLowerCase();

    // 淘宝 / 天猫
    if (host.includes("taobao.com") || host.includes("tmall.com")) {
      return (
        path.includes("item.htm") ||
        path.includes("/item/") ||
        path.includes("detail") ||
        /[?&]id=\d+/.test(search) ||
        host.startsWith("detail.") ||
        host.startsWith("item.")
      );
    }

    // 京东
    if (host.includes("jd.com")) {
      return (
        host.startsWith("item.") ||
        path.includes("/item/") ||
        /\/\d+\.html/.test(path) ||
        path.includes("product") ||
        href.includes("sku=")
      );
    }

    // 拼多多 / 多多进宝买家端 & 商家相关详情
    if (host.includes("pinduoduo.com") || host.includes("yangkeduo.com")) {
      return (
        path.includes("goods") ||
        path.includes("product") ||
        path.includes("detail") ||
        /[?&]goods_id=/.test(search) ||
        /[?&]goodsId=/.test(search) ||
        href.includes("goods_id=")
      );
    }

    return false;
  }

  /** 将相对路径补全为绝对 URL */
  function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return null;
    let u = url.trim().replace(/^["']|["']$/g, "");
    if (!u || u.startsWith("data:") || u.startsWith("blob:")) return null;
    // 协议相对 URL
    if (u.startsWith("//")) u = location.protocol + u;
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  }

  /** 从 srcset 中取分辨率最高的候选 */
  function pickFromSrcset(srcset) {
    if (!srcset) return null;
    let best = null;
    let bestScore = -1;
    srcset.split(",").forEach((part) => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return;
      let score = 1;
      if (bits[1]) {
        const m = bits[1].match(/^([\d.]+)(w|x)$/i);
        if (m) score = parseFloat(m[1]) * (m[2].toLowerCase() === "x" ? 1000 : 1);
      }
      if (score > bestScore) {
        bestScore = score;
        best = bits[0];
      }
    });
    return best;
  }

  /** 解析 CSS background-image 中的 url(...) */
  function extractBgUrls(bgValue) {
    if (!bgValue || bgValue === "none") return [];
    const urls = [];
    const re = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
    let match;
    while ((match = re.exec(bgValue)) !== null) {
      if (match[2]) urls.push(match[2]);
    }
    return urls;
  }

  /** 淘宝等 CDN 常见缩略图参数，尽量提升为原图尺寸 */
  function upgradeImageUrl(url) {
    if (!url) return url;
    let u = url;
    // 淘宝/天猫：去掉 _60x60q90 等尺寸后缀
    u = u.replace(/_\d+x\d+(q\d+)?(\.\w+)(\?|$)/i, "$2$3");
    u = u.replace(/\.(jpg|jpeg|png|webp)_\d+x\d+[^.?]*/i, ".$1");
    // 京东：s\d+x\d+_ -> 更大尺寸
    u = u.replace(/\/s\d+x\d+_/i, "/s800x800_");
    // 拼多多：常见缩略参数
    u = u.replace(/[?&]imageView2\/\d+\/w\/\d+\/h\/\d+/gi, "");
    return u;
  }

  /** 粗过滤：图标、logo、占位、追踪像素等 */
  function isLikelyUseless(url) {
    const lower = url.toLowerCase();
    const deny = [
      "logo",
      "icon",
      "favicon",
      "sprite",
      "avatar",
      "qrcode",
      "qr_code",
      "loading",
      "placeholder",
      "blank.",
      "spacer",
      "1x1",
      "pixel.gif",
      "transparent",
      "default_img",
      "no_pic",
      "nopic",
      "emotion",
      "emoji",
      "badge",
      "btn_",
      "button",
      ".svg",
    ];
    return deny.some((k) => lower.includes(k));
  }

  /**
   * 探测图片真实尺寸（加载后读取 naturalWidth/Height）
   * 超时或失败则返回 null
   */
  function probeImageSize(url, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);
      img.onload = () =>
        finish({
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
        });
      img.onerror = () => finish(null);
      img.src = url;
    });
  }

  /** 从页面 DOM 收集候选图片 URL */
  function collectCandidateUrls() {
    const set = new Set();

    const add = (raw) => {
      const abs = toAbsoluteUrl(raw);
      if (!abs) return;
      if (!/^https?:\/\//i.test(abs)) return;
      if (isLikelyUseless(abs)) return;
      set.add(upgradeImageUrl(abs));
    };

    // 1. <img>：src / data-* / srcset
    document.querySelectorAll("img").forEach((img) => {
      [
        img.currentSrc,
        img.src,
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-original"),
        img.getAttribute("data-lazy"),
        img.getAttribute("data-img"),
        img.getAttribute("data-url"),
        img.getAttribute("data-ks-lazyload"),
      ].forEach(add);

      const srcset =
        img.getAttribute("srcset") ||
        img.getAttribute("data-srcset") ||
        img.getAttribute("data-lazy-srcset");
      add(pickFromSrcset(srcset));
    });

    // 2. <source srcset>
    document.querySelectorAll("source[srcset], source[data-srcset]").forEach((el) => {
      add(pickFromSrcset(el.getAttribute("srcset") || el.getAttribute("data-srcset")));
    });

    // 3. 背景图：优先 data-* / 内联 style，避免全 DOM getComputedStyle 卡顿
    document
      .querySelectorAll(
        "[data-background], [data-bg], [data-lazy-bg], [data-background-image], [style*='background']"
      )
      .forEach((el) => {
        [
          "data-background",
          "data-bg",
          "data-lazy-bg",
          "data-background-image",
        ].forEach((attr) => {
          const v = el.getAttribute(attr);
          if (!v) return;
          if (/url\(/i.test(v)) extractBgUrls(v).forEach(add);
          else add(v);
        });
        const inlineBg = el.style && el.style.backgroundImage;
        extractBgUrls(inlineBg).forEach(add);
      });

    // 主图区域等常见容器再读计算样式（范围可控）
    document
      .querySelectorAll(
        ".main-img, .main-image, .spec-img, .preview-img, [class*='gallery'], [class*='sku'], [class*='detail']"
      )
      .forEach((el) => {
        try {
          extractBgUrls(getComputedStyle(el).backgroundImage).forEach(add);
        } catch {
          /* ignore */
        }
      });

    // 4. 部分电商会把主图放在 meta / JSON-LD
    document
      .querySelectorAll('meta[property="og:image"], meta[name="og:image"]')
      .forEach((m) => add(m.getAttribute("content")));

    return [...set];
  }

  /** 过滤尺寸，返回可用于展示的列表 */
  async function extractProductImages() {
    const candidates = collectCandidateUrls();
    const results = [];
    const seen = new Set();

    // 控制并发，避免一次性打爆页面
    const concurrency = 8;
    let index = 0;

    async function worker() {
      while (index < candidates.length) {
        const i = index++;
        const url = candidates[i];
        if (seen.has(url)) continue;
        seen.add(url);

        const size = await probeImageSize(url);
        if (!size) continue;
        // 过滤 1x1、过小图
        if (size.width < MIN_SIZE || size.height < MIN_SIZE) continue;
        if (size.width <= 1 || size.height <= 1) continue;

        results.push({
          url,
          width: size.width,
          height: size.height,
        });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, candidates.length) }, () =>
        worker()
      )
    );

    // 按面积从大到小排序，商品主图通常靠前
    results.sort((a, b) => b.width * b.height - a.width * a.height);
    return results;
  }

  /** 创建并挂载悬浮按钮 */
  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.textContent = "获取图片";
    btn.title = "提取本页商品图片并在新标签页展示";

    btn.addEventListener("click", async () => {
      if (btn.classList.contains("is-loading")) return;
      btn.classList.add("is-loading");
      btn.textContent = "提取中";

      try {
        const images = await extractProductImages();
        if (!images.length) {
          alert("未找到符合条件的商品图片（已过滤小于 100×100 的图）。");
          return;
        }

        // 交给扩展后台：写入 storage 并打开 gallery
        const response = await chrome.runtime.sendMessage({
          type: "OPEN_GALLERY",
          images,
          pageTitle: document.title || "商品图片",
          pageUrl: location.href,
        });

        if (!response || !response.ok) {
          throw new Error(response?.error || "打开图库失败");
        }
      } catch (err) {
        console.error("[电商图片提取]", err);
        alert("提取失败：" + (err.message || String(err)));
      } finally {
        btn.classList.remove("is-loading");
        btn.textContent = "获取图片";
      }
    });

    document.documentElement.appendChild(btn);
  }

  function init() {
    if (!isProductDetailPage()) return;
    injectButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // SPA 路由变化时再检测一次（部分电商详情为前端路由）
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      const existing = document.getElementById(BUTTON_ID);
      if (isProductDetailPage()) {
        if (!existing) injectButton();
      } else if (existing) {
        existing.remove();
      }
    }
  }, 1500);
})();
