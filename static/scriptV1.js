/**
 * scriptV1.js - StructCode Frontend Application
 * ==============================================
 * Client-side logic for the StructCode pedagogical AI assistant.
 * 
 * Update Fase 2: 
 * - Full Dynamic Bilingual Support via data-attributes
 * - Inline Keyword Highlighting parser (<kw>...</kw>)
 * - Enhanced Exploration Popup with Back & Ask Deeper buttons
 */
"use strict";

//===========================================================================
// CONSTANTS & CONFIGURATION
//===========================================================================

const FEATURES = {
  GENERAL: "general",
  FROM_CODE: "from_code",
  EXPLAIN: "explain",
  HELP_FIX: "help_fix",
  HELP_WRITE: "help_write",
};

const FEATURE_META = {
  [FEATURES.GENERAL]:    { icon: "❓" },
  [FEATURES.FROM_CODE]:  { icon: "💻" },
  [FEATURES.EXPLAIN]:    { icon: "📖" },
  [FEATURES.HELP_FIX]:   { icon: "🔧" },
  [FEATURES.HELP_WRITE]: { icon: "🛠" },
};

const RATING_LABELS = {
  1: { label: "Very Unhelpful", emoji: "😡", color: "#f44336" },
  2: { label: "Unhelpful",      emoji: "😞", color: "#ff9800" },
  3: { label: "Neutral",        emoji: "😐", color: "#9e9e9e" },
  4: { label: "Helpful",        emoji: "🙂", color: "#4caf50" },
  5: { label: "Very Helpful",   emoji: "🤩", color: "#2196f3" },
};

const SURVEY_RESOURCES = [
  { id: "structcode",        label: "StructCode" },
  { id: "lecture_videos",    label: "Lecture Videos" },
  { id: "lecture_notes",     label: "Lecture Notes" },
  { id: "qa_board",          label: "Q&A Discussion Board" },
  { id: "office_hours",      label: "Office Hours" },
  { id: "chatgpt",           label: "ChatGPT" },
  { id: "stackoverflow",     label: "Stack Overflow" },
];

//===========================================================================
// APPLICATION STATE
//===========================================================================

const AppState = {
  currentFeature: FEATURES.GENERAL,
  isLoading: false,
  followUpIndex: 0,
  totalQueriesSession: 0,
  sessionStartTime: Date.now(),
  inlinePopupKeyword: null,
  resizerActive: false,
  language: "en", // Status bahasa saat ini ("en" atau "id")
  lastResponse: {
    feature: null,
    querySnippet: "",
    responseSnippet: "",
    isFollowUp: false,
  },
};

//===========================================================================
// DOM ELEMENT CACHE
//===========================================================================

const DOM = {};

function cacheDOMElements() {
  DOM.featureButtons = document.querySelectorAll(".feature-btn");
  DOM.providerBadge  = document.getElementById("provider-badge");
  DOM.featureTitle   = document.getElementById("feature-title");
  
  DOM.views = {};
  Object.values(FEATURES).forEach((feat) => {
    DOM.views[feat] = document.getElementById(`view-${feat}`);
  });

  DOM.inputGeneral    = document.getElementById("input-general");
  DOM.chatGeneral     = document.getElementById("chat-general");
  DOM.btnAskGeneral   = document.getElementById("btn-ask-general");
  DOM.btnClearGeneral = document.getElementById("btn-clear-general");

  DOM.codeFromCode   = document.getElementById("code-from_code");
  DOM.lnFromCode     = document.getElementById("ln-code-from_code");
  DOM.qFromCode      = document.getElementById("q-from_code");
  DOM.outputFromCode = document.getElementById("output-from_code");

  DOM.codeExplain   = document.getElementById("code-explain");
  DOM.lnExplain     = document.getElementById("ln-code-explain");
  DOM.outputExplain = document.getElementById("output-explain");

  DOM.codeHelpFix   = document.getElementById("code-help_fix");
  DOM.lnHelpFix     = document.getElementById("ln-code-help_fix");
  DOM.intentHelpFix = document.getElementById("intent-help_fix");
  DOM.outputHelpFix = document.getElementById("output-help_fix");

  DOM.inputHelpWrite  = document.getElementById("input-help_write");
  DOM.outputHelpWrite = document.getElementById("output-help_write");

  DOM.inlinePopup   = document.getElementById("inline-popup");
  DOM.popupKeyword  = document.getElementById("popup-keyword");
  DOM.popupBody     = document.getElementById("popup-body");

  DOM.ratingModal       = document.getElementById("rating-modal");
  DOM.surveyModal       = document.getElementById("survey-modal");
  DOM.disclaimerBanner  = document.getElementById("disclaimer-banner");
  DOM.analyticsPanel    = document.getElementById("analytics-panel");
}

//===========================================================================
// INITIALIZATION
//===========================================================================

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
  
  // Terapkan terjemahan default saat pertama kali load
  applyTranslations();
  switchView(FEATURES.GENERAL);
  
  console.info(
    "[StructCode] App initialized | session started at",
    new Date(AppState.sessionStartTime).toISOString()
  );
});

//===========================================================================
// BILINGUAL LOGIC (Terjemahan UI)
//===========================================================================

function toggleLanguage() {
  AppState.language = AppState.language === "en" ? "id" : "en";
  
  const btn = document.getElementById("btn-lang-toggle");
  if (btn) {
    btn.innerHTML = AppState.language === "en" ? "🌐 English" : "🌐 Indonesia";
  }
  
  applyTranslations();
  showToast(
    AppState.language === "id" ? "Bahasa diubah ke Indonesia" : "Language set to English", 
    "info"
  );
}

function applyTranslations() {
  const lang = AppState.language; // 'en' atau 'id'
  
  // Update teks berdasarkan atribut data-en / data-id
  document.querySelectorAll(`[data-${lang}]`).forEach((el) => {
    // Abaikan jika elemen adalah textarea/input, karena mereka butuh placeholder khusus
    if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") {
      // Kita gunakan innerHTML agar span icon di dalam menu tidak hilang
      el.innerHTML = el.getAttribute(`data-${lang}`);
    }
  });

  // Update Placeholder textareas
  document.querySelectorAll(`[data-${lang}-placeholder]`).forEach((el) => {
    el.setAttribute("placeholder", el.getAttribute(`data-${lang}-placeholder`));
  });

  // Pastikan judul aktif di-update
  if (DOM.featureTitle) {
    const activeBtn = document.querySelector(".feature-btn.active .feature-label");
    if (activeBtn) {
      DOM.featureTitle.textContent = activeBtn.textContent;
    }
  }
}

