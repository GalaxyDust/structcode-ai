/**
 * scriptV1.js - StructCode Frontend Application (Multi-Model + History)
 * =====================================================================
 * Updates:
 * - Multi-Model parallel support (ask_multi)
 * - Model Selector dropdown logic (max 3, toggle select/unselect)
 * - Comparison Grid rendering (side-by-side cards)
 * - Session History via localStorage (restore on refresh)
 * - Background sync to MongoDB via /api/history
 * - Mobile Bottom Nav & More Menu logic
 * - Independent per-model loading (existing results preserved)
 * - Execution time tracking & display
 * - Per-model rating support
 */
"use strict";

// ==========================================================================
// CONSTANTS & CONFIGURATION
// ==========================================================================

const FEATURES = {
  GENERAL: "general",
  FROM_CODE: "from_code",
  EXPLAIN: "explain",
  HELP_FIX: "help_fix",
  HELP_WRITE: "help_write",
};

const FEATURE_TITLES = {
  [FEATURES.GENERAL]: { en: "General Question", id: "Pertanyaan Umum" },
  [FEATURES.FROM_CODE]: { en: "Question from Pseudocode", id: "Dari Pseudocode" },
  [FEATURES.EXPLAIN]: { en: "Explain Pseudocode", id: "Jelaskan Pseudocode" },
  [FEATURES.HELP_FIX]: { en: "Help Fix Pseudocode", id: "Bantu Perbaiki Bug" },
  [FEATURES.HELP_WRITE]: { en: "Help Write Pseudocode", id: "Bantu Tulis Algoritma" },
};

const RATING_LABELS = {
  1: { en: "Very Unhelpful", id: "Sangat Buruk", emoji: "😡", color: "#f44336" },
  2: { en: "Unhelpful", id: "Buruk", emoji: "😞", color: "#ff9800" },
  3: { en: "Neutral", id: "Netral", emoji: "😐", color: "#9e9e9e" },
  4: { en: "Helpful", id: "Berguna", emoji: "🙂", color: "#4caf50" },
  5: { en: "Very Helpful", id: "Sangat Berguna", emoji: "🤩", color: "#2196f3" },
};

const HISTORY_KEY = "sc_history_v1";
const MAX_HISTORY_ENTRIES = 100;
const MAX_MODELS = 3;
const FEEDBACK_KEY = "sc_feedback_v1"; 

// ==========================================================================
// APPLICATION STATE
// ==========================================================================

const AppState = {
  currentFeature: FEATURES.GENERAL,
  isLoading: false,
  followUpIndex: 0,
  totalQueriesSession: 0,
  sessionStartTime: Date.now(),
  language: "en",

  // Multi-model
  availableModels: [],
  selectedModelIds: [],
  defaultModelId: "",

  // Current multi-model results cache per feature
  // Structure: { feature: { input, extra, results: { modelId: {...} } } }
  currentResults: {},

  // Feedback yang sudah diberikan
  // Structure: { feedbackKey: { rating, comment, timestamp } }
  givenFeedback: {},

  // Inline popup
  inlinePopupKeyword: null,

  // Resizer
  resizerActive: false,

  // Mobile
  mobileMoreOpen: false,

  // Last response info (for rating)
  lastResponse: {
    feature: null,
    querySnippet: "",
    responseSnippet: "",
    isFollowUp: false,
    modelId: "",
  },
};

// ==========================================================================
// DOM ELEMENT CACHE
// ==========================================================================

const DOM = {};

function cacheDOMElements() {
  DOM.featureButtons = document.querySelectorAll(".feature-btn");
  DOM.providerBadge = document.getElementById("provider-badge");
  DOM.featureTitle = document.getElementById("feature-title");

  DOM.views = {};
  Object.values(FEATURES).forEach((feat) => {
    DOM.views[feat] = document.getElementById(`view-${feat}`);
  });

  // General
  DOM.inputGeneral = document.getElementById("input-general");
  DOM.chatGeneral = document.getElementById("chat-general");
  DOM.btnAskGeneral = document.getElementById("btn-ask-general");
  DOM.btnClearGeneral = document.getElementById("btn-clear-general");

  // From Code
  DOM.codeFromCode = document.getElementById("code-from_code");
  DOM.lnFromCode = document.getElementById("ln-code-from_code");
  DOM.qFromCode = document.getElementById("q-from_code");
  DOM.outputFromCode = document.getElementById("output-from_code");

  // Explain
  DOM.codeExplain = document.getElementById("code-explain");
  DOM.lnExplain = document.getElementById("ln-code-explain");
  DOM.outputExplain = document.getElementById("output-explain");

  // Help Fix
  DOM.codeHelpFix = document.getElementById("code-help_fix");
  DOM.lnHelpFix = document.getElementById("ln-code-help_fix");
  DOM.intentHelpFix = document.getElementById("intent-help_fix");
  DOM.outputHelpFix = document.getElementById("output-help_fix");

  // Help Write
  DOM.inputHelpWrite = document.getElementById("input-help_write");
  DOM.outputHelpWrite = document.getElementById("output-help_write");

  // Model Selector
  DOM.modelSelectorToggle = document.getElementById("model-selector-toggle");
  DOM.modelSelectorText = document.getElementById("model-selector-text");
  DOM.modelSelectorArrow = document.getElementById("model-selector-arrow");
  DOM.modelDropdown = document.getElementById("model-dropdown");
  DOM.modelDropdownList = document.getElementById("model-dropdown-list");
  DOM.modelCountBadge = document.getElementById("model-count-badge");
  DOM.mobileModelList = document.getElementById("mobile-model-list");

  // Popups & Modals
  DOM.inlinePopup = document.getElementById("inline-popup");
  DOM.popupKeyword = document.getElementById("popup-keyword");
  DOM.popupBody = document.getElementById("popup-body");
  DOM.ratingModal = document.getElementById("rating-modal");
  DOM.surveyModal = document.getElementById("survey-modal");
  DOM.disclaimerBanner = document.getElementById("disclaimer-banner");
  DOM.analyticsPanel = document.getElementById("analytics-panel");

  // Mobile
  DOM.mobileBottomNav = document.getElementById("mobile-bottom-nav");
  DOM.mobileMoreMenu = document.getElementById("mobile-more-menu");
  DOM.mobileHamburger = document.getElementById("mobile-hamburger");
}

// ==========================================================================
// INITIALIZATION
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
  cacheDOMElements();
  initProviderBadge();
  initDisclaimerBanner();
  initFeatureNavigation();
  initLineNumbers();
  initResizers();
  initGeneralInput();
  initInlinePopupDismiss();
  initKeyboardShortcuts();
  initMobileNav();
  loadFeedbackFromStorage();   // ← TAMBAHKAN INI (sebelum restore history)
  loadModelsFromAPI();
  restoreHistoryFromStorage();
  applyTranslations();
  switchView(FEATURES.GENERAL);
  

  console.info(
    "[StructCode] App initialized | session started at",
    new Date(AppState.sessionStartTime).toISOString()
  );
});

// ==========================================================================
// BILINGUAL LOGIC
// ==========================================================================

function toggleLanguage() {
  AppState.language = AppState.language === "en" ? "id" : "en";
  const btn = document.getElementById("btn-lang-toggle");
  if (btn) btn.innerHTML = AppState.language === "en" ? "🌐 English" : "🌐 Indonesia";
  applyTranslations();
  updateModelSelectorText();
  showToast(
    AppState.language === "id" ? "Bahasa diubah ke Indonesia" : "Language set to English",
    "info"
  );
}

function applyTranslations() {
  const lang = AppState.language;
  document.querySelectorAll(`[data-${lang}]`).forEach((el) => {
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
      el.innerHTML = el.getAttribute(`data-${lang}`);
    }
  });
  document.querySelectorAll(`[data-${lang}-placeholder]`).forEach((el) => {
    el.setAttribute("placeholder", el.getAttribute(`data-${lang}-placeholder`));
  });
  if (DOM.featureTitle) {
    const title = FEATURE_TITLES[AppState.currentFeature];
    if (title) DOM.featureTitle.textContent = title[lang] || title.en;
  }
}

function t(en, id) {
  return AppState.language === "id" ? id : en;
}

// ==========================================================================
// PROVIDER BADGE
// ==========================================================================

async function initProviderBadge() {
  try {
    const res = await fetch("/api/provider");
    const data = await res.json();
    if (DOM.providerBadge && data.provider) {
      DOM.providerBadge.innerHTML = `<span class="provider-dot"></span> ${data.provider} • ${data.model}`;
      DOM.providerBadge.title = t(
        "AI-generated responses may contain errors.",
        "Respons AI dapat mengandung error."
      );
    }
  } catch {
    if (DOM.providerBadge) {
      DOM.providerBadge.innerHTML = `<span class="provider-dot"></span> StructCode AI`;
    }
  }
}

function initDisclaimerBanner() {
  if (!DOM.disclaimerBanner) return;
  if (!sessionStorage.getItem("disclaimer-dismissed")) {
    DOM.disclaimerBanner.classList.remove("hidden");
  }
}

function dismissDisclaimer() {
  if (DOM.disclaimerBanner) {
    DOM.disclaimerBanner.classList.add("hidden");
    sessionStorage.setItem("disclaimer-dismissed", "1");
  }
}

