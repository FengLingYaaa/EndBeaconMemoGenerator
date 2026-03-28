const IMAGE_NAMES = [
  "上面",
  "下面",
  "仔细看",
  "作战设备",
  "做的好",
  "前面",
  "危险",
  "喜欢",
  "喷洒",
  "好东西",
  "干杯",
  "开心",
  "悬崖",
  "投掷",
  "攻击",
  "敌人",
  "机器人",
  "水",
  "滑索架",
  "爆炸物",
  "美景",
  "跳",
  "道路",
  "野兽",
  "需要",
];

const CARD_SIZE = 330;
const CAPTION_HORIZONTAL_PADDING = 28;
const CAPTION_VERTICAL_PADDING = 26;
const CAPTION_TOP_GAP = 36;
const CAPTION_MIN_HEIGHT = 96;
const CAPTION_OFFSET_STEP = 8;
const CAPTION_OFFSET_MIN = -80;
const CAPTION_OFFSET_MAX = 80;

const state = {
  style: "YELLOW",
  selectedNames: [],
  background: "transparent",
  showCaption: true,
  captionColor: "yellow",
  captionText: "",
  captionDirty: false,
  captionFontSize: 72,
  captionOffsetY: 0,
  renderToken: 0,
};

const dom = {
  styleToggle: document.getElementById("styleToggle"),
  backgroundToggle: document.getElementById("backgroundToggle"),
  captionToggle: document.getElementById("captionToggle"),
  captionColorToggle: document.getElementById("captionColorToggle"),
  galleryGrid: document.getElementById("galleryGrid"),
  selectedTags: document.getElementById("selectedTags"),
  selectionCount: document.getElementById("selectionCount"),
  previewCanvas: document.getElementById("previewCanvas"),
  previewPlaceholder: document.getElementById("previewPlaceholder"),
  previewStage: document.getElementById("previewStage"),
  captionEditor: document.getElementById("captionEditor"),
  captionInput: document.getElementById("captionInput"),
  captionFontSizeInput: document.getElementById("captionFontSizeInput"),
  captionFontSizeValue: document.getElementById("captionFontSizeValue"),
  captionOffsetValue: document.getElementById("captionOffsetValue"),
  captionOffsetUpBtn: document.getElementById("captionOffsetUpBtn"),
  captionOffsetResetBtn: document.getElementById("captionOffsetResetBtn"),
  captionOffsetDownBtn: document.getElementById("captionOffsetDownBtn"),
  clearSelectionBtn: document.getElementById("clearSelectionBtn"),
  resetCaptionBtn: document.getElementById("resetCaptionBtn"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  statusMessage: document.getElementById("statusMessage"),
  downloadName: document.getElementById("downloadName"),
};

const imageCache = new Map();
const DEFAULT_PLACEHOLDER_TEXT = "请选择 1 到 3 张图片开始生成表情包";

function init() {
  bindEvents();
  renderAll();
}

function bindEvents() {
  dom.styleToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-style]");
    if (!button) return;
    state.style = button.dataset.style;
    renderAll();
  });

  dom.backgroundToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-background]");
    if (!button) return;
    state.background = button.dataset.background;
    renderAll();
  });

  dom.captionToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-caption-enabled]");
    if (!button) return;
    state.showCaption = button.dataset.captionEnabled === "true";
    if (state.showCaption && !isCaptionDirty()) {
      state.captionText = getDefaultCaption();
    }
    renderAll();
  });

  dom.captionColorToggle.addEventListener("click", (event) => {
    const button = event.target.closest("[data-caption-color]");
    if (!button) return;
    state.captionColor = button.dataset.captionColor;
    renderAll();
  });

  dom.galleryGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-name]");
    if (!button) return;
    toggleSelection(button.dataset.imageName);
  });

  dom.galleryGrid.addEventListener(
    "error",
    (event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      event.target.classList.add("image-load-failed");
      setStatus("部分素材加载失败，请检查图片路径或刷新页面重试。", true);
    },
    true,
  );

  dom.captionInput.addEventListener("input", (event) => {
    state.captionText = event.target.value;
    state.captionDirty = state.captionText !== getDefaultCaption();
    renderMeta();
    renderPreview();
  });

  dom.captionFontSizeInput.addEventListener("input", (event) => {
    state.captionFontSize = Number(event.target.value);
    renderMeta();
    renderPreview();
  });

  dom.captionOffsetUpBtn.addEventListener("click", () => {
    updateCaptionOffset(-CAPTION_OFFSET_STEP);
  });

  dom.captionOffsetResetBtn.addEventListener("click", () => {
    state.captionOffsetY = 0;
    renderMeta();
    renderPreview();
  });

  dom.captionOffsetDownBtn.addEventListener("click", () => {
    updateCaptionOffset(CAPTION_OFFSET_STEP);
  });

  dom.clearSelectionBtn.addEventListener("click", () => {
    state.selectedNames = [];
    syncCaptionAfterSelectionChange();
    setStatus("已清空选择。");
    renderAll();
  });

  dom.resetCaptionBtn.addEventListener("click", () => {
    state.captionText = getDefaultCaption();
    state.captionDirty = false;
    renderAll();
    setStatus("下方字段已重置为图片名组合。");
  });

  dom.copyBtn.addEventListener("click", async () => {
    if (!state.selectedNames.length) return;

    if (!supportsImageClipboard()) {
      setStatus("当前浏览器不支持图片剪贴板，请改用下载 PNG。", true);
      return;
    }

    try {
      dom.copyBtn.disabled = true;
      const ready = await renderPreview();
      if (!ready) return;
      const blob = await canvasToBlob(dom.previewCanvas);
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type || "image/png"]: blob,
        }),
      ]);
      setStatus("已复制预览图到剪贴板。");
    } catch (error) {
      console.error(error);
      setStatus("复制失败，请确认当前页面运行在 localhost 或 HTTPS，并已授予剪贴板权限。", true);
    } finally {
      renderMeta();
    }
  });

  dom.downloadBtn.addEventListener("click", async () => {
    if (!state.selectedNames.length) return;
    try {
      dom.downloadBtn.disabled = true;
      const ready = await renderPreview();
      if (!ready) return;
      const fileName = `${buildSafeFileName()}.png`;
      const blob = await canvasToBlob(dom.previewCanvas);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`已开始下载：${fileName}`);
    } catch (error) {
      console.error(error);
      setStatus("下载失败，请刷新页面后重试。", true);
    } finally {
      renderMeta();
    }
  });
}