//===========================================================================
// PROVIDER BADGE & TRANSPARENCY
//===========================================================================

async function initProviderBadge() {
  try {
    const res = await fetch("/api/provider");
    const data = await res.json();
    if (DOM.providerBadge && data.provider) {
      DOM.providerBadge.innerHTML = `<span class="provider-dot" aria-hidden="true"></span> ${data.provider} • ${data.model}`;
      DOM.providerBadge.title = "This response is generated by an AI language model. It may contain errors.";
    }
  } catch {
    if (DOM.providerBadge) {
      DOM.providerBadge.innerHTML = `<span class="provider-dot" aria-hidden="true"></span> StructCode AI`;
    }
  }
}

function initDisclaimerBanner() {
  if (!DOM.disclaimerBanner) return;
  const dismissed = sessionStorage.getItem("disclaimer-dismissed");
  if (!dismissed) {
    DOM.disclaimerBanner.classList.remove("hidden");
  }
}

function dismissDisclaimer() {
  if (DOM.disclaimerBanner) {
    DOM.disclaimerBanner.classList.add("hidden");
    sessionStorage.setItem("disclaimer-dismissed", "1");
  }
}

//===========================================================================
// FEATURE NAVIGATION
//===========================================================================

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
  
  DOM.featureButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.feature === feature);
  });
  
  if (DOM.featureTitle) {
    const activeLabel = document.querySelector(`.feature-btn[data-feature="${feature}"] .feature-label`);
    if(activeLabel) DOM.featureTitle.textContent = activeLabel.textContent;
  }
  
  Object.entries(DOM.views).forEach(([feat, el]) => {
    if (el) el.classList.toggle("active", feat === feature);
  });
  
  closeInlinePopup();
}

//===========================================================================
// TEXTAREA LINE NUMBERS & UTILS
//===========================================================================

