/**
 * gallery.html 页面逻辑：读取 storage 中的图片列表，网格展示、勾选、批量下载 PNG
 */

(function () {
  "use strict";

  /** @type {{ url: string, width: number, height: number }[]} */
  let images = [];
  /** @type {Set<number>} */
  const selected = new Set();

  const els = {
    grid: document.getElementById("grid"),
    empty: document.getElementById("emptyState"),
    pageMeta: document.getElementById("pageMeta"),
    selectAll: document.getElementById("selectAll"),
    btnInvert: document.getElementById("btnInvert"),
    selectedCount: document.getElementById("selectedCount"),
    btnDownload: document.getElementById("btnDownload"),
    overlay: document.getElementById("progressOverlay"),
    progressTitle: document.getElementById("progressTitle"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
  };

  function updateToolbar() {
    const total = images.length;
    const count = selected.size;
    els.selectedCount.textContent = `已选 ${count} / ${total}`;
    els.btnDownload.disabled = count === 0;
    els.selectAll.checked = total > 0 && count === total;
    els.selectAll.indeterminate = count > 0 && count < total;
  }

  function toggleSelect(index, checked) {
    if (checked) selected.add(index);
    else selected.delete(index);
    const card = els.grid.querySelector(`[data-index="${index}"]`);
    if (card) card.classList.toggle("is-selected", checked);
    const cb = card && card.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = checked;
    updateToolbar();
  }

  function render() {
    els.grid.innerHTML = "";
    selected.clear();

    if (!images.length) {
      els.empty.classList.remove("hidden");
      updateToolbar();
      return;
    }

    els.empty.classList.add("hidden");

    const frag = document.createDocumentFragment();
    images.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "card is-selected";
      card.dataset.index = String(index);

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "card-check";
      checkbox.checked = true;
      checkbox.title = "勾选下载";
      checkbox.addEventListener("click", (e) => e.stopPropagation());
      checkbox.addEventListener("change", () => {
        toggleSelect(index, checkbox.checked);
      });

      const thumb = document.createElement("div");
      thumb.className = "thumb-wrap";
      thumb.title = "点击切换选中";
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `商品图 ${index + 1}`;
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        img.alt = "加载失败";
        img.style.opacity = "0.35";
      });
      thumb.appendChild(img);
      thumb.addEventListener("click", () => {
        toggleSelect(index, !selected.has(index));
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `<span class="size">${item.width} × ${item.height}</span>`;

      card.appendChild(checkbox);
      card.appendChild(thumb);
      card.appendChild(meta);
      frag.appendChild(card);

      selected.add(index);
    });

    els.grid.appendChild(frag);
    updateToolbar();
  }

  function showProgress(current, total, title) {
    els.overlay.classList.remove("hidden");
    els.progressTitle.textContent = title || "正在下载…";
    const pct = total ? Math.round((current / total) * 100) : 0;
    els.progressFill.style.width = pct + "%";
    els.progressText.textContent = `${current} / ${total}`;
  }

  function hideProgress() {
    els.overlay.classList.add("hidden");
    els.progressFill.style.width = "0%";
  }

  async function loadData() {
    const res = await chrome.runtime.sendMessage({ type: "GET_GALLERY_DATA" });
    if (!res || !res.ok || !res.payload || !Array.isArray(res.payload.images)) {
      els.pageMeta.textContent = "未找到图片数据";
      images = [];
      render();
      return;
    }

    images = res.payload.images;
    const title = res.payload.pageTitle || "商品页";
    document.title = `商品图片库（${images.length}）`;
    els.pageMeta.textContent = `${title} · 共 ${images.length} 张`;
    els.pageMeta.title = res.payload.pageUrl || "";
    render();
  }

  // —— 事件绑定 ——
  els.selectAll.addEventListener("change", () => {
    const on = els.selectAll.checked;
    images.forEach((_, index) => toggleSelect(index, on));
  });

  els.btnInvert.addEventListener("click", () => {
    images.forEach((_, index) => toggleSelect(index, !selected.has(index)));
  });

  els.btnDownload.addEventListener("click", async () => {
    const indexes = [...selected].sort((a, b) => a - b);
    if (!indexes.length) return;

    const urls = indexes.map((i) => images[i].url);
    const total = urls.length;

    els.btnDownload.disabled = true;
    showProgress(0, total, "正在转换为 PNG 并下载…");

    // 监听后台进度（同扩展页可收到）
    const onProgress = (msg) => {
      if (!msg || msg.type !== "DOWNLOAD_PROGRESS") return;
      showProgress(
        msg.current,
        msg.total,
        msg.ok ? `正在下载：${msg.filename || ""}` : "有文件失败，继续处理…"
      );
    };
    chrome.runtime.onMessage.addListener(onProgress);

    try {
      const res = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_IMAGES",
        urls,
        startIndex: 1,
      });

      showProgress(total, total, "下载完成");
      await new Promise((r) => setTimeout(r, 500));
      hideProgress();

      if (!res) {
        alert("下载无响应，请重试。");
        return;
      }

      const tip =
        res.failed > 0
          ? `完成：成功 ${res.success} 张，失败 ${res.failed} 张。\n文件已保存为「商品图_XXX.png」到浏览器默认下载目录。`
          : `全部完成！共下载 ${res.success} 张 PNG。\n文件名：商品图_001.png …\n位置：浏览器默认下载目录。`;
      alert(tip);
    } catch (err) {
      hideProgress();
      alert("下载失败：" + (err.message || String(err)));
    } finally {
      chrome.runtime.onMessage.removeListener(onProgress);
      updateToolbar();
    }
  });

  loadData().catch((err) => {
    console.error(err);
    els.pageMeta.textContent = "加载失败";
    alert("加载图库失败：" + (err.message || String(err)));
  });
})();