function renderAll() {
  renderControls();
  renderGallery();
  renderSelection();
  renderMeta();
  renderPreview();
}

function renderControls() {
  updateToggleButtons(dom.styleToggle, "data-style", state.style);
  updateToggleButtons(dom.backgroundToggle, "data-background", state.background);
  updateToggleButtons(
    dom.captionToggle,
    "data-caption-enabled",
    String(state.showCaption),
  );
  updateToggleButtons(
    dom.captionColorToggle,
    "data-caption-color",
    state.captionColor,
  );
}

function updateToggleButtons(container, attributeName, activeValue) {
  const buttons = container.querySelectorAll(".segmented-btn");
  buttons.forEach((button) => {
    const buttonValue = button.getAttribute(attributeName);
    button.classList.toggle("active", buttonValue === activeValue);
  });
}

function renderGallery() {
  dom.galleryGrid.innerHTML = IMAGE_NAMES.map((name) => {
    const selectedIndex = state.selectedNames.indexOf(name);
    const src = getImageUrl(state.style, name);
    const selectedClass = selectedIndex >= 0 ? " selected" : "";
    const badge =
      selectedIndex >= 0
        ? `<span class="gallery-order">${selectedIndex + 1}</span>`
        : "";

    return `
      <button
        type="button"
        class="gallery-card${selectedClass}"
        data-image-name="${escapeHtml(name)}"
        aria-pressed="${selectedIndex >= 0 ? "true" : "false"}"
      >
        ${badge}
        <img src="${src}" alt="${escapeHtml(name)}" loading="lazy" />
        <div class="gallery-card-name">${escapeHtml(name)}</div>
      </button>
    `;
  }).join("");
}