function initLineNumbers() {
  const pairs = [
    [DOM.codeFromCode, DOM.lnFromCode],
    [DOM.codeExplain, DOM.lnExplain],
    [DOM.codeHelpFix, DOM.lnHelpFix],
  ];

  pairs.forEach(([textarea, lineNumEl]) => {
    if (!textarea || !lineNumEl) return;
    
    const syncLines = () => {
      const lineCount = Math.max(1, textarea.value.split("\n").length);
      lineNumEl.innerHTML = Array.from(
        { length: lineCount }, 
        (_, i) => i + 1
      ).join("<br>");
      lineNumEl.scrollTop = textarea.scrollTop;
    };

    textarea.addEventListener("input", syncLines);
    textarea.addEventListener("scroll", () => {
      lineNumEl.scrollTop = textarea.scrollTop;
    });

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

//===========================================================================
// SPLIT PANEL RESIZER
//===========================================================================

function initResizers() {
  document.querySelectorAll(".resizer").forEach((resizer) => {
    let startX = 0;
    let startWidth = 0;
    const panel = resizer.previousElementSibling;
    const container = resizer.parentElement;

    const onMouseMove = (e) => {
      if (!AppState.resizerActive) return;
      const dx = e.clientX - startX;
      const newW = startWidth + dx;
      const minW = 240;
      const maxW = container.clientWidth - 300;
      if (newW >= minW && newW <= maxW) {
        panel.style.flex = `0 0 ${newW}px`;
      }
    };

    const onMouseUp = () => {
      AppState.resizerActive = false;
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    resizer.addEventListener("mousedown", (e) => {
      AppState.resizerActive = true;
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      resizer.classList.add("dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
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
    }
  });
}

//===========================================================================
// UI FEEDBACK / LOADING HELPERS
//===========================================================================

function showTypingIndicator(viewId) {
  const chatBox = document.getElementById(`chat-${viewId}`);
  if (!chatBox) return null;
  const emptyState = chatBox.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  const indicator = document.createElement("div");
  indicator.className = "message bot typing";
  indicator.id = `typing-${viewId}`;
  
  const text = AppState.language === "id" ? "StructCode sedang berpikir..." : "StructCode is thinking...";
  
  indicator.innerHTML = `
    <div class="typing-dots"><span></span><span></span><span></span></div>
    <span class="typing-label">${text}</span>
  `;
  chatBox.appendChild(indicator);
  chatBox.scrollTop = chatBox.scrollHeight;
  return indicator;
}

function hideTypingIndicator(viewId) {
  const el = document.getElementById(`typing-${viewId}`);
  if (el) el.remove();
}

function showPanelLoading(outputId) {
  const out = document.getElementById(outputId);
  if (!out) return;
  
  const title = AppState.language === "id" ? "Sedang menghasilkan respons..." : "Generating response...";
  const note = AppState.language === "id" 
      ? "StructCode menghindari memberikan solusi instan demi mendukung pembelajaran Anda" 
      : "StructCode avoids giving direct solutions to support your learning";
      
  out.innerHTML = `
    <div class="panel-loading">
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span>${title}</span>
      <p class="loading-note">${note}</p>
    </div>
  `;
}

function showPanelError(outputId, errorText) {
  const out = document.getElementById(outputId);
  if (!out) return;
  out.innerHTML = `
    <div class="error-message panel-error">
      ⚠ ${escapeHtml(errorText)}
    </div>
  `;
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

//===========================================================================
// FEATURE: GENERAL QUESTION (Chat)
//===========================================================================

async function submitGeneral() {
  if (AppState.isLoading || !DOM.inputGeneral) return;
  
  const input = DOM.inputGeneral.value.trim();
  if (!input) {
    shakeElement(DOM.inputGeneral);
    return;
  }

  addChatMessage(FEATURES.GENERAL, "user", escapeHtml(input));
  const querySnippet = input.substring(0, 200);
  DOM.inputGeneral.value = "";
  
  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  showTypingIndicator(FEATURES.GENERAL);

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.GENERAL,
        input: input,
        language: AppState.language,
        is_follow_up: false,
        follow_up_index: 0,
      }),
    });
    
    const data = await res.json();
    hideTypingIndicator(FEATURES.GENERAL);

    if (data.error) {
      addErrorMessage(FEATURES.GENERAL, data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.GENERAL,
        querySnippet: querySnippet,
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: false,
      };
      renderGeneralResponse(data.response);
    }
  } catch (err) {
    hideTypingIndicator(FEATURES.GENERAL);
    addErrorMessage(FEATURES.GENERAL, `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

async function submitFollowUp(text) {
  if (AppState.isLoading || !DOM.inputGeneral) return;
  
  AppState.followUpIndex++;
  addChatMessage(FEATURES.GENERAL, "user", escapeHtml(text));
  AppState.isLoading = true;
  AppState.totalQueriesSession++;
  showTypingIndicator(FEATURES.GENERAL);

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.GENERAL,
        input: text,
        language: AppState.language,
        is_follow_up: true,
        follow_up_index: AppState.followUpIndex,
      }),
    });
    
    const data = await res.json();
    hideTypingIndicator(FEATURES.GENERAL);

    if (data.error) {
      addErrorMessage(FEATURES.GENERAL, data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.GENERAL,
        querySnippet: text.substring(0, 200),
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: true,
      };
      renderGeneralResponse(data.response);
    }
  } catch (err) {
    hideTypingIndicator(FEATURES.GENERAL);
    addErrorMessage(FEATURES.GENERAL, `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

function renderGeneralResponse(text) {
  const answer = extractSection(text, "ANSWER", ["FOLLOWUP1", "FOLLOWUP2"]);
  const fu1 = extractLine(text, "FOLLOWUP1");
  const fu2 = extractLine(text, "FOLLOWUP2");
  
  let html = `<div class="response-answer">${formatText(answer || text)}</div>`;

  if (fu1 || fu2) {
    const label = AppState.language === "id" ? "Saran Pertanyaan Lanjutan" : "Suggested Follow-Up Questions";
    html += `
      <div class="followup-box">
        <small class="followup-label">${label}</small>
        <div class="followup-chips">
          ${fu1 ? `<button class="followup-chip" onclick="fillAndSubmitFollowUp(${JSON.stringify(cleanChipText(fu1))})">${escapeHtml(cleanChipText(fu1))}</button>` : ""}
          ${fu2 ? `<button class="followup-chip" onclick="fillAndSubmitFollowUp(${JSON.stringify(cleanChipText(fu2))})">${escapeHtml(cleanChipText(fu2))}</button>` : ""}
        </div>
      </div>
    `;
  }

  const msgEl = addChatMessage(FEATURES.GENERAL, "bot", html);
  
  if (msgEl) {
    const ratingBar = createInlineRatingBar(AppState.lastResponse.feature, AppState.lastResponse.querySnippet, AppState.lastResponse.responseSnippet);
    ratingBar.style.marginTop = "12px";
    ratingBar.style.paddingTop = "12px";
    msgEl.appendChild(ratingBar);
  }
}

function fillAndSubmitFollowUp(text) {
  // Bersihkan tag html dari teks jika ada sisa <kw> saat di klik
  const cleanText = text.replace(/<[^>]+>/g, '');
  if (DOM.inputGeneral) DOM.inputGeneral.value = cleanText;
  submitFollowUp(cleanText);
}

//===========================================================================
// FEATURE: QUESTION FROM CODE (Split Panel)
//===========================================================================

async function submitFromCode() {
  if (AppState.isLoading) return;

  const code = DOM.codeFromCode?.value?.trim() || "";
  const question = DOM.qFromCode?.value?.trim() || "";
  const warn1 = AppState.language === "id" ? "Tolong tempel pseudocode Anda terlebih dahulu." : "Please paste your pseudocode first.";
  const warn2 = AppState.language === "id" ? "Tolong masukkan pertanyaan Anda." : "Please enter your question.";

  if (!code) {
    shakeElement(DOM.codeFromCode);
    showToast(warn1, "warning");
    return;
  }
  if (!question) {
    shakeElement(DOM.qFromCode);
    showToast(warn2, "warning");
    return;
  }

  showPanelLoading("output-from_code");
  AppState.isLoading = true;
  AppState.totalQueriesSession++;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.FROM_CODE,
        input: question,
        extra: code,
        language: AppState.language
      }),
    });
    const data = await res.json();
    
    if (data.error) {
      showPanelError("output-from_code", data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.FROM_CODE,
        querySnippet: question.substring(0, 200),
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: false,
      };
      renderFromCodeResponse(data.response, code, question);
    }
  } catch (err) {
    showPanelError("output-from_code", `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

function renderFromCodeResponse(text, originalCode, originalQuestion) {
  const out = document.getElementById("output-from_code");
  if (!out) return;

  const response = extractSection(text, "RESPONSE", ["FOLLOWUP"]);
  const followup = extractLine(text, "FOLLOWUP");
  
  const title = AppState.language === "id" ? "Pertanyaan dari Pseudocode" : "Question from Pseudocode";

  let html = `
    <div class="response-card">
      <div class="response-header">
        <span class="response-icon">💻</span>
        <span class="response-feature-label">${title}</span>
      </div>
      <div class="response-body">${formatText(response || text)}</div>
  `;

  if (followup) {
    const fuLabel = AppState.language === "id" ? "Coba pertimbangkan juga" : "Consider also exploring";
    html += `
      <div class="followup-box">
        <small class="followup-label">${fuLabel}</small>
        <div class="followup-chips">
          <button class="followup-chip" onclick="fillAndSubmitFollowUp(${JSON.stringify(cleanChipText(followup))})">${escapeHtml(cleanChipText(followup))}</button>
        </div>
      </div>
    `;
  }
  
  html += `</div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  
  const ratingBar = createInlineRatingBar(AppState.lastResponse.feature, AppState.lastResponse.querySnippet, AppState.lastResponse.responseSnippet);
  wrapper.appendChild(ratingBar);
  
  out.innerHTML = "";
  out.appendChild(wrapper);
}

//===========================================================================
// FEATURE: EXPLAIN CODE (Split Panel)
//===========================================================================

async function submitExplain() {
  if (AppState.isLoading) return;
  const code = DOM.codeExplain?.value?.trim() || "";

  if (!code) {
    shakeElement(DOM.codeExplain);
    const warn = AppState.language === "id" ? "Tolong tempel pseudocode untuk dijelaskan." : "Please paste pseudocode to explain.";
    showToast(warn, "warning");
    return;
  }

  showPanelLoading("output-explain");
  AppState.isLoading = true;
  AppState.totalQueriesSession++;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.EXPLAIN,
        input: code,
        extra: code,
        language: AppState.language
      }),
    });
    const data = await res.json();
    
    if (data.error) {
      showPanelError("output-explain", data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.EXPLAIN,
        querySnippet: `[Explain] ${code.substring(0, 150)}`,
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: false,
      };
      renderExplainResponse(data.response, code);
    }
  } catch (err) {
    showPanelError("output-explain", `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

function renderExplainResponse(text, code) {
  const out = document.getElementById("output-explain");
  if (!out) return;

  const lines = code.split("\n");
  const explanations = {};
  
  const lineRegex = /LINE\|\|\|(\d+)\|\|\|([\s\S]*?)(?=LINE\|\|\||SUMMARY\|\|\||$)/gi;
  let match;
  while ((match = lineRegex.exec(text)) !== null) {
    explanations[parseInt(match[1])] = match[2].trim();
  }

  const summaryMatch = text.match(/SUMMARY\|\|\|([\s\S]*?)(?=$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";

  const headerMsg = AppState.language === "id" ? "Arahkan atau klik baris untuk melihat penjelasannya" : "Hover or click a line to see its explanation below";
  const defExpl = AppState.language === "id" ? "Tidak ada penjelasan khusus untuk baris ini." : "No specific explanation for this line.";
  const lineRefText = AppState.language === "id" ? "Baris" : "Line";

  let html = `
    <div class="explain-header">
      <span class="explain-icon">📖</span>
      <span>${headerMsg}</span>
    </div>
    <div class="line-explainer">
  `;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const expl = explanations[lineNum] || defExpl;
    const hasExpl = Boolean(explanations[lineNum]);

    html += `
      <div class="line-row ${hasExpl ? 'has-explanation' : ''}" tabindex="0">
        <div class="line-num">${lineNum}</div>
        <div class="line-code">${escapeHtml(line) || "&nbsp;"}</div>
        <div class="line-tooltip" role="tooltip">
          <span class="tooltip-line-ref">${lineRefText} ${lineNum}:</span>
          ${formatText(expl)}
        </div>
      </div>
    `;
  });

  html += `</div>`;

  if (summary) {
    const sumTitle = AppState.language === "id" ? "Ringkasan Kode" : "Summary of the code";
    html += `
      <div class="summary-card">
        <div class="summary-header">
          <span class="summary-icon">📝</span>
          <strong>${sumTitle}</strong>
        </div>
        <p class="summary-text">${formatText(summary)}</p>
      </div>
    `;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const ratingBar = createInlineRatingBar(AppState.lastResponse.feature, AppState.lastResponse.querySnippet, AppState.lastResponse.responseSnippet);
  wrapper.appendChild(ratingBar);

  out.innerHTML = "";
  out.appendChild(wrapper);
}

//===========================================================================
// FEATURE: HELP FIX CODE (Split Panel)
//===========================================================================

async function submitHelpFix() {
  if (AppState.isLoading) return;

  const code = DOM.codeHelpFix?.value?.trim() || "";
  const intent = DOM.intentHelpFix?.value?.trim() || "";

  if (!code) {
    shakeElement(DOM.codeHelpFix);
    const warn = AppState.language === "id" ? "Tolong tempel pseudocode Anda terlebih dahulu." : "Please paste your pseudocode first.";
    showToast(warn, "warning");
    return;
  }

  showPanelLoading("output-help_fix");
  AppState.isLoading = true;
  AppState.totalQueriesSession++;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.HELP_FIX,
        input: intent || "Please identify and suggest fixes for any issues.",
        extra: code,
        language: AppState.language
      }),
    });
    const data = await res.json();
    
    if (data.error) {
      showPanelError("output-help_fix", data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.HELP_FIX,
        querySnippet: `[Fix] ${intent.substring(0, 150) || code.substring(0, 100)}`,
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: false,
      };
      renderHelpFixResponse(data.response, code, intent);
    }
  } catch (err) {
    showPanelError("output-help_fix", `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

function renderHelpFixResponse(text, code, intent) {
  const out = document.getElementById("output-help_fix");
  if (!out) return;

  const lines = code.split("\n");

  const buggyMatch = text.match(/BUGGY_LINES\|\|\|([\d,\s]+)/i);
  const buggyNums = new Set(
    (buggyMatch ? buggyMatch[1] : "")
      .split(",")
      .map(n => parseInt(n.trim()))
      .filter(n => !isNaN(n) && n > 0)
  );

  const suggestions = [];
  const suggRegex = /SUGGESTION\|\|\|(\d+)\|\|\|([\s\S]*?)(?=SUGGESTION\|\|\||$)/gi;
  let m;
  while ((m = suggRegex.exec(text)) !== null) {
    suggestions.push({ index: parseInt(m[1]), text: m[2].trim() });
  }

  const hasBugs = buggyNums.size > 0;
  
  const headerT1 = AppState.language === "id" ? `Menemukan <strong>${buggyNums.size}</strong> potensi masalah. Sorot baris merah untuk melihat hint.` : `Found <strong>${buggyNums.size}</strong> potential issue(s). Hover red lines for hints.`;
  const headerT2 = AppState.language === "id" ? "Menganalisis pseudocode Anda..." : "Analyzing your pseudocode...";

  let html = `
    <div class="fix-header">
      <span class="fix-icon">🔧</span>
      <span>${hasBugs ? headerT1 : headerT2}</span>
    </div>
    <div class="line-explainer">
  `;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const isBuggy = buggyNums.has(lineNum);
    
    let lineSuggText = AppState.language === "id" ? "Periksa logika pada baris ini dengan teliti." : "Review the logic on this line carefully.";
    if (isBuggy) {
      const foundSugg = suggestions.find(s => 
        s.text.toLowerCase().includes(`line ${lineNum}`) || 
        s.text.toLowerCase().includes(`line ${lineNum}:`) ||
        s.text.toLowerCase().includes(`baris ${lineNum}`) || 
        s.text.toLowerCase().includes(`baris ${lineNum}:`)
      );
      if (foundSugg) lineSuggText = foundSugg.text;
    }

    const fixLabel = AppState.language === "id" ? "⚠ Saran Perbaikan:" : "⚠ Suggested Fix:";

    html += `
      <div class="line-row ${isBuggy ? 'buggy' : ''}" tabindex="${isBuggy ? '0' : '-1'}">
        <div class="line-num">${lineNum}</div>
        <div class="line-code">${escapeHtml(line) || "&nbsp;"}</div>
        ${isBuggy ? `
          <div class="line-tooltip buggy-tooltip" role="tooltip">
            <strong class="tooltip-warn">${fixLabel}</strong><br>
            ${formatText(lineSuggText)}
          </div>
        ` : ""}
      </div>
    `;
  });

  html += `</div>`;

  if (suggestions.length > 0) {
    const suggTitle = AppState.language === "id" ? "💡 Saran Perbaikan" : "💡 Suggested Fixes";
    html += `
      <div class="suggestion-list">
        <strong class="suggestion-list-title">${suggTitle}</strong>
        ${suggestions.map(s => `
          <div class="suggestion-item">
            <span class="suggestion-num">${s.index}.</span>
            <span class="suggestion-text">${formatText(s.text)}</span>
          </div>
        `).join("")}
      </div>
    `;
  } else if (!hasBugs) {
    const okMsg1 = AppState.language === "id" ? "✅ Tidak mendeteksi error logika yang jelas di pseudocode Anda." : "✅ No obvious issues detected in your pseudocode logic.";
    const okMsg2 = AppState.language === "id" ? "Jika Anda masih mengalami masalah, coba jelaskan tujuan kode ini lebih detail." : "If you are still experiencing a problem, try describing the intended behavior in more detail.";
    html += `
      <div class="no-errors-card">
        ${okMsg1}<br><small>${okMsg2}</small>
      </div>
    `;
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const ratingBar = createInlineRatingBar(AppState.lastResponse.feature, AppState.lastResponse.querySnippet, AppState.lastResponse.responseSnippet);
  wrapper.appendChild(ratingBar);

  out.innerHTML = "";
  out.appendChild(wrapper);
}

//===========================================================================
// FEATURE: HELP WRITE CODE (Split Panel)
//===========================================================================

async function submitHelpWrite() {
  if (AppState.isLoading) return;
  const input = DOM.inputHelpWrite?.value?.trim() || "";

  if (!input) {
    shakeElement(DOM.inputHelpWrite);
    const warn = AppState.language === "id" ? "Tolong deskripsikan algoritma yang ingin Anda buat." : "Please describe the algorithm you want to build.";
    showToast(warn, "warning");
    return;
  }

  showPanelLoading("output-help_write");
  AppState.isLoading = true;
  AppState.totalQueriesSession++;

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: FEATURES.HELP_WRITE,
        input: input,
        language: AppState.language
      }),
    });
    const data = await res.json();

    if (data.error) {
      showPanelError("output-help_write", data.error);
    } else {
      AppState.lastResponse = {
        feature: FEATURES.HELP_WRITE,
        querySnippet: input.substring(0, 200),
        responseSnippet: data.response.substring(0, 300),
        isFollowUp: false,
      };
      renderHelpWriteResponse(data.response, input);
    }
  } catch (err) {
    showPanelError("output-help_write", `Network error: ${err.message}`);
  } finally {
    AppState.isLoading = false;
  }
}