// ==========================================================================
// FEATURE NAVIGATION
// ==========================================================================

function initFeatureNavigation() {
  DOM.featureButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const feat = btn.dataset.feature;
      if (feat && Object.values(FEATURES).includes(feat)) {
        switchView(feat);
      }
    });
  });
}

function switchView(feature) {
  AppState.currentFeature = feature;

  // Update sidebar buttons
  DOM.featureButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.feature === feature);
  });

  // Update mobile nav buttons
  document.querySelectorAll(".mobile-nav-btn[data-feature]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.feature === feature);
  });

  // Update title
  if (DOM.featureTitle) {
    const title = FEATURE_TITLES[feature];
    if (title) DOM.featureTitle.textContent = title[AppState.language] || title.en;
  }

  // Show/hide views
  Object.entries(DOM.views).forEach(([feat, el]) => {
    if (el) el.classList.toggle("active", feat === feature);
  });

  closeInlinePopup();
  closeModelDropdown();
}

// ==========================================================================
// MODEL SELECTOR
// ==========================================================================

async function loadModelsFromAPI() {
  try {
    const res = await fetch("/api/models");
    const data = await res.json();

    AppState.availableModels = data.models || [];
    AppState.defaultModelId = data.default_model_id || "";

    // Default: hanya model default yang terpilih
    AppState.selectedModelIds = [AppState.defaultModelId];

    renderModelDropdown(DOM.modelDropdownList);
    renderModelDropdown(DOM.mobileModelList);
    updateModelSelectorText();

    console.info("[StructCode] Loaded models:", AppState.availableModels.length);
  } catch (err) {
    console.error("[StructCode] Failed to load models:", err);
    if (DOM.modelDropdownList) {
      DOM.modelDropdownList.innerHTML = `<div class="model-dropdown-loading" style="color:var(--error)">Failed to load models</div>`;
    }
  }
}

function renderModelDropdown(container) {
  if (!container) return;

  let html = "";
  AppState.availableModels.forEach((model) => {
    const isSelected = AppState.selectedModelIds.includes(model.id);
    const isDefault = model.is_default;
    const isDisabled = !isSelected && AppState.selectedModelIds.length >= MAX_MODELS;

    html += `
      <div class="model-item ${isSelected ? "selected" : ""} ${isDisabled ? "disabled" : ""}"
           data-model-id="${model.id}"
           onclick="toggleModelSelection('${model.id}')">
        <div class="model-item-checkbox">${isSelected ? "✓" : ""}</div>
        <div class="model-item-info">
          <div class="model-item-header">
            <span class="model-item-icon">${model.icon}</span>
            <span class="model-item-label">${model.label}</span>
            ${isDefault ? `<span class="model-item-default-badge">Default</span>` : ""}
          </div>
          <div class="model-item-persona">${model.persona}</div>
          <div class="model-item-tags">
            ${model.expertise_tags.map((tag) => `<span class="model-tag">${tag}</span>`).join("")}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function toggleModelSelection(modelId) {
  const idx = AppState.selectedModelIds.indexOf(modelId);

  if (idx > -1) {
    // Deselect — tapi jangan biarkan 0 model terpilih
    if (AppState.selectedModelIds.length <= 1) {
      showToast(
        t("At least 1 model must be selected.", "Minimal 1 model harus dipilih."),
        "warning"
      );
      return;
    }
    AppState.selectedModelIds.splice(idx, 1);
  } else {
    // Select — cek max
    if (AppState.selectedModelIds.length >= MAX_MODELS) {
      showToast(
        t(`Maximum ${MAX_MODELS} models can be selected.`, `Maksimal ${MAX_MODELS} model yang bisa dipilih.`),
        "warning"
      );
      return;
    }
    AppState.selectedModelIds.push(modelId);
        // Warn jika pilih banyak model lambat
    const slowModels = ["nousresearch/hermes-3-llama-3.1-405b:free", "openai/gpt-oss-120b:free"];
    const slowSelected = AppState.selectedModelIds.filter((m) => slowModels.includes(m)).length;
    if (slowSelected >= 2) {
      showToast(
        t(
          "⚠ Multiple large models selected. Responses may be slow (60s+).",
          "⚠ Beberapa model besar dipilih. Respons mungkin lambat (60 detik+)."
        ),
        "warning",
        5000
      );
    }
  }

  // Re-render both dropdowns
  renderModelDropdown(DOM.modelDropdownList);
  renderModelDropdown(DOM.mobileModelList);
  updateModelSelectorText();

  // Persist selection
  sessionStorage.setItem("sc_selected_models", JSON.stringify(AppState.selectedModelIds));
}

function updateModelSelectorText() {
  const count = AppState.selectedModelIds.length;
  const text = t(`${count} model${count > 1 ? "s" : ""} selected`, `${count} model dipilih`);

  if (DOM.modelSelectorText) DOM.modelSelectorText.textContent = text;
  if (DOM.modelCountBadge) DOM.modelCountBadge.textContent = `${count}/${MAX_MODELS}`;
}

function toggleModelDropdown() {
  if (!DOM.modelDropdown || !DOM.modelSelectorToggle) return;
  const isHidden = DOM.modelDropdown.classList.contains("hidden");
  if (isHidden) {
    DOM.modelDropdown.classList.remove("hidden");
    DOM.modelSelectorToggle.classList.add("open");
  } else {
    closeModelDropdown();
  }
}

function closeModelDropdown() {
  if (DOM.modelDropdown) DOM.modelDropdown.classList.add("hidden");
  if (DOM.modelSelectorToggle) DOM.modelSelectorToggle.classList.remove("open");
}

// ==========================================================================
// MOBILE NAVIGATION
// ==========================================================================

function initMobileNav() {
  // Restore model selection dari session
  const saved = sessionStorage.getItem("sc_selected_models");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        AppState.selectedModelIds = parsed;
      }
    } catch (e) { /* ignore */ }
  }
}

function toggleMobileMoreMenu() {
  if (!DOM.mobileMoreMenu) return;
  AppState.mobileMoreOpen = !AppState.mobileMoreOpen;
  DOM.mobileMoreMenu.classList.toggle("hidden", !AppState.mobileMoreOpen);
}

// ==========================================================================
// TEXTAREA LINE NUMBERS
// ==========================================================================

function initLineNumbers() {
  const pairs = [
    [DOM.codeFromCode, DOM.lnFromCode],
    [DOM.codeExplain, DOM.lnExplain],
    [DOM.codeHelpFix, DOM.lnHelpFix],
  ];

  pairs.forEach(([textarea, lineNumEl]) => {
    if (!textarea || !lineNumEl) return;
    const syncLines = () => {
      const count = Math.max(1, textarea.value.split("\n").length);
      lineNumEl.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join("<br>");
      lineNumEl.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener("input", syncLines);
    textarea.addEventListener("scroll", () => { lineNumEl.scrollTop = textarea.scrollTop; });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        insertTextAtCursor(textarea, "    ");
        syncLines();
      }
    });
    syncLines();
  });
}

function insertTextAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  textarea.value = textarea.value.substring(0, start) + text + textarea.value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.dispatchEvent(new Event("input"));
}

// ==========================================================================
// SPLIT PANEL RESIZER
// ==========================================================================

function initResizers() {
  document.querySelectorAll(".resizer").forEach((resizer) => {
    let startX = 0, startWidth = 0;
    const panel = resizer.previousElementSibling;
    const container = resizer.parentElement;

    const onMove = (e) => {
      if (!AppState.resizerActive) return;
      const dx = e.clientX - startX;
      const newW = startWidth + dx;
      const minW = 240, maxW = container.clientWidth - 300;
      if (newW >= minW && newW <= maxW) panel.style.flex = `0 0 ${newW}px`;
    };

    const onUp = () => {
      AppState.resizerActive = false;
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    resizer.addEventListener("mousedown", (e) => {
      AppState.resizerActive = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      resizer.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function initGeneralInput() {
  if (!DOM.inputGeneral) return;
  DOM.inputGeneral.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitGeneral();
    }
  });
}

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeInlinePopup();
      closeRatingModal();
      closeSurveyModal();
      closeModelDropdown();
      if (AppState.mobileMoreOpen) toggleMobileMoreMenu();
    }
  });
}

// ==========================================================================
// UI FEEDBACK HELPERS
// ==========================================================================

function showTypingIndicator(container) {
  if (!container) return null;
  const emptyState = container.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const indicator = document.createElement("div");
  indicator.className = "message bot typing";
  indicator.id = `typing-${Date.now()}`;
  indicator.innerHTML = `
    <div class="typing-dots"><span></span><span></span><span></span></div>
    <span>${t("StructCode is thinking...", "StructCode sedang berpikir...")}</span>
  `;
  container.appendChild(indicator);
  container.scrollTop = container.scrollHeight;
  return indicator;
}

function showPanelLoading(outputId) {
  const out = document.getElementById(outputId);
  if (!out) return;
  out.innerHTML = `
    <div class="panel-loading">
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span>${t("Generating responses...", "Sedang menghasilkan respons...")}</span>
      <p style="font-size:0.78rem;color:var(--text-muted);">${t(
        "StructCode avoids giving direct solutions to support your learning.",
        "StructCode menghindari memberikan solusi instan demi mendukung pembelajaran Anda."
      )}</p>
    </div>
  `;
}

function showPanelError(outputId, errorText) {
  const out = document.getElementById(outputId);
  if (!out) return;
  out.innerHTML = `<div class="error-message">⚠ ${escapeHtml(errorText)}</div>`;
}

function showToast(message, type = "info", duration = 3000) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function shakeElement(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 500);
}

// ==========================================================================
// CORE: MULTI-MODEL ASK
// ==========================================================================

async function askMultiModel(feature, input, extra = "", isFollowUp = false) {
  const modelIds = [...AppState.selectedModelIds];
  const existingResults = AppState.currentResults[feature] || {};
  const existingForSameInput = existingResults.input === input && existingResults.extra === extra
    ? existingResults.results || {}
    : {};

  const existingModelIds = Object.keys(existingForSameInput);
  const newModels = modelIds.filter((m) => !existingModelIds.includes(m));

  if (newModels.length === 0 && existingModelIds.length > 0) {
    showToast(t("All selected models already have results.", "Semua model sudah memiliki hasil."), "info");
    return existingForSameInput;
  }

  try {
    const res = await fetch("/api/ask_multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature,
        input,
        extra,
        language: AppState.language,
        model_ids: modelIds,
        existing_model_ids: existingModelIds,
        is_follow_up: isFollowUp,
        follow_up_index: AppState.followUpIndex,
      }),
    });

    // ===== ROBUST RESPONSE HANDLING =====
    // Cek status code dulu
    if (!res.ok) {
      // Coba ambil pesan error dari body
      let errMsg = `Server error: ${res.status} ${res.statusText}`;
      try {
        const text = await res.text();
        if (text) {
          try {
            const j = JSON.parse(text);
            errMsg = j.error || errMsg;
          } catch {
            // Body bukan JSON, mungkin HTML error page
            if (text.includes("timeout") || res.status === 504) {
              errMsg = t(
                "Request timed out. Models are slow — try selecting fewer models.",
                "Permintaan timeout. Model lambat — coba pilih lebih sedikit model."
              );
            } else if (res.status === 502 || res.status === 503) {
              errMsg = t(
                "Server is busy or restarting. Please try again in a moment.",
                "Server sibuk atau restart. Coba lagi sebentar."
              );
            }
          }
        }
      } catch { /* ignore */ }
      throw new Error(errMsg);
    }

    // Cek apakah body kosong
    const text = await res.text();
    if (!text || text.trim() === "") {
      throw new Error(t(
        "Empty response from server. Likely a timeout — try fewer models.",
        "Respons kosong dari server. Kemungkinan timeout — coba lebih sedikit model."
      ));
    }

    // Parse JSON dengan safety
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error(t(
        "Invalid response from server. Please try again.",
        "Respons tidak valid dari server. Coba lagi."
      ));
    }

    // Cek apakah ada error global
    if (data.error && !data.results) {
      throw new Error(data.error);
    }

    // Jika results kosong & tidak ada existing → semua model gagal
    const newResults = data.results || {};
    if (Object.keys(newResults).length === 0 && Object.keys(existingForSameInput).length === 0) {
      // Bikin error result untuk setiap model yang diminta
      const errorResults = {};
      modelIds.forEach((mid) => {
        const info = AppState.availableModels.find((m) => m.id === mid) || {};
        errorResults[mid] = {
          model_id: mid,
          label: info.label || mid,
          icon: info.icon || "🤖",
          persona: info.persona || "",
          response: "",
          exec_time: 0,
          error: t(
            "All models are currently rate-limited. Please wait or try again tomorrow.",
            "Semua model sedang rate-limit. Tunggu sebentar atau coba lagi besok."
          ),
          is_error: true,
        };
      });
      return errorResults;
    }

    // Merge hasil baru dengan yang existing
    const mergedResults = { ...existingForSameInput, ...newResults };

    AppState.currentResults[feature] = {
      input,
      extra,
      results: mergedResults,
      historyId: data.history_id,
      timestamp: new Date().toISOString(),
    };

    saveHistoryToStorage(feature, input, extra, mergedResults, data.history_id);
    syncHistoryToServer(feature, input, extra, mergedResults, data.history_id);

    return mergedResults;
  } catch (err) {
    throw err;
  }
}

// ==========================================================================
// FEATURE: GENERAL QUESTION (Chat)
// ==========================================================================

async function submitGeneral() {
  if (AppState.isLoading || !DOM.inputGeneral) return;
  const input = DOM.inputGeneral.value.trim();
  if (!input) { shakeElement(DOM.inputGeneral); return; }

  addChatMessage(FEATURES.GENERAL, "user", escapeHtml(input));
  DOM.inputGeneral.value = "";

  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  const typingEl = showTypingIndicator(DOM.chatGeneral);

  try {
    const results = await askMultiModel(FEATURES.GENERAL, input, "", false);
    if (typingEl) typingEl.remove();
    renderGeneralMultiResponse(results, input);
  } catch (err) {
    if (typingEl) typingEl.remove();
    addErrorMessage(FEATURES.GENERAL, err.message || "Network error");
  } finally {
    AppState.isLoading = false;
  }
}

async function submitFollowUp(text) {
  if (AppState.isLoading || !DOM.inputGeneral) return;

  const cleanText = text.replace(/<[^>]+>/g, "");
  AppState.followUpIndex++;

  addChatMessage(FEATURES.GENERAL, "user", escapeHtml(cleanText));
  AppState.isLoading = true;
  AppState.totalQueriesSession++;

  // Reset current results for new query
  delete AppState.currentResults[FEATURES.GENERAL];

  const typingEl = showTypingIndicator(DOM.chatGeneral);

  try {
    const results = await askMultiModel(FEATURES.GENERAL, cleanText, "", true);
    if (typingEl) typingEl.remove();
    renderGeneralMultiResponse(results, cleanText);
  } catch (err) {
    if (typingEl) typingEl.remove();
    addErrorMessage(FEATURES.GENERAL, err.message || "Network error");
  } finally {
    AppState.isLoading = false;
  }
}

function renderGeneralMultiResponse(results, queryText) {
  const modelIds = Object.keys(results);
  const isSingle = modelIds.length === 1;

  if (isSingle) {
    // Single model → render seperti biasa (inline chat bubble)
    const modelId = modelIds[0];
    const r = results[modelId];
    if (r.is_error) {
      addErrorMessage(FEATURES.GENERAL, `[${r.label}] ${r.error}`);
      return;
    }
    renderSingleGeneralResponse(r, modelId, queryText);
    return;
  }

  // Multi-model → comparison grid
  const gridClass = modelIds.length === 2 ? "two-models" : "three-models";
  const gridEl = document.createElement("div");
  gridEl.className = `comparison-grid ${gridClass}`;

  modelIds.forEach((modelId) => {
    const r = results[modelId];
    const card = createModelResponseCard(r, modelId, FEATURES.GENERAL, queryText);
    gridEl.appendChild(card);
  });

  const chatBox = DOM.chatGeneral;
  if (!chatBox) return;
  const emptyState = chatBox.querySelector(".empty-state");
  if (emptyState) emptyState.remove();
  chatBox.appendChild(gridEl);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderSingleGeneralResponse(result, modelId, queryText) {
  const text = result.response || "";
  const answer = extractSection(text, "ANSWER", ["FOLLOWUP1", "FOLLOWUP2"]);
  const fu1 = extractLine(text, "FOLLOWUP1");
  const fu2 = extractLine(text, "FOLLOWUP2");

  let html = "";

  // Model badge
  const info = getModelInfo(modelId);
  html += `<div class="model-card-header" style="margin:-14px -18px 12px;padding:8px 14px;border-radius:4px 4px 0 0;">
    <span class="model-card-icon">${info.icon}</span>
    <div class="model-card-info">
      <div class="model-card-label">${info.label}</div>
      <div class="model-card-persona">${info.persona}</div>
    </div>
    <span class="exec-time-badge">⏱ ${result.exec_time}s</span>
  </div>`;

  html += `<div class="response-answer">${formatText(answer || text)}</div>`;

  if (fu1 || fu2) {
    html += `
      <div class="followup-box">
        <small class="followup-label">${t("Suggested Follow-Up Questions", "Saran Pertanyaan Lanjutan")}</small>
        <div class="followup-chips">
          ${fu1 ? `<button class="followup-chip" onclick="submitFollowUp(${JSON.stringify(cleanChipText(fu1))})">${escapeHtml(cleanChipText(fu1))}</button>` : ""}
          ${fu2 ? `<button class="followup-chip" onclick="submitFollowUp(${JSON.stringify(cleanChipText(fu2))})">${escapeHtml(cleanChipText(fu2))}</button>` : ""}
        </div>
      </div>
    `;
  }

  const msgEl = addChatMessage(FEATURES.GENERAL, "bot", html);
  if (msgEl) {
    const ratingBar = createInlineRatingBar(FEATURES.GENERAL, queryText, text.substring(0, 300), modelId);
    msgEl.appendChild(ratingBar);
  }
}

// ==========================================================================
// MODEL RESPONSE CARD (Reusable for all features)
// ==========================================================================

function createModelResponseCard(result, modelId, feature, queryText) {
  const card = document.createElement("div");
  const info = getModelInfo(modelId);
  const isError = result.is_error || result.error;
  card.className = `model-response-card ${isError ? "error" : ""}`;

  // Header
  const header = document.createElement("div");
  header.className = "model-card-header";
  header.innerHTML = `
    <span class="model-card-icon">${info.icon}</span>
    <div class="model-card-info">
      <div class="model-card-label">${info.label}</div>
      <div class="model-card-persona">${info.persona}</div>
    </div>
    <span class="exec-time-badge">⏱ ${result.exec_time || 0}s</span>
  `;
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "model-card-body";

  if (isError) {
    const errMsg = result.error || "Unknown error";
    // Cek tipe error untuk pesan yang lebih baik
    let helpfulMsg = "";
    if (errMsg.includes("⏱️") || errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("quota")) {
      helpfulMsg = `<p style="margin-top:8px;font-size:0.82rem;color:var(--text-dim);">${t(
        "💡 Tip: Try selecting a different model or wait 1 minute.",
        "💡 Tip: Coba pilih model lain atau tunggu 1 menit."
      )}</p>`;
    } else if (errMsg.includes("🌍") || errMsg.toLowerCase().includes("region")) {
      helpfulMsg = `<p style="margin-top:8px;font-size:0.82rem;color:var(--text-dim);">${t(
        "💡 This model is not available in the server region.",
        "💡 Model ini tidak tersedia di region server."
      )}</p>`;
    }
    body.innerHTML = `
      <div class="error-message">
        ⚠ ${escapeHtml(errMsg)}
        ${helpfulMsg}
      </div>
    `;
  } else {
    body.innerHTML = renderFeatureContent(feature, result.response || "", queryText);
  }
  card.appendChild(body);

  // Footer (rating) — hanya jika tidak error
  if (!isError) {
    const footer = document.createElement("div");
    footer.className = "model-card-footer";
    const ratingBar = createInlineRatingBar(
      feature,
      queryText.substring(0, 200),
      (result.response || "").substring(0, 300),
      modelId
    );
    ratingBar.style.border = "none";
    ratingBar.style.margin = "0";
    ratingBar.style.padding = "0";
    footer.appendChild(ratingBar);
    card.appendChild(footer);
  }

  return card;
}

function createModelLoadingCard(modelId) {
  const info = getModelInfo(modelId);
  const card = document.createElement("div");
  card.className = "model-response-card loading";
  card.dataset.modelId = modelId;
  card.innerHTML = `
    <div class="model-card-header">
      <span class="model-card-icon">${info.icon}</span>
      <div class="model-card-info">
        <div class="model-card-label">${info.label}</div>
        <div class="model-card-persona">${info.persona}</div>
      </div>
      <span class="exec-time-badge">⏱ ...</span>
    </div>
    <div class="model-card-loading">
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span>${t("Generating...", "Memproses...")}</span>
    </div>
  `;
  return card;
}

// ==========================================================================
// FEATURE CONTENT RENDERER (Per feature formatting)
// ==========================================================================

function renderFeatureContent(feature, text, queryText) {
  switch (feature) {
    case FEATURES.GENERAL:
      return renderGeneralContent(text);
    case FEATURES.FROM_CODE:
      return renderFromCodeContent(text);
    case FEATURES.EXPLAIN:
      return renderExplainContent(text, queryText);
    case FEATURES.HELP_FIX:
      return renderHelpFixContent(text, queryText);
    case FEATURES.HELP_WRITE:
      return renderHelpWriteContent(text, queryText);
    default:
      return formatText(text);
  }
}

function renderGeneralContent(text) {
  const answer = extractSection(text, "ANSWER", ["FOLLOWUP1", "FOLLOWUP2"]);
  const fu1 = extractLine(text, "FOLLOWUP1");
  const fu2 = extractLine(text, "FOLLOWUP2");

  let html = `<div class="response-answer">${formatText(answer || text)}</div>`;
  if (fu1 || fu2) {
    html += `<div class="followup-box">
      <small class="followup-label">${t("Follow-up", "Lanjutan")}</small>
      <div class="followup-chips">
        ${fu1 ? `<button class="followup-chip" onclick="submitFollowUp(${JSON.stringify(cleanChipText(fu1))})">${escapeHtml(cleanChipText(fu1))}</button>` : ""}
        ${fu2 ? `<button class="followup-chip" onclick="submitFollowUp(${JSON.stringify(cleanChipText(fu2))})">${escapeHtml(cleanChipText(fu2))}</button>` : ""}
      </div>
    </div>`;
  }
  return html;
}

function renderFromCodeContent(text) {
  const response = extractSection(text, "RESPONSE", ["FOLLOWUP"]);
  const followup = extractLine(text, "FOLLOWUP");
  let html = `<div class="response-body">${formatText(response || text)}</div>`;
  if (followup) {
    html += `<div class="followup-box">
      <small class="followup-label">${t("Consider also", "Pertimbangkan juga")}</small>
      <div class="followup-chips">
        <button class="followup-chip" onclick="submitFollowUp(${JSON.stringify(cleanChipText(followup))})">${escapeHtml(cleanChipText(followup))}</button>
      </div>
    </div>`;
  }
  return html;
}

function renderExplainContent(text, code) {
  const lines = (code || "").split("\n");
  const explanations = {};
  const lineRegex = /LINE\|\|\|(\d+)\|\|\|([\s\S]*?)(?=LINE\|\|\||SUMMARY\|\|\||$)/gi;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    explanations[parseInt(match[1])] = match[2].trim();
  }
  const summaryMatch = text.match(/SUMMARY\|\|\|([\s\S]*?)(?=$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";
  const defExpl = t("No specific explanation.", "Tidak ada penjelasan khusus.");
  const lineRef = t("Line", "Baris");

  let html = `<div class="line-explainer">`;
  lines.forEach((line, idx) => {
    const num = idx + 1;
    const expl = explanations[num] || defExpl;
    const has = Boolean(explanations[num]);
    html += `
      <div class="line-row ${has ? "has-explanation" : ""}" tabindex="0">
        <div class="line-num">${num}</div>
        <div class="line-code">${escapeHtml(line) || "&nbsp;"}</div>
        <div class="line-tooltip"><span class="tooltip-line-ref">${lineRef} ${num}:</span>${formatText(expl)}</div>
      </div>`;
  });
  html += `</div>`;

  if (summary) {
    html += `<div class="summary-card"><div class="summary-header"><span>📝</span><strong>${t("Summary", "Ringkasan")}</strong></div><p class="summary-text">${formatText(summary)}</p></div>`;
  }
  return html;
}

function renderHelpFixContent(text, code) {
  const lines = (code || "").split("\n");
  const buggyMatch = text.match(/BUGGY_LINES\|\|\|([\d,\s]+)/i);
  const buggyNums = new Set(
    (buggyMatch ? buggyMatch[1] : "").split(",").map((n) => parseInt(n.trim())).filter((n) => !isNaN(n) && n > 0)
  );
  const suggestions = [];
  const suggRegex = /SUGGESTION\|\|\|(\d+)\|\|\|([\s\S]*?)(?=SUGGESTION\|\|\||$)/gi;
  let m;
  while ((m = suggRegex.exec(text)) !== null) {
    suggestions.push({ index: parseInt(m[1]), text: m[2].trim() });
  }

  let html = `<div class="line-explainer">`;
  lines.forEach((line, idx) => {
    const num = idx + 1;
    const isBuggy = buggyNums.has(num);
    let suggText = t("Review this line carefully.", "Periksa baris ini dengan teliti.");
    if (isBuggy) {
      const found = suggestions.find((s) =>
        s.text.toLowerCase().includes(`line ${num}`) || s.text.toLowerCase().includes(`baris ${num}`)
      );
      if (found) suggText = found.text;
    }
    html += `
      <div class="line-row ${isBuggy ? "buggy" : ""}" tabindex="${isBuggy ? "0" : "-1"}">
        <div class="line-num">${num}</div>
        <div class="line-code">${escapeHtml(line) || "&nbsp;"}</div>
        ${isBuggy ? `<div class="line-tooltip buggy-tooltip"><strong class="tooltip-warn">⚠ ${t("Fix:", "Perbaikan:")}</strong><br>${formatText(suggText)}</div>` : ""}
      </div>`;
  });
  html += `</div>`;

  if (suggestions.length > 0) {
    html += `<div class="suggestion-list"><strong class="suggestion-list-title">💡 ${t("Suggestions", "Saran")}</strong>`;
    suggestions.forEach((s) => {
      html += `<div class="suggestion-item"><span class="suggestion-num">${s.index}.</span><span>${formatText(s.text)}</span></div>`;
    });
    html += `</div>`;
  } else if (buggyNums.size === 0) {
    html += `<div class="no-errors-card">✅ ${t("No obvious issues detected.", "Tidak mendeteksi error logika.")}</div>`;
  }
  return html;
}

function renderHelpWriteContent(text, input) {
  const tasks = [];
  const taskRegex = /TASK\|\|\|(\d+)\|\|\|([\s\S]*?)(?=TASK\|\|\||$)/gi;
  let m;
  while ((m = taskRegex.exec(text)) !== null) {
    tasks.push({ num: parseInt(m[1]), text: m[2].trim() });
  }

  let html = "";
  if (tasks.length > 0) {
    html += `<div class="task-list">`;
    tasks.forEach((task) => {
      html += `<div class="task-item"><div class="task-num">${task.num}</div><div class="task-text">${formatText(task.text)}</div></div>`;
    });
    html += `</div>`;
  } else {
    html += `<div>${formatText(text)}</div>`;
  }
  return html;
}

// ==========================================================================
// FEATURE: FROM CODE
// ==========================================================================

async function submitFromCode() {
  if (AppState.isLoading) return;
  const code = DOM.codeFromCode?.value?.trim() || "";
  const question = DOM.qFromCode?.value?.trim() || "";
  if (!code) { shakeElement(DOM.codeFromCode); showToast(t("Paste pseudocode first.", "Tempel pseudocode dahulu."), "warning"); return; }
  if (!question) { shakeElement(DOM.qFromCode); showToast(t("Enter your question.", "Masukkan pertanyaan Anda."), "warning"); return; }

  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  renderMultiModelOutput("output-from_code", FEATURES.FROM_CODE, question, code);
}

// ==========================================================================
// FEATURE: EXPLAIN CODE
// ==========================================================================

async function submitExplain() {
  if (AppState.isLoading) return;
  const code = DOM.codeExplain?.value?.trim() || "";
  if (!code) { shakeElement(DOM.codeExplain); showToast(t("Paste pseudocode to explain.", "Tempel pseudocode."), "warning"); return; }

  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  renderMultiModelOutput("output-explain", FEATURES.EXPLAIN, code, code);
}

// ==========================================================================
// FEATURE: HELP FIX
// ==========================================================================

async function submitHelpFix() {
  if (AppState.isLoading) return;
  const code = DOM.codeHelpFix?.value?.trim() || "";
  const intent = DOM.intentHelpFix?.value?.trim() || "";
  if (!code) { shakeElement(DOM.codeHelpFix); showToast(t("Paste pseudocode first.", "Tempel pseudocode dahulu."), "warning"); return; }

  const input = intent || t("Please identify and suggest fixes.", "Tolong identifikasi dan sarankan perbaikan.");
  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  renderMultiModelOutput("output-help_fix", FEATURES.HELP_FIX, input, code);
}

// ==========================================================================
// FEATURE: HELP WRITE
// ==========================================================================

async function submitHelpWrite() {
  if (AppState.isLoading) return;
  const input = DOM.inputHelpWrite?.value?.trim() || "";
  if (!input) { shakeElement(DOM.inputHelpWrite); showToast(t("Describe the algorithm.", "Deskripsikan algoritma."), "warning"); return; }

  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  renderMultiModelOutput("output-help_write", FEATURES.HELP_WRITE, input, "");
}

// ==========================================================================
// GENERIC MULTI-MODEL OUTPUT RENDERER (For Split Panel features)
// ==========================================================================

async function renderMultiModelOutput(outputId, feature, input, extra) {
  const out = document.getElementById(outputId);
  if (!out) { AppState.isLoading = false; return; }

  const modelIds = [...AppState.selectedModelIds];
  const isSingle = modelIds.length === 1;

  // Show loading cards
  out.innerHTML = "";
  if (isSingle) {
    showPanelLoading(outputId);
  } else {
    const gridClass = modelIds.length === 2 ? "two-models" : "three-models";
    const grid = document.createElement("div");
    grid.className = `comparison-grid ${gridClass}`;
    grid.id = `grid-${outputId}`;
    modelIds.forEach((id) => grid.appendChild(createModelLoadingCard(id)));
    out.appendChild(grid);
  }

  try {
    const results = await askMultiModel(feature, input, extra);

    if (isSingle) {
      const modelId = modelIds[0];
      const r = results[modelId];
      if (r && r.is_error) {
        showPanelError(outputId, `[${r.label}] ${r.error}`);
      } else if (r) {
        const wrapper = document.createElement("div");
        const card = createModelResponseCard(r, modelId, feature, extra || input);
        wrapper.appendChild(card);
        out.innerHTML = "";
        out.appendChild(wrapper);
      }
    } else {
      // Multi-model → replace loading cards with real cards
      const gridClass = modelIds.length === 2 ? "two-models" : "three-models";
      const grid = document.createElement("div");
      grid.className = `comparison-grid ${gridClass}`;

      modelIds.forEach((modelId) => {
        const r = results[modelId];
        if (r) {
          grid.appendChild(createModelResponseCard(r, modelId, feature, extra || input));
        }
      });
      out.innerHTML = "";
      out.appendChild(grid);
    }
  } catch (err) {
    showPanelError(outputId, err.message || "Network error");
  } finally {
    AppState.isLoading = false;
  }
}

// ==========================================================================
// INLINE POPUP (Keyword Exploration)
// ==========================================================================

async function openInlinePopup(keyword, triggerEl) {
  if (!DOM.inlinePopup || !DOM.popupBody || !DOM.popupKeyword) return;

  AppState.inlinePopupKeyword = keyword;
  DOM.popupKeyword.textContent = keyword;

  // Position
  const isMobile = window.innerWidth < 768;
  if (!isMobile) {
    const rect = triggerEl.getBoundingClientRect();
    let left = rect.right + 12;
    let top = rect.top;
    if (left + 370 > window.innerWidth) left = rect.left - 380;
    if (top + 300 > window.innerHeight) top = rect.top - 280;
    DOM.inlinePopup.style.left = `${Math.max(8, left)}px`;
    DOM.inlinePopup.style.top = `${Math.max(8, top)}px`;
  }

  DOM.inlinePopup.classList.remove("hidden");
  DOM.popupBody.innerHTML = `<div class="popup-loading"><div class="typing-dots"><span></span><span></span><span></span></div><span>${t("Loading...", "Memuat...")}</span></div>`;

  try {
    const res = await fetch("/api/explore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, language: AppState.language }),
    });
    const data = await res.json();
    if (data.error) {
      DOM.popupBody.innerHTML = `<p class="popup-error">⚠ ${escapeHtml(data.error)}</p>`;
    } else {
      renderInlinePopupContent(data.response, keyword);
    }
  } catch (err) {
    DOM.popupBody.innerHTML = `<p class="popup-error">${escapeHtml(err.message)}</p>`;
  }
}

function renderInlinePopupContent(text, keyword) {
  if (!DOM.popupBody) return;
  const def = text.match(/DEF\|\|\|([\s\S]*?)(?=EXAMPLE\|\|\||RELATED\|\|\||$)/i)?.[1]?.trim() || "";
  const example = text.match(/EXAMPLE\|\|\|([\s\S]*?)(?=RELATED\|\|\||$)/i)?.[1]?.trim() || "";
  const related = text.match(/RELATED\|\|\|(.*)/i)?.[1]?.trim() || "";

  let html = `<p class="popup-def">${formatText(def)}</p>`;
  if (example) {
    html += `<div class="popup-example-label">${t("Example:", "Contoh:")}</div><pre class="popup-example"><code>${escapeHtml(example)}</code></pre>`;
  }
  if (related) {
    html += `<div class="popup-related"><span class="popup-related-label">${t("Explore next:", "Pelajari:")}</span>
      <button class="inline-keyword" onclick='openInlinePopup(${JSON.stringify(related)}, this)'>${escapeHtml(related)}</button></div>`;
  }
  html += `<div class="popup-actions">
    <button class="btn btn-sm btn-ghost" onclick="closeInlinePopup()">${t("Back", "Kembali")}</button>
    <button class="btn btn-sm btn-primary" style="flex:1;" onclick='popupAskFollowUp(${JSON.stringify(keyword)})'>${t("Ask about this ➔", "Tanyakan lebih dalam ➔")}</button>
  </div>`;

  DOM.popupBody.innerHTML = html;
}

function popupAskFollowUp(keyword) {
  const query = t(`Can you explain more about "${keyword}"?`, `Bisa jelaskan lebih lanjut mengenai "${keyword}"?`);
  closeInlinePopup();
  switchView(FEATURES.GENERAL);
  if (DOM.inputGeneral) DOM.inputGeneral.value = query;
  submitFollowUp(query);
}

function closeInlinePopup() {
  if (DOM.inlinePopup) DOM.inlinePopup.classList.add("hidden");
  AppState.inlinePopupKeyword = null;
}

function initInlinePopupDismiss() {
  document.addEventListener("click", (e) => {
    if (!DOM.inlinePopup) return;
    const isPopup = DOM.inlinePopup.contains(e.target);
    const isKeyword = e.target.classList.contains("inline-keyword");
    if (!isPopup && !isKeyword) closeInlinePopup();
  });

  // Close model dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!DOM.modelDropdown || DOM.modelDropdown.classList.contains("hidden")) return;
    const isToggle = DOM.modelSelectorToggle?.contains(e.target);
    const isDropdown = DOM.modelDropdown.contains(e.target);
    if (!isToggle && !isDropdown) closeModelDropdown();
  });
}

// ==========================================================================
// FEEDBACK STATE MANAGEMENT (Lock & Edit)
// ==========================================================================

/**
 * Generate unique key untuk satu feedback berdasarkan
 * feature + modelId + hash dari query
 */
function getFeedbackKey(feature, modelId, querySnippet) {
  const hash = simpleHash((querySnippet || "").substring(0, 100));
  return `${feature}::${modelId}::${hash}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function loadFeedbackFromStorage() {
  try {
    const data = JSON.parse(sessionStorage.getItem(FEEDBACK_KEY) || "{}");
    AppState.givenFeedback = data;
  } catch (e) {
    AppState.givenFeedback = {};
  }
}

function saveFeedbackToStorage(feedbackKey, rating, comment) {
  try {
    AppState.givenFeedback[feedbackKey] = {
      rating,
      comment: comment || "",
      timestamp: new Date().toISOString(),
    };
    sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify(AppState.givenFeedback));
  } catch (e) {
    console.warn("[StructCode] Failed to save feedback:", e);
  }
}

function getStoredFeedback(feedbackKey) {
  return AppState.givenFeedback[feedbackKey] || null;
}

/**
 * Lock semua rating bar yang punya feedbackKey sama
 * (penting untuk multi-tab atau setelah refresh)
 */
function lockAllRatingBarsWithKey(feedbackKey, rating) {
  document.querySelectorAll(`.inline-rating-bar[data-feedback-key="${feedbackKey}"]`).forEach((bar) => {
    renderLockedRatingBar(bar, rating);
  });
}

/**
 * Render bar dalam state LOCKED (sudah ada feedback)
 */
function renderLockedRatingBar(barEl, rating) {
  if (!barEl) return;
  const meta = RATING_LABELS[rating];
  if (!meta) return;
  const lbl = meta[AppState.language] || meta.en;

  barEl.classList.add("locked");
  barEl.innerHTML = `
    <div class="locked-rating-display">
      <span class="locked-rating-check">✓</span>
      <span class="locked-rating-text">${t("You rated:", "Anda menilai:")}</span>
      <span class="locked-rating-emoji">${meta.emoji}</span>
      <span class="locked-rating-label" style="color:${meta.color}">${lbl}</span>
    </div>
    <button class="rating-edit-btn" title="${t("Edit feedback", "Ubah feedback")}" aria-label="Edit">
      ✏
    </button>
  `;

  // Bind edit button
  const editBtn = barEl.querySelector(".rating-edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const feature = barEl.dataset.feature;
      const querySnippet = barEl.dataset.query || "";
      const responseSnippet = barEl.dataset.response || "";
      const modelId = barEl.dataset.modelId || "";
      const feedbackKey = barEl.dataset.feedbackKey;
      const stored = getStoredFeedback(feedbackKey);

      openRatingModal(
        feature,
        querySnippet,
        responseSnippet,
        false,
        stored?.rating || 0,
        modelId,
        true,                  // isEdit flag
        stored?.comment || ""
      );
    });
  }
}

/**
 * Render bar dalam state INTERACTIVE (belum ada feedback)
 */
function renderInteractiveRatingBar(barEl) {
  if (!barEl) return;
  barEl.classList.remove("locked");
  barEl.innerHTML = `
    <span class="inline-rating-label">${t("How useful?", "Seberapa berguna?")}</span>
    <div class="inline-rating-stars">
      ${[1, 2, 3, 4, 5].map((v) => {
        const meta = RATING_LABELS[v];
        const lbl = meta[AppState.language] || meta.en;
        return `<button class="inline-star-btn" data-value="${v}" title="${lbl}">
          <span class="star-emoji">${meta.emoji}</span>
          <span class="star-text">${lbl}</span>
        </button>`;
      }).join("")}
    </div>
  `;

  // Bind click handlers
  barEl.querySelectorAll(".inline-star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rating = parseInt(btn.dataset.value);
      openRatingModal(
        barEl.dataset.feature,
        barEl.dataset.query || "",
        barEl.dataset.response || "",
        false,
        rating,
        barEl.dataset.modelId || "",
        false,
        ""
      );
    });
  });
}

// ==========================================================================
// INLINE RATING BAR
// ==========================================================================

function createInlineRatingBar(feature, querySnippet, responseSnippet, modelId = "") {
  const bar = document.createElement("div");
  bar.className = "inline-rating-bar";

  const feedbackKey = getFeedbackKey(feature, modelId, querySnippet);

  // Simpan metadata di dataset (agar bisa diakses saat edit)
  bar.dataset.feedbackKey = feedbackKey;
  bar.dataset.feature = feature;
  bar.dataset.query = querySnippet;
  bar.dataset.response = responseSnippet;
  bar.dataset.modelId = modelId;

  // Cek apakah sudah ada feedback
  const stored = getStoredFeedback(feedbackKey);
  if (stored && stored.rating) {
    renderLockedRatingBar(bar, stored.rating);
  } else {
    renderInteractiveRatingBar(bar);
  }

  return bar;
}

// ==========================================================================
// RATING MODAL
// ==========================================================================

function openRatingModal(feature, querySnippet, responseSnippet, isFollowUp = false, preselectedRating = 0, modelId = "", isEdit = false, prefillComment = "") {
  if (!DOM.ratingModal) return;
  AppState.lastResponse = { feature, querySnippet, responseSnippet, isFollowUp, modelId, isEdit };

  const body = DOM.ratingModal.querySelector(".modal-body");
  if (!body) return;

  const modelInfo = getModelInfo(modelId);
  const modelLabel = modelInfo.label || "AI";
  const titleText = isEdit
    ? t("Edit Your Feedback", "Ubah Feedback Anda")
    : t("Your Feedback Helps!", "Feedback Anda Sangat Membantu!");

  body.innerHTML = `
    <h3 class="modal-title">${titleText}</h3>
    <p class="modal-subtitle">${t("Feature:", "Fitur:")} <strong>${feature}</strong> · ${t("Model:", "Model:")} <strong>${modelLabel}</strong></p>
    <div class="rating-stars" role="group">
      ${Object.entries(RATING_LABELS).map(([val, meta]) => {
        const lbl = meta[AppState.language] || meta.en;
        return `<button class="star-btn" data-rating="${val}" title="${lbl}" onclick="selectRating(${val})">
          <span class="star-emoji">${meta.emoji}</span><span class="star-num">${val}</span><span class="star-label">${lbl}</span>
        </button>`;
      }).join("")}
    </div>
    <div class="rating-comment-wrap">
      <label class="rating-comment-label">${t("Optional: Tell us why", "Opsional: Beritahu alasannya")}</label>
      <textarea id="rating-comment" class="rating-comment" placeholder="${t("e.g., It explained clearly but...", "Contoh: Penjelasannya jelas tapi...")}" rows="3" maxlength="500"></textarea>
      <span class="char-count" id="rating-char-count">0 / 500</span>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeRatingModal()">${isEdit ? t("Cancel", "Batal") : t("Skip", "Lewati")}</button>
      <button class="btn btn-primary" id="btn-submit-rating" onclick="submitRating()" disabled>
        ${isEdit ? t("Update", "Perbarui") : t("Submit", "Kirim")}
      </button>
    </div>
    <p class="rating-privacy-note">${t("Ratings are anonymous and used for research.", "Penilaian anonim dan hanya untuk riset.")}</p>
  `;

  DOM.ratingModal.classList.remove("hidden");

  // Setup comment box (prefill if edit)
  const commentBox = body.querySelector("#rating-comment");
  const countBox = body.querySelector("#rating-char-count");
  if (commentBox && countBox) {
    const initialComment = prefillComment || (localStorage.getItem("sc_draft_comment") || "");
    commentBox.value = initialComment;
    countBox.textContent = `${initialComment.length} / 500`;
    commentBox.addEventListener("input", (e) => {
      if (!isEdit) localStorage.setItem("sc_draft_comment", e.target.value);
      countBox.textContent = `${e.target.value.length} / 500`;
    });
  }

  if (preselectedRating > 0) selectRating(preselectedRating);
}