function renderSelection() {
  dom.selectionCount.textContent = `${state.selectedNames.length} / 3`;

  if (!state.selectedNames.length) {
    dom.selectedTags.innerHTML = `<p class="selected-empty">还没有选择任何图片。</p>`;
    return;
  }

  dom.selectedTags.innerHTML = state.selectedNames
    .map(
      (name, index) => `
        <span class="selected-tag">
          <span class="selected-tag-index">${index + 1}</span>
          <span>${escapeHtml(name)}</span>
        </span>
      `,
    )
    .join("");
}

function renderMeta() {
  const defaultCaption = getDefaultCaption();
  const dirty = state.captionDirty;

  dom.captionEditor.classList.toggle("hidden", !state.showCaption);
  dom.captionInput.disabled = !state.showCaption;
  dom.captionFontSizeInput.disabled = !state.showCaption;
  if (dom.captionInput.value !== state.captionText) {
    dom.captionInput.value = state.captionText;
  }
  if (Number(dom.captionFontSizeInput.value) !== state.captionFontSize) {
    dom.captionFontSizeInput.value = String(state.captionFontSize);
  }

  dom.resetCaptionBtn.disabled = !state.showCaption;
  dom.clearSelectionBtn.disabled = !state.selectedNames.length;
  dom.copyBtn.disabled = !state.selectedNames.length;
  dom.downloadBtn.disabled = !state.selectedNames.length;
  dom.captionFontSizeValue.textContent = `${state.captionFontSize} px`;
  dom.captionOffsetValue.textContent = formatCaptionOffsetLabel(state.captionOffsetY);
  dom.captionOffsetUpBtn.disabled = !state.showCaption || state.captionOffsetY <= CAPTION_OFFSET_MIN;
  dom.captionOffsetResetBtn.disabled = !state.showCaption || state.captionOffsetY === 0;
  dom.captionOffsetDownBtn.disabled = !state.showCaption || state.captionOffsetY >= CAPTION_OFFSET_MAX;

  const fileName = `${buildSafeFileName()}.png`;
  dom.downloadName.textContent = `下载文件名：${fileName}`;

  if (state.showCaption) {
    const helper = dirty
      ? "字段已手动修改。"
      : defaultCaption
        ? "字段会跟随当前图片名自动生成。"
        : "选择图片后会自动生成字段。";
    dom.captionEditor.querySelector("small").textContent =
      `${helper} 点击“重置字段”可恢复默认值。`;
  }
}

async function renderPreview() {
  const token = ++state.renderToken;

  if (!state.selectedNames.length) {
    dom.previewPlaceholder.textContent = DEFAULT_PLACEHOLDER_TEXT;
    dom.previewCanvas.style.display = "none";
    dom.previewPlaceholder.style.display = "block";
    return false;
  }

  try {
    const images = await Promise.all(
      state.selectedNames.map((name) => loadImage(getImageUrl(state.style, name))),
    );

    if (token !== state.renderToken) return false;

    const canvas = dom.previewCanvas;
    const ctx = canvas.getContext("2d");
    const width = images.length * CARD_SIZE;
    const { lines, height: captionHeight } = state.showCaption
      ? measureCaptionLines(width, getCaptionTextForExport())
      : { lines: [], height: 0 };
    const captionTopGap = state.showCaption ? CAPTION_TOP_GAP : 0;
    const height = CARD_SIZE + captionTopGap + captionHeight;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    if (state.background === "black") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
    }

    images.forEach((image, index) => {
      ctx.drawImage(image, index * CARD_SIZE, 0, CARD_SIZE, CARD_SIZE);
    });

    if (state.showCaption) {
      drawCaption(ctx, width, lines, captionTopGap, captionHeight);
    }

    dom.previewPlaceholder.textContent = DEFAULT_PLACEHOLDER_TEXT;
    dom.previewCanvas.style.display = "block";
    dom.previewPlaceholder.style.display = "none";
    return true;
  } catch (error) {
    console.error(error);
    dom.previewPlaceholder.textContent = "预览生成失败，请检查素材文件是否完整。";
    dom.previewCanvas.style.display = "none";
    dom.previewPlaceholder.style.display = "block";
    setStatus("预览生成失败，请检查素材文件是否完整。", true);
    return false;
  }
}