function renderHelpWriteResponse(text, originalInput) {
  const out = document.getElementById("output-help_write");
  if (!out) return;

  const tasks = [];
  const taskRegex = /TASK\|\|\|(\d+)\|\|\|([\s\S]*?)(?=TASK\|\|\||$)/gi;
  let m;
  while ((m = taskRegex.exec(text)) !== null) {
    tasks.push({ num: parseInt(m[1]), text: m[2].trim() });
  }

  const hdText = AppState.language === "id" ? "Desain Algoritma — Rincian Tugas" : "Algorithm Design — Task Breakdown";
  let html = `
    <div class="write-header">
      <span class="write-icon">🛠</span>
      <span>${hdText}</span>
    </div>
    <p class="write-description">${escapeHtml(originalInput)}</p>
    <div class="task-list">
  `;

  if (tasks.length > 0) {
    tasks.forEach((task) => {
      html += `
        <div class="task-item">
          <div class="task-num">${task.num}</div>
          <div class="task-text">${formatText(task.text)}</div>
        </div>
      `;
    });
  } else {
    html += `<div class="task-fallback">${formatText(text)}</div>`;
  }
  html += `</div>`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const ratingBar = createInlineRatingBar(AppState.lastResponse.feature, AppState.lastResponse.querySnippet, AppState.lastResponse.responseSnippet);
  wrapper.appendChild(ratingBar);

  out.innerHTML = "";
  out.appendChild(wrapper);
}

//===========================================================================
// D2: INLINE POPUP (Keyword Exploration)
//===========================================================================

async function openInlinePopup(keyword, triggerEl) {
  if (!DOM.inlinePopup || !DOM.popupBody || !DOM.popupKeyword) return;
  
  AppState.inlinePopupKeyword = keyword;
  DOM.popupKeyword.textContent = keyword;
  
  const rect = triggerEl.getBoundingClientRect();
  let left = rect.right + 12;
  let top = rect.top;
  
  if (left + 370 > window.innerWidth) left = rect.left - 380;
  if (top + 300 > window.innerHeight) top = rect.top - 280;

  DOM.inlinePopup.style.left = `${Math.max(8, left)}px`;
  DOM.inlinePopup.style.top = `${Math.max(8, top)}px`;
  DOM.inlinePopup.classList.remove("hidden");

  const loadText = AppState.language === "id" ? "Memuat..." : "Loading...";
  DOM.popupBody.innerHTML = `
    <div class="popup-loading">
      <div class="typing-dots"><span></span><span></span><span></span></div>
      <span>${loadText}</span>
    </div>
  `;

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
    DOM.popupBody.innerHTML = `<p class="popup-error">Network error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderInlinePopupContent(text, keyword) {
  if (!DOM.popupBody) return;
  
  const def = text.match(/DEF\|\|\|([\s\S]*?)(?=EXAMPLE\|\|\||RELATED\|\|\||$)/i)?.[1]?.trim() || "No definition available.";
  const example = text.match(/EXAMPLE\|\|\|([\s\S]*?)(?=RELATED\|\|\||$)/i)?.[1]?.trim() || "";
  const related = text.match(/RELATED\|\|\|(.*)/i)?.[1]?.trim() || "";

  let html = `<p class="popup-def">${formatText(def)}</p>`;
  
  if (example) {
    const exLabel = AppState.language === "id" ? "Contoh Ilustrasi:" : "Illustrative Example:";
    html += `
      <div class="popup-example-label">${exLabel}</div>
      <pre class="popup-example"><code>${escapeHtml(example)}</code></pre>
    `;
  }
  
  if (related) {
    const relLabel = AppState.language === "id" ? "Pelajari selanjutnya:" : "Explore next:";
    html += `
      <div class="popup-related">
        <span class="popup-related-label">${relLabel}</span>
        <button class="inline-keyword" onclick='openInlinePopup(${JSON.stringify(related)}, this)'>${escapeHtml(related)}</button>
      </div>
    `;
  }

  // Teks Tombol
  const askText = AppState.language === "id" ? "Tanyakan lebih dalam ➔" : "Ask about this ➔";
  const backText = AppState.language === "id" ? "Kembali" : "Back";

  html += `
    <div class="popup-actions" style="display:flex; gap:8px; margin-top:12px; border-top:1px solid var(--border); padding-top:10px;">
      <button class="btn btn-sm btn-ghost popup-close-action" onclick='closeInlinePopup()'>${backText}</button>
      <button class="btn btn-sm btn-primary popup-ask-btn" style="flex:1;" onclick='popupAskFollowUp(${JSON.stringify(keyword)})'>${askText}</button>
    </div>
  `;
  
  DOM.popupBody.innerHTML = html;
}

function popupAskFollowUp(keyword) {
  const langQuery = AppState.language === "id" ? `Bisa tolong jelaskan lebih lanjut mengenai "${keyword}"?` : `Can you explain more about "${keyword}" in the context of algorithms?`;
  closeInlinePopup();
  switchView(FEATURES.GENERAL);
  if (DOM.inputGeneral) DOM.inputGeneral.value = langQuery;
  submitFollowUp(langQuery);
}

function closeInlinePopup() {
  if (DOM.inlinePopup) DOM.inlinePopup.classList.add("hidden");
  AppState.inlinePopupKeyword = null;
}

function initInlinePopupDismiss() {
  document.addEventListener("click", (e) => {
    if (!DOM.inlinePopup) return;
    const isPopup = DOM.inlinePopup.contains(e.target);
    const isKeyword = e.target.classList.contains("inline-keyword") || e.target.classList.contains("task-keyword");
    if (!isPopup && !isKeyword) closeInlinePopup();
  });
}

//===========================================================================
// INLINE RATING BAR -> TRIGGERS MODAL
//===========================================================================

function createInlineRatingBar(feature, querySnippet, responseSnippet) {
  const bar = document.createElement("div");
  bar.className = "inline-rating-bar";
  
  const label = AppState.language === "id" ? "Seberapa berguna jawaban ini?" : "How useful was this?";
  
  bar.innerHTML = `
    <span class="inline-rating-label">${label}</span>
    <div class="inline-rating-stars">
      ${[1, 2, 3, 4, 5].map((v) => {
        // Translate emoji label if ID
        const lbl = AppState.language === "id" ? 
          {1:"Sangat Buruk", 2:"Buruk", 3:"Netral", 4:"Berguna", 5:"Sangat Berguna"}[v] : RATING_LABELS[v].label;
          
        return `
          <button class="inline-star-btn" data-value="${v}" title="${lbl}" aria-label="Rate ${v} stars">
            <span class="star-emoji">${RATING_LABELS[v].emoji}</span>
            <span class="star-text">${lbl}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;

  bar.querySelectorAll(".inline-star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rating = parseInt(btn.dataset.value);
      openRatingModal(feature, querySnippet, responseSnippet, false, rating);
    });
  });

  return bar;
}

//===========================================================================
// RATING MODAL & LOCALSTORAGE
//===========================================================================

function openRatingModal(feature, querySnippet, responseSnippet, isFollowUp = false, preselectedRating = 0) {
  if (!DOM.ratingModal) return;

  AppState.lastResponse = { feature, querySnippet, responseSnippet, isFollowUp };
  const body = DOM.ratingModal.querySelector(".modal-body");
  if (!body) return;

  const tTitle = AppState.language === "id" ? "Feedback Anda Sangat Membantu!" : "Your Feedback Helps!";
  const tFeat = AppState.language === "id" ? "Fitur:" : "Feature:";
  const tOpt = AppState.language === "id" ? "Opsional: Beritahu kami alasannya (Draf tersimpan lokal)" : "Optional: Tell us why (Your draft is saved locally)";
  const tPlace = AppState.language === "id" ? "Contoh: Penjelasannya bagus tapi kurang contoh..." : "e.g., It explained the concept clearly but lacked an example...";
  const tSkip = AppState.language === "id" ? "Lewati dulu" : "Skip for now";
  const tSub = AppState.language === "id" ? "Kirim Feedback" : "Submit Feedback";
  const tPriv = AppState.language === "id" ? "Penilaian bersifat anonim dan hanya digunakan untuk riset." : "Ratings are anonymous and used only for research.";

  body.innerHTML = `
    <h3 class="modal-title">${tTitle}</h3>
    <p class="modal-subtitle">
      ${tFeat} <strong>${FEATURE_META[feature]?.label || feature}</strong>
    </p>

    <div class="rating-stars" role="group">
      ${Object.entries(RATING_LABELS).map(([val, meta]) => {
        const lbl = AppState.language === "id" ? 
          {1:"Sangat Buruk", 2:"Buruk", 3:"Netral", 4:"Berguna", 5:"Sangat Berguna"}[val] : meta.label;
        return `
          <button class="star-btn" data-rating="${val}" title="${lbl}" onclick="selectRating(${val})">
            <span class="star-emoji">${meta.emoji}</span>
            <span class="star-num">${val}</span>
            <span class="star-label">${lbl}</span>
          </button>
        `;
      }).join("")}
    </div>

    <div class="rating-comment-wrap">
      <label for="rating-comment" class="rating-comment-label">${tOpt}</label>
      <textarea id="rating-comment" class="rating-comment" placeholder="${tPlace}" rows="3" maxlength="500"></textarea>
      <span class="char-count" id="rating-char-count">0 / 500</span>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeRatingModal()">${tSkip}</button>
      <button class="btn btn-primary" id="btn-submit-rating" onclick="submitRating()" disabled>${tSub}</button>
    </div>
    
    <p class="rating-privacy-note">${tPriv}</p>
  `;

  DOM.ratingModal.classList.remove("hidden");
  DOM.ratingModal.classList.add("visible");

  const commentBox = body.querySelector("#rating-comment");
  const countBox = body.querySelector("#rating-char-count");
  if (commentBox && countBox) {
    const draft = localStorage.getItem("sc_draft_comment") || "";
    commentBox.value = draft;
    countBox.textContent = `${draft.length} / 500`;

    commentBox.addEventListener("input", (e) => {
      localStorage.setItem("sc_draft_comment", e.target.value);
      countBox.textContent = `${e.target.value.length} / 500`;
    });
  }

  if (preselectedRating > 0 && preselectedRating <= 5) {
    selectRating(preselectedRating);
  }
}

function selectRating(value) {
  const buttons = DOM.ratingModal?.querySelectorAll(".star-btn");
  buttons?.forEach((btn) => {
    const btnVal = parseInt(btn.dataset.rating);
    btn.classList.toggle("selected", btnVal === value);
    btn.classList.toggle("dimmed", btnVal !== value);
    if (RATING_LABELS[btnVal]) {
      btn.style.borderColor = btnVal === value ? RATING_LABELS[btnVal].color : "transparent";
    }
  });

  const submitBtn = DOM.ratingModal?.querySelector("#btn-submit-rating");
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.dataset.rating = value;
  }
}

async function submitRating() {
  const submitBtn = DOM.ratingModal?.querySelector("#btn-submit-rating");
  const rating = parseInt(submitBtn?.dataset.rating);
  const commentBox = DOM.ratingModal?.querySelector("#rating-comment");
  const comment = commentBox?.value?.trim() || "";

  if (!rating || rating < 1 || rating > 5) return;

  try {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: AppState.lastResponse.feature,
        rating: rating,
        comment: comment,
        snippet: AppState.lastResponse.responseSnippet,
        query_snippet: AppState.lastResponse.querySnippet,
        is_follow_up: AppState.lastResponse.isFollowUp,
      }),
    });
    
    const msg = AppState.language === "id" ? "Feedback terkirim:" : "Feedback submitted:";
    showToast(`${msg} ${RATING_LABELS[rating].emoji}`, "success");
    
    localStorage.removeItem("sc_draft_comment");
    if(commentBox) commentBox.value = "";
    
  } catch {
    const err = AppState.language === "id" ? "Gagal mengirim rating. Coba lagi." : "Could not submit rating. Please try again.";
    showToast(err, "error");
  }

  closeRatingModal();
}

function closeRatingModal() {
  if (DOM.ratingModal) DOM.ratingModal.classList.add("hidden");
}

//===========================================================================
// WEEKLY SURVEY MODAL (RQ3)
//===========================================================================

function openSurveyModal() {
  if (!DOM.surveyModal) return;
  const body = DOM.surveyModal.querySelector(".modal-body");
  if (!body) return;

  const currentWeek = Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24 * 7));

  // Simplified for translation constraints (Hardcoded for demo mostly)
  body.innerHTML = `
    <h3 class="modal-title">Weekly Usage Survey</h3>
    <p class="modal-subtitle">Week ${currentWeek} — How are you using course resources?</p>
    
    <div class="survey-section">
      <h4 class="survey-section-title">How often did you use these resources this week?</h4>
      <p class="survey-scale-note">Scale: 1 = Never, 5 = Very Often</p>
      <div class="survey-resources">
        ${SURVEY_RESOURCES.map(r => `
          <div class="survey-resource-row">
            <label for="sr-${r.id}" class="survey-resource-label">${r.label}</label>
            <div class="survey-likert" role="group">
              ${[1, 2, 3, 4, 5].map(v => `
                <label class="likert-option">
                  <input type="radio" name="sr-${r.id}" value="${v}">
                  <span class="likert-val">${v}</span>
                </label>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    </div>

    <div class="survey-section">
      <h4 class="survey-section-title">Overall, how useful did you find StructCode this week?</h4>
      <div class="survey-likert" role="group">
        ${[1, 2, 3, 4, 5].map(v => `
          <label class="likert-option">
            <input type="radio" name="sc-useful" value="${v}">
            <span class="likert-val">${v}</span>
          </label>
        `).join("")}
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeSurveyModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitSurvey()">Submit Survey</button>
    </div>
  `;

  DOM.surveyModal.classList.remove("hidden");
  DOM.surveyModal.classList.add("visible");
}

async function submitSurvey() {
  const modal = DOM.surveyModal;
  if (!modal) return;

  const usageData = {};
  SURVEY_RESOURCES.forEach(r => {
    const checked = modal.querySelector(`input[name="sr-${r.id}"]:checked`);
    usageData[`${r.id}_usage`] = checked ? parseInt(checked.value) : null;
  });

  const usefulChecked = modal.querySelector('input[name="sc-useful"]:checked');

  try {
    await fetch("/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_number: Math.ceil((Date.now() - new Date(new Date().getFullYear(), 0, 1)) / (1000 * 60 * 60 * 24 * 7)),
        usefulness_rating: usefulChecked ? parseInt(usefulChecked.value) : null,
      }),
    });
    showToast("Survey submitted. Thank you!", "success");
  } catch {
    showToast("Could not submit survey.", "error");
  }
  closeSurveyModal();
}

function closeSurveyModal() {
  if (DOM.surveyModal) DOM.surveyModal.classList.add("hidden");
}

//===========================================================================
// ANALYTICS PANEL (Hanya untuk Teacher)
//===========================================================================

async function loadAnalytics() {
  if (!DOM.analyticsPanel) return;
  DOM.analyticsPanel.innerHTML = `
    <div class="analytics-loading">
      <div class="typing-dots"><span></span><span></span><span></span></div>
      Loading analytics...
    </div>
  `;
  DOM.analyticsPanel.classList.remove("hidden");

  try {
    const res = await fetch("/api/analytics/summary");
    const data = await res.json();
    if (res.ok) {
       renderAnalytics(data);
    } else {
       DOM.analyticsPanel.innerHTML = `<p class="analytics-error">${data.error || "Akses Ditolak."}</p>
       <button class="btn btn-sm" style="margin:auto; display:block;" onclick="DOM.analyticsPanel.classList.add('hidden')">Close</button>`;
    }
  } catch {
    DOM.analyticsPanel.innerHTML = `<p class="analytics-error">Could not load analytics.</p>`;
  }
}

function renderAnalytics(data) {
  if (!DOM.analyticsPanel) return;

  const featureRows = Object.entries(data.feature_counts || {})
    .map(([feat, count]) => {
      const meta = FEATURE_META[feat] || { icon: "•", label: feat };
      const pct = data.feature_usage_pct?.[feat] ?? 0;
      const paper = data.paper_baseline_pct?.[feat] ?? 0;
      const avgRating = data.avg_ratings?.[feat];
      return `
        <tr class="analytics-row">
          <td>${meta.icon} ${feat}</td>
          <td class="analytics-num">${count}</td>
          <td class="analytics-num">${pct.toFixed(1)}%</td>
          <td class="analytics-num analytics-dim">${paper}%</td>
          <td class="analytics-num">${avgRating ? `${avgRating} ★` : "—"}</td>
        </tr>
      `;
    }).join("");

  DOM.analyticsPanel.innerHTML = `
    <div class="analytics-header">
      <h3>📊 Usage Analytics (Kelas ${data.target_class || 'All'})</h3>
      <button class="btn btn-sm" onclick="DOM.analyticsPanel.classList.add('hidden')">Close</button>
    </div>
    <div class="analytics-summary">
      <div class="analytics-stat">
        <span class="stat-val">${data.total_queries ?? 0}</span>
        <span class="stat-label">Total Queries</span>
      </div>
      <div class="analytics-stat">
        <span class="stat-val">${data.unique_sessions_count ?? 0}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="analytics-stat">
        <span class="stat-val">${((data.error_rate ?? 0) * 100).toFixed(1)}%</span>
        <span class="stat-label">Error Rate</span>
      </div>
    </div>
    <table class="analytics-table">
      <thead>
        <tr><th>Feature</th><th>Count</th><th>Class %</th><th>Baseline %</th><th>Avg Rating</th></tr>
      </thead>
      <tbody>${featureRows}</tbody>
    </table>
  `;
}

//===========================================================================
// CHAT MESSAGE & VIEW CLEAR UTILITIES
//===========================================================================

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

function clearChat(viewId) {
  const box = document.getElementById(`chat-${viewId}`);
  if (box) {
    const txt = AppState.language === "id" ? "Chat dibersihkan. Ajukan pertanyaan baru." : "Chat cleared. Ask a new question.";
    box.innerHTML = `<div class="empty-state"><p>${txt}</p></div>`;
  }
  AppState.followUpIndex = 0;
}

function clearView(feature) {
  if (feature === FEATURES.GENERAL) {
    clearChat(FEATURES.GENERAL);
    return;
  }
  const clearMap = {
    [FEATURES.FROM_CODE]:  { ta: [DOM.codeFromCode, DOM.qFromCode], out: "output-from_code" },
    [FEATURES.EXPLAIN]:    { ta: [DOM.codeExplain], out: "output-explain" },
    [FEATURES.HELP_FIX]:   { ta: [DOM.codeHelpFix, DOM.intentHelpFix], out: "output-help_fix" },
    [FEATURES.HELP_WRITE]: { ta: [DOM.inputHelpWrite], out: "output-help_write" },
  };

  const config = clearMap[feature];
  if (!config) return;

  config.ta.forEach((t) => {
    if (t) {
      t.value = "";
      t.dispatchEvent(new Event("input"));
    }
  });

  const out = document.getElementById(config.out);
  if (out) {
    const txt = AppState.language === "id" ? "Dibersihkan. Siap untuk pertanyaan baru." : "Cleared. Ready for a new query.";
    out.innerHTML = `<div class="empty-state"><p>${txt}</p></div>`;
  }
}

function shakeElement(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
  setTimeout(() => el.classList.remove("shake"), 500);
}

//===========================================================================
// PARSING & TEXT FORMATTING UTILS
//===========================================================================

function extractSection(text, key, stopKeys = []) {
  const stopPattern = stopKeys.length > 0 ? `(?=${stopKeys.map(k => `${k}:|${k}\\|\\|\\|`).join("|")}|$)` : "(?=$)";
  const regex = new RegExp(`${key}:\\s*([\\s\\S]*?)${stopPattern}`, "i");
  return text.match(regex)?.[1]?.trim() || "";
}

function extractLine(text, key) {
  return text.match(new RegExp(`${key}:\\s*(.*)`, "i"))?.[1]?.trim() || "";
}

function formatText(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  
  // 1. Convert <kw> tags back into clickable buttons
  // Setelah di-escape oleh escapeHtml, <kw> berubah menjadi &lt;kw&gt;
  html = html.replace(/&lt;kw&gt;([\s\S]*?)&lt;\/kw&gt;/g, "<button class='inline-keyword' onclick='openInlinePopup(\"$1\", this)'>$1</button>");
  
  // 2. Code blocks & inline code
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  
  // 3. Typography
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
  return text.replace(/<\/?kw>/g, '');
}