/**
 * Service Worker（Manifest V3）
 * - 接收 Content Script 的图片列表，写入 storage 并打开 gallery
 * - 跨域拉取图片 → createImageBitmap → OffscreenCanvas 转 PNG → chrome.downloads 下载
 */

const STORAGE_KEY = "galleryPayload";

/** Blob → data URL（Service Worker 中下载 PNG 用） */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("FileReader 失败"));
    reader.readAsDataURL(blob);
  });
}

/**
 * 拉取远程图片并转为 PNG data URL
 * 跨域图片依赖 host_permissions；失败时抛出错误供上层重试/提示
 */
async function convertUrlToPngDataUrl(imageUrl) {
  const response = await fetch(imageUrl, {
    method: "GET",
    credentials: "omit",
    cache: "no-cache",
    // 部分 CDN 对 Referer 敏感，省略由浏览器默认处理
  });

  if (!response.ok) {
    throw new Error(`拉取失败 HTTP ${response.status}`);
  }

  const blob = await response.blob();
  // 已是 PNG 也可统一走 canvas，保证输出一致
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 2D 上下文");
    // 白底：避免透明 JPG 转 PNG 时出现脏边（可选）
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    return blobToDataUrl(pngBlob);
  } finally {
    bitmap.close();
  }
}

/** 序号补零：1 → 001 */
function padIndex(n, width = 3) {
  return String(n).padStart(width, "0");
}

/**
 * 下载单张：转 PNG 后用 chrome.downloads 存到浏览器默认下载目录
 * 文件名：商品图_001.png
 */
async function downloadOneAsPng(imageUrl, index) {
  const dataUrl = await convertUrlToPngDataUrl(imageUrl);
  const filename = `商品图_${padIndex(index)}.png`;

  const downloadId = await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false, // 直接进入默认下载目录，不弹另存为
    conflictAction: "uniquify",
  });

  return { downloadId, filename };
}

/** 打开图库页：先把数据写入 storage，再开新标签 */
async function openGallery(payload) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      images: payload.images || [],
      pageTitle: payload.pageTitle || "",
      pageUrl: payload.pageUrl || "",
      savedAt: Date.now(),
    },
  });

  const url = chrome.runtime.getURL("gallery.html");
  await chrome.tabs.create({ url });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || !message.type) {
    sendResponse({ ok: false, error: "无效消息" });
    return false;
  }

  // 异步响应必须 return true
  (async () => {
    try {
      switch (message.type) {
        case "OPEN_GALLERY": {
          const result = await openGallery(message);
          sendResponse(result);
          break;
        }

        case "GET_GALLERY_DATA": {
          const data = await chrome.storage.local.get(STORAGE_KEY);
          sendResponse({ ok: true, payload: data[STORAGE_KEY] || null });
          break;
        }

        case "DOWNLOAD_IMAGES": {
          const urls = Array.isArray(message.urls) ? message.urls : [];
          const startIndex = Number(message.startIndex) || 1;
          const results = [];
          let success = 0;
          let failed = 0;

          for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const seq = startIndex + i;
            try {
              const info = await downloadOneAsPng(url, seq);
              results.push({ ok: true, url, ...info, index: seq });
              success++;
              // 进度回传给 gallery（可选监听）
              chrome.runtime
                .sendMessage({
                  type: "DOWNLOAD_PROGRESS",
                  current: i + 1,
                  total: urls.length,
                  filename: info.filename,
                  ok: true,
                })
                .catch(() => {
                  /* gallery 未监听时忽略 */
                });
            } catch (err) {
              failed++;
              results.push({
                ok: false,
                url,
                index: seq,
                error: err.message || String(err),
              });
              chrome.runtime
                .sendMessage({
                  type: "DOWNLOAD_PROGRESS",
                  current: i + 1,
                  total: urls.length,
                  ok: false,
                  error: err.message || String(err),
                })
                .catch(() => {});
            }
          }

          sendResponse({
            ok: failed === 0,
            success,
            failed,
            total: urls.length,
            results,
          });
          break;
        }

        default:
          sendResponse({ ok: false, error: "未知消息类型: " + message.type });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || String(err) });
    }
  })();

  return true;
});