function drawCaption(ctx, width, lines, captionTopGap, captionHeight) {
  ctx.save();
  const lineHeight = getCaptionLineHeight();
  ctx.font = `700 ${state.captionFontSize}px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = state.captionColor === "yellow" ? "#ffd84d" : "#b4bac5";
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;

  const top =
    CARD_SIZE +
    captionTopGap +
    (captionHeight - lines.length * lineHeight) / 2 +
    state.captionOffsetY;
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, top + index * lineHeight);
  });
  ctx.restore();
}

function measureCaptionLines(width, text) {
  const workingCanvas = document.createElement("canvas");
  const ctx = workingCanvas.getContext("2d");
  const lineHeight = getCaptionLineHeight();
  ctx.font = `700 ${state.captionFontSize}px "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif`;

  const maxTextWidth = Math.max(width - CAPTION_HORIZONTAL_PADDING * 2, 80);
  const lines = wrapText(ctx, text, maxTextWidth);
  const offsetAllowance = Math.abs(state.captionOffsetY);
  const contentHeight = Math.max(
    lines.length * lineHeight + offsetAllowance * 2,
    CAPTION_MIN_HEIGHT - CAPTION_VERTICAL_PADDING * 2,
  );
  const height = contentHeight + CAPTION_VERTICAL_PADDING * 2;

  return {
    lines,
    height,
  };
}

function wrapText(ctx, text, maxWidth) {
  const raw = text || "";
  if (!raw.trim()) return [" "];

  const paragraphs = raw.replace(/\r\n/g, "\n").split("\n");
  const lines = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph.length) {
      lines.push(" ");
      return;
    }

    let currentLine = "";
    for (const char of paragraph) {
      const candidate = currentLine + char;
      if (!currentLine || ctx.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = char;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (paragraphIndex < paragraphs.length - 1 && paragraphs[paragraphIndex + 1] === "") {
      lines.push(" ");
    }
  });

  return lines.length ? lines : [" "];
}

function toggleSelection(name) {
  const existingIndex = state.selectedNames.indexOf(name);

  if (existingIndex >= 0) {
    state.selectedNames.splice(existingIndex, 1);
    syncCaptionAfterSelectionChange();
    setStatus(`已取消选择：${name}`);
    renderAll();
    return;
  }

  if (state.selectedNames.length >= 3) {
    setStatus("最多只能选择 3 张图片，请先取消一张再继续。", true);
    return;
  }

  state.selectedNames.push(name);
  syncCaptionAfterSelectionChange();
  setStatus(`已选择：${name}`);
  renderAll();
}

function syncCaptionAfterSelectionChange() {
  if (!state.captionDirty) {
    state.captionText = getDefaultCaption();
  }
}

function getDefaultCaption() {
  if (!state.selectedNames.length) {
    return "";
  }

  return `“${state.selectedNames.join("")}”`;
}

function getCaptionTextForExport() {
  return state.showCaption ? state.captionText : "";
}

function isCaptionDirty() {
  return state.captionDirty;
}

function getImagePath(style, name) {
  return `./${style}/${name}.png`;
}

function getImageUrl(style, name) {
  return `./${style}/${encodeURIComponent(name)}.png`;
}

function buildSafeFileName() {
  const source = state.showCaption ? state.captionText : state.selectedNames.join("");
  const cleaned = source
    .replace(/[+“”]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.\s]+$/g, "");

  return cleaned || "EndBeaconMemoGenerator";
}

function getCaptionLineHeight() {
  return Math.round(state.captionFontSize * 1.28);
}

function updateCaptionOffset(delta) {
  state.captionOffsetY = clamp(
    state.captionOffsetY + delta,
    CAPTION_OFFSET_MIN,
    CAPTION_OFFSET_MAX,
  );
  renderMeta();
  renderPreview();
}

function formatCaptionOffsetLabel(offset) {
  if (offset === 0) {
    return "居中";
  }

  return offset < 0 ? `上移 ${Math.abs(offset)} px` : `下移 ${offset} px`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function loadImage(src) {
  if (imageCache.has(src)) {
    return imageCache.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

  imageCache.set(src, promise);
  return promise;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Canvas toBlob failed"));
      }
    }, "image/png");
  });
}

function supportsImageClipboard() {
  return Boolean(navigator.clipboard && window.ClipboardItem);
}

function setStatus(message, isWarning = false) {
  dom.statusMessage.textContent = message;
  dom.statusMessage.classList.toggle("warning", isWarning);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

init();