function selectRating(value) {
  const buttons = DOM.ratingModal?.querySelectorAll(".star-btn");
  buttons?.forEach((btn) => {
    const v = parseInt(btn.dataset.rating);
    btn.classList.toggle("selected", v === value);
    btn.classList.toggle("dimmed", v !== value);
    btn.style.borderColor = v === value ? (RATING_LABELS[v]?.color || "transparent") : "transparent";
  });
  const submitBtn = DOM.ratingModal?.querySelector("#btn-submit-rating");
  if (submitBtn) { submitBtn.disabled = false; submitBtn.dataset.rating = value; }
}

async function submitRating() {
  const submitBtn = DOM.ratingModal?.querySelector("#btn-submit-rating");
  const rating = parseInt(submitBtn?.dataset.rating);
  const comment = DOM.ratingModal?.querySelector("#rating-comment")?.value?.trim() || "";
  if (!rating || rating < 1 || rating > 5) return;

  const { feature, querySnippet, responseSnippet, isFollowUp, modelId, isEdit } = AppState.lastResponse;

  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature,
        model_id: modelId,
        rating,
        comment,
        snippet: responseSnippet,
        query_snippet: querySnippet,
        is_follow_up: isFollowUp,
        is_edit: isEdit || false,
      }),
    });

    // Save ke localStorage
    const feedbackKey = getFeedbackKey(feature, modelId, querySnippet);
    saveFeedbackToStorage(feedbackKey, rating, comment);

    // Lock semua bar dengan key sama (penting jika ada bar duplikat)
    lockAllRatingBarsWithKey(feedbackKey, rating);

    const successMsg = isEdit
      ? t("Feedback updated:", "Feedback diperbarui:")
      : t("Feedback submitted:", "Feedback terkirim:");
    showToast(`${successMsg} ${RATING_LABELS[rating].emoji}`, "success");

    if (!isEdit) localStorage.removeItem("sc_draft_comment");
  } catch {
    showToast(t("Failed to submit.", "Gagal mengirim."), "error");
  }
  closeRatingModal();
}

function closeRatingModal() {
  if (DOM.ratingModal) DOM.ratingModal.classList.add("hidden");
}

// ==========================================================================
// SURVEY MODAL
// ==========================================================================

function openSurveyModal() {
  if (!DOM.surveyModal) return;
  const body = DOM.surveyModal.querySelector(".modal-body");
  if (!body) return;

  const week = Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24 * 7));

  body.innerHTML = `
    <h3 class="modal-title">${t("Weekly Usage Survey", "Survei Penggunaan Mingguan")}</h3>
    <p class="modal-subtitle">${t("Week", "Minggu")} ${week}</p>
    <div class="survey-section">
      <h4>${t("How useful was StructCode this week?", "Seberapa berguna StructCode minggu ini?")}</h4>
      <div class="rating-stars">${[1, 2, 3, 4, 5].map((v) => `
        <label class="star-btn" style="cursor:pointer;">
          <input type="radio" name="sc-useful" value="${v}" style="display:none;">
          <span class="star-emoji">${RATING_LABELS[v].emoji}</span><span class="star-num">${v}</span>
        </label>`).join("")}
      </div>
    </div>
    <div class="survey-section" style="margin-top:var(--space-md);">
      <h4>${t("Open feedback", "Feedback terbuka")}</h4>
      <textarea id="survey-open" rows="3" placeholder="${t("Any thoughts...", "Pendapat Anda...")}" style="width:100%;"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeSurveyModal()">${t("Cancel", "Batal")}</button>
      <button class="btn btn-primary" onclick="submitSurvey()">${t("Submit", "Kirim")}</button>
    </div>
  `;

  // Star selection
  body.querySelectorAll('.star-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.star-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      const radio = btn.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  DOM.surveyModal.classList.remove("hidden");
}

async function submitSurvey() {
  const modal = DOM.surveyModal;
  if (!modal) return;
  const useful = modal.querySelector('input[name="sc-useful"]:checked');
  const open = modal.querySelector("#survey-open")?.value?.trim() || "";

  try {
    await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_number: Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24 * 7)),
        usefulness_rating: useful ? parseInt(useful.value) : null,
        open_feedback: open,
      }),
    });
    showToast(t("Survey submitted!", "Survei terkirim!"), "success");
  } catch {
    showToast(t("Failed to submit.", "Gagal mengirim."), "error");
  }
  closeSurveyModal();
}

function closeSurveyModal() {
  if (DOM.surveyModal) DOM.surveyModal.classList.add("hidden");
}

// ==========================================================================
// ANALYTICS PANEL
// ==========================================================================

async function loadAnalytics() {
  if (!DOM.analyticsPanel) return;
  DOM.analyticsPanel.innerHTML = `<div class="analytics-loading"><div class="typing-dots"><span></span><span></span><span></span></div>${t("Loading...", "Memuat...")}</div>`;
  DOM.analyticsPanel.classList.remove("hidden");

  try {
    const res = await fetch("/api/analytics/summary");
    const data = await res.json();
    if (res.ok) renderAnalytics(data);
    else DOM.analyticsPanel.innerHTML = `<p class="analytics-error">${data.error || "Access denied."}</p><button class="btn btn-sm" style="margin:10px auto;display:block;" onclick="DOM.analyticsPanel.classList.add('hidden')">Close</button>`;
  } catch {
    DOM.analyticsPanel.innerHTML = `<p class="analytics-error">Failed to load analytics.</p>`;
  }
}

function renderAnalytics(data) {
  if (!DOM.analyticsPanel) return;

  const featureRows = Object.entries(data.feature_counts || {}).map(([feat, count]) => {
    const pct = data.feature_usage_pct?.[feat] ?? 0;
    const paper = data.paper_baseline_pct?.[feat] ?? 0;
    const avg = data.avg_ratings?.[feat];
    return `<tr><td>${feat}</td><td>${count}</td><td>${pct.toFixed(1)}%</td><td>${paper}%</td><td>${avg ? `${avg} ★` : "—"}</td></tr>`;
  }).join("");

  const modelRows = Object.entries(data.model_usage || {}).map(([label, count]) => {
    return `<tr><td>${label}</td><td>${count}</td></tr>`;
  }).join("");

  DOM.analyticsPanel.innerHTML = `
    <div class="analytics-header">
      <h3>📊 ${t("Usage Analytics", "Analitik Penggunaan")} (${data.target_class || "All"})</h3>
      <button class="btn btn-sm" onclick="DOM.analyticsPanel.classList.add('hidden')">Close</button>
    </div>
    <div class="analytics-summary">
      <div class="analytics-stat"><span class="stat-val">${data.total_queries ?? 0}</span><span class="stat-label">${t("Queries", "Kueri")}</span></div>
      <div class="analytics-stat"><span class="stat-val">${data.unique_sessions_count ?? 0}</span><span class="stat-label">${t("Sessions", "Sesi")}</span></div>
      <div class="analytics-stat"><span class="stat-val">${((data.error_rate ?? 0) * 100).toFixed(1)}%</span><span class="stat-label">${t("Error Rate", "Error")}</span></div>
    </div>
    <h4 style="margin:var(--space-md) 0 var(--space-sm);color:var(--text-bright);font-size:var(--font-size-sm);">${t("Feature Usage", "Penggunaan Fitur")}</h4>
    <table class="analytics-table"><thead><tr><th>${t("Feature", "Fitur")}</th><th>#</th><th>%</th><th>${t("Baseline", "Baseline")}</th><th>${t("Rating", "Rating")}</th></tr></thead><tbody>${featureRows}</tbody></table>
    ${modelRows ? `
    <h4 style="margin:var(--space-lg) 0 var(--space-sm);color:var(--text-bright);font-size:var(--font-size-sm);">${t("Model Usage", "Penggunaan Model")}</h4>
    <table class="analytics-table"><thead><tr><th>${t("Model", "Model")}</th><th>#</th></tr></thead><tbody>${modelRows}</tbody></table>
    ` : ""}
  `;
}

// ==========================================================================
// HISTORY: localStorage Persistence
// ==========================================================================

function saveHistoryToStorage(feature, input, extra, results, historyId) {
  try {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");

    history.push({
      id: historyId || Date.now().toString(),
      timestamp: new Date().toISOString(),
      feature,
      input: input.substring(0, 1000),
      extra: (extra || "").substring(0, 500),
      language: AppState.language,
      modelIds: AppState.selectedModelIds,
      results: Object.fromEntries(
        Object.entries(results).map(([modelId, r]) => [
          modelId,
          {
            response: (r.response || "").substring(0, 3000),
            exec_time: r.exec_time || 0,
            is_error: r.is_error || false,
            error: r.error || null,
            label: r.label || "",
            icon: r.icon || "",
            persona: r.persona || "",
          },
        ])
      ),
    });

    // Keep only latest entries
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }

    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("[StructCode] Failed to save history:", e);
  }
}

function restoreHistoryFromStorage() {
  try {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    if (history.length === 0) return;

    // Restore General Chat messages
    const generalEntries = history.filter((h) => h.feature === FEATURES.GENERAL);
    if (generalEntries.length > 0 && DOM.chatGeneral) {
      const emptyState = DOM.chatGeneral.querySelector(".empty-state");
      if (emptyState) emptyState.remove();

      generalEntries.forEach((entry) => {
        // User message
        addChatMessage(FEATURES.GENERAL, "user", escapeHtml(entry.input));

        // Bot response(s)
        const modelIds = Object.keys(entry.results || {});
        if (modelIds.length === 1) {
          const r = entry.results[modelIds[0]];
          if (!r.is_error) {
            renderSingleGeneralResponse(r, modelIds[0], entry.input);
          }
        } else if (modelIds.length > 1) {
          renderGeneralMultiResponse(entry.results, entry.input);
        }
      });
    }

    // Restore last result for split panel features
    [FEATURES.FROM_CODE, FEATURES.EXPLAIN, FEATURES.HELP_FIX, FEATURES.HELP_WRITE].forEach((feat) => {
      const entries = history.filter((h) => h.feature === feat);
      if (entries.length === 0) return;

      const lastEntry = entries[entries.length - 1];
      AppState.currentResults[feat] = {
        input: lastEntry.input,
        extra: lastEntry.extra,
        results: lastEntry.results,
        historyId: lastEntry.id,
        timestamp: lastEntry.timestamp,
      };

      // Restore input fields
      restoreInputFields(feat, lastEntry);

      // Render last output
      const outputId = `output-${feat}`;
      const out = document.getElementById(outputId);
      if (!out) return;

      const modelIds = Object.keys(lastEntry.results || {});
      if (modelIds.length === 0) return;

      if (modelIds.length === 1) {
        const modelId = modelIds[0];
        const r = lastEntry.results[modelId];
        if (r && !r.is_error) {
          const wrapper = document.createElement("div");
          wrapper.appendChild(createModelResponseCard(r, modelId, feat, lastEntry.extra || lastEntry.input));
          out.innerHTML = "";
          out.appendChild(wrapper);
        }
      } else {
        const gridClass = modelIds.length === 2 ? "two-models" : "three-models";
        const grid = document.createElement("div");
        grid.className = `comparison-grid ${gridClass}`;
        modelIds.forEach((modelId) => {
          const r = lastEntry.results[modelId];
          if (r) grid.appendChild(createModelResponseCard(r, modelId, feat, lastEntry.extra || lastEntry.input));
        });
        out.innerHTML = "";
        out.appendChild(grid);
      }
    });

    console.info(`[StructCode] Restored ${history.length} history entries from sessionStorage`);
  } catch (e) {
    console.warn("[StructCode] Failed to restore history:", e);
  }
}

function restoreInputFields(feature, entry) {
  switch (feature) {
    case FEATURES.FROM_CODE:
      if (DOM.codeFromCode && entry.extra) { DOM.codeFromCode.value = entry.extra; DOM.codeFromCode.dispatchEvent(new Event("input")); }
      if (DOM.qFromCode && entry.input) DOM.qFromCode.value = entry.input;
      break;
    case FEATURES.EXPLAIN:
      if (DOM.codeExplain && entry.extra) { DOM.codeExplain.value = entry.extra; DOM.codeExplain.dispatchEvent(new Event("input")); }
      break;
    case FEATURES.HELP_FIX:
      if (DOM.codeHelpFix && entry.extra) { DOM.codeHelpFix.value = entry.extra; DOM.codeHelpFix.dispatchEvent(new Event("input")); }
      if (DOM.intentHelpFix && entry.input) DOM.intentHelpFix.value = entry.input;
      break;
    case FEATURES.HELP_WRITE:
      if (DOM.inputHelpWrite && entry.input) DOM.inputHelpWrite.value = entry.input;
      break;
  }
}

// ==========================================================================
// HISTORY: Background Sync to MongoDB
// ==========================================================================

async function syncHistoryToServer(feature, input, extra, results, historyId) {
  try {
    await fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history_id: historyId,
        feature,
        input: input.substring(0, 1000),
        extra_context_preview: (extra || "").substring(0, 300),
        language: AppState.language,
        results: Object.fromEntries(
          Object.entries(results).map(([modelId, r]) => [
            modelId,
            {
              response_preview: (r.response || "").substring(0, 500),
              exec_time: r.exec_time || 0,
              is_error: r.is_error || false,
            },
          ])
        ),
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("[StructCode] Background sync failed:", e);
  }
}

// ==========================================================================
// CHAT MESSAGE UTILITIES
// ==========================================================================

function addChatMessage(viewId, role, htmlContent) {
  const chatBox = document.getElementById(`chat-${viewId}`);
  if (!chatBox) return null;
  const emptyState = chatBox.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const msgEl = document.createElement("div");
  msgEl.className = `message ${role}`;
  msgEl.innerHTML = htmlContent;
  chatBox.appendChild(msgEl);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msgEl;
}

function addErrorMessage(viewId, errorText) {
  return addChatMessage(viewId, "bot", `<div class="error-message">⚠ ${escapeHtml(errorText)}</div>`);
}

function clearView(feature) {
  // Clear history for this feature
  delete AppState.currentResults[feature];

  if (feature === FEATURES.GENERAL) {
    const box = DOM.chatGeneral;
    if (box) {
      box.innerHTML = `<div class="empty-state"><span class="empty-state-icon">🤖</span><p>${t("Chat cleared.", "Chat dibersihkan.")}</p></div>`;
    }
    AppState.followUpIndex = 0;

    // Remove general entries from sessionStorage
    try {
      const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
      const filtered = history.filter((h) => h.feature !== feature);
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));

      // Clear feedback terkait feature
      Object.keys(AppState.givenFeedback).forEach((key) => {
        if (key.startsWith(`${feature}::`)) {
          delete AppState.givenFeedback[key];
        }
      });
      sessionStorage.setItem(FEEDBACK_KEY, JSON.stringify(AppState.givenFeedback));
    } catch (e) { /* ignore */ }
    return;
  }

  const clearMap = {
    [FEATURES.FROM_CODE]: { ta: [DOM.codeFromCode, DOM.qFromCode], out: "output-from_code" },
    [FEATURES.EXPLAIN]: { ta: [DOM.codeExplain], out: "output-explain" },
    [FEATURES.HELP_FIX]: { ta: [DOM.codeHelpFix, DOM.intentHelpFix], out: "output-help_fix" },
    [FEATURES.HELP_WRITE]: { ta: [DOM.inputHelpWrite], out: "output-help_write" },
  };

  const config = clearMap[feature];
  if (!config) return;

  config.ta.forEach((el) => {
    if (el) { el.value = ""; el.dispatchEvent(new Event("input")); }
  });

  const out = document.getElementById(config.out);
  if (out) out.innerHTML = `<div class="empty-state"><p>${t("Cleared.", "Dibersihkan.")}</p></div>`;

  // Remove from sessionStorage
  try {
    const history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]");
    const filtered = history.filter((h) => h.feature !== feature);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) { /* ignore */ }
}
/**
 * Safe fetch JSON wrapper
 * Handles empty responses, non-JSON responses, dan timeout dengan baik
 */
async function safeFetchJSON(url, options = {}) {
  const res = await fetch(url, options);

  if (!res.ok) {
    let errMsg = `Server error: ${res.status} ${res.statusText}`;
    try {
      const text = await res.text();
      if (text) {
        try {
          const j = JSON.parse(text);
          errMsg = j.error || errMsg;
        } catch {
          if (res.status === 504) {
            errMsg = t("Request timed out.", "Permintaan timeout.");
          } else if (res.status === 502 || res.status === 503) {
            errMsg = t("Server is busy. Try again.", "Server sibuk. Coba lagi.");
          }
        }
      }
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    throw new Error(t("Empty server response.", "Respons server kosong."));
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(t("Invalid server response.", "Respons server tidak valid."));
  }
}
// ==========================================================================
// PARSING & TEXT FORMATTING UTILITIES
// ==========================================================================

function extractSection(text, key, stopKeys = []) {
  const stopPattern = stopKeys.length > 0
    ? `(?=${stopKeys.map((k) => `${k}:|${k}\\|\\|\\|`).join("|")}|$)`
    : "(?=$)";
  const regex = new RegExp(`${key}:\\s*([\\s\\S]*?)${stopPattern}`, "i");
  return text.match(regex)?.[1]?.trim() || "";
}

function extractLine(text, key) {
  return text.match(new RegExp(`${key}:\\s*(.*)`, "i"))?.[1]?.trim() || "";
}

function formatText(text) {
  if (!text) return "";
  let html = escapeHtml(text);

  // Convert escaped <kw> tags back to clickable buttons
  html = html.replace(
    /&lt;kw&gt;([\s\S]*?)&lt;\/kw&gt;/g,
    "<button class='inline-keyword' onclick='openInlinePopup(\"$1\", this)'>$1</button>"
  );

  // Code blocks & inline code
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Typography
  html = html.replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function cleanChipText(text) {
  if (!text) return "";
  return text.replace(/<\/?kw>/g, "").replace(/<[^>]+>/g, "");
}

function getModelInfo(modelId) {
  const model = AppState.availableModels.find((m) => m.id === modelId);
  return model || { label: modelId, icon: "🤖", persona: "", expertise_tags: [] };
}

// ==========================================================================
// EXPOSE GLOBAL FUNCTIONS (called from HTML onclick)
// ==========================================================================

window.submitGeneral = submitGeneral;
window.submitFollowUp = submitFollowUp;
window.submitFromCode = submitFromCode;
window.submitExplain = submitExplain;
window.submitHelpFix = submitHelpFix;
window.submitHelpWrite = submitHelpWrite;
window.clearView = clearView;
window.switchView = switchView;
window.toggleLanguage = toggleLanguage;
window.dismissDisclaimer = dismissDisclaimer;
window.toggleModelDropdown = toggleModelDropdown;
window.toggleModelSelection = toggleModelSelection;
window.toggleMobileMoreMenu = toggleMobileMoreMenu;
window.openInlinePopup = openInlinePopup;
window.closeInlinePopup = closeInlinePopup;
window.popupAskFollowUp = popupAskFollowUp;
window.openRatingModal = openRatingModal;
window.selectRating = selectRating;
window.submitRating = submitRating;
window.closeRatingModal = closeRatingModal;
window.openSurveyModal = openSurveyModal;
window.submitSurvey = submitSurvey;
window.closeSurveyModal = closeSurveyModal;
window.loadAnalytics = loadAnalytics;
window.handleLogout = handleLogout;
window.fillAndSubmitFollowUp = submitFollowUp;