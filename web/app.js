(() => {
  const WEBHOOK_URL = "https://n8n.srv923061.hstgr.cloud/webhook/8b934e29-d0d9-4621-ba27-0f42f947028d";

  const $ = (id) => document.getElementById(id);
  const html = document.documentElement;

  /* ---------- i18n ---------- */
  const I18N = window.I18N;
  const getLang = () => html.getAttribute("data-lang") || "en";
  const t = (key) => (I18N[getLang()] && I18N[getLang()][key]) || key;

  function applyI18n() {
    const lang = getLang();
    html.setAttribute("lang", lang === "zh" ? "zh-CN" : "en");
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = I18N[lang][key];
      if (val !== undefined) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = I18N[lang][key];
      if (val !== undefined) el.setAttribute("placeholder", val);
    });
    refreshFormDefaults();
  }

  /** Only overwrite a field if it was empty or matched the *other* language default. */
  function refreshFormDefaults() {
    const lang = getLang();
    const other = lang === "en" ? "zh" : "en";
    const pairs = [
      ["target_audience", "default_audience"],
      ["tone", "default_tone"],
      ["platform", "default_platform"],
    ];
    for (const [id, key] of pairs) {
      const el = $(id);
      if (!el) continue;
      const current = el.value.trim();
      if (current === "" || current === I18N[other][key]) {
        el.value = I18N[lang][key];
      }
    }
  }

  /* ---------- theme + language toggles ---------- */
  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      html.setAttribute("data-theme", saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      html.setAttribute("data-theme", prefersDark ? "dark" : "light");
    }
  }
  function initLang() {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "zh") {
      html.setAttribute("data-lang", saved);
    } else {
      html.setAttribute("data-lang", (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en");
    }
  }
  $("theme-toggle").addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  });
  $("lang-toggle").addEventListener("click", () => {
    const next = getLang() === "en" ? "zh" : "en";
    html.setAttribute("data-lang", next);
    localStorage.setItem("lang", next);
    applyI18n();
  });

  /* ---------- user id ---------- */
  function getUserId() {
    let id = localStorage.getItem("user_id");
    if (!id) {
      const uuid = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
      id = "web-" + uuid;
      localStorage.setItem("user_id", id);
    }
    return id;
  }

  /* ---------- rendering helpers ---------- */
  function renderMarkdown(md) {
    if (!md) return "";
    const rawHtml = marked.parse(String(md), { gfm: true, breaks: true });
    return DOMPurify.sanitize(rawHtml);
  }

  function fillList(ulId, items) {
    const ul = $(ulId);
    ul.innerHTML = "";
    const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim() !== "") : [];
    if (arr.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-placeholder";
      li.textContent = t("none");
      ul.appendChild(li);
      return;
    }
    for (const item of arr) {
      const li = document.createElement("li");
      li.innerHTML = renderMarkdown(String(item));
      ul.appendChild(li);
    }
  }

  function setConfidenceBadge(score) {
    const badge = $("confidence-badge");
    if (typeof score !== "number" || Number.isNaN(score)) {
      badge.textContent = "—";
      badge.className = "badge";
      return;
    }
    badge.textContent = `${t("confidence")}: ${score}`;
    badge.className = "badge " + (score >= 90 ? "good" : score >= 75 ? "ok" : "bad");
  }

  /* ---------- pipeline status animation ---------- */
  let elapsedTimer = null;
  let stepTimer = null;
  function startPipeline() {
    $("status-card").classList.remove("hidden");
    $("report").classList.add("hidden");
    $("error-card").classList.add("hidden");

    const steps = ["research", "writer", "qa"];
    let idx = 0;
    document.querySelectorAll(".pipeline-step").forEach((el) => { el.classList.remove("active", "done"); });
    document.querySelector('.pipeline-step[data-step="research"]').classList.add("active");

    stepTimer = setInterval(() => {
      const cur = document.querySelector(`.pipeline-step[data-step="${steps[idx]}"]`);
      if (cur) { cur.classList.remove("active"); cur.classList.add("done"); }
      idx = Math.min(idx + 1, steps.length - 1);
      const next = document.querySelector(`.pipeline-step[data-step="${steps[idx]}"]`);
      if (next && !next.classList.contains("done")) next.classList.add("active");
    }, 18000);

    const start = Date.now();
    $("elapsed-time").textContent = "0";
    elapsedTimer = setInterval(() => {
      $("elapsed-time").textContent = String(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }
  function stopPipeline(markDone) {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (markDone) {
      document.querySelectorAll(".pipeline-step").forEach((el) => {
        el.classList.remove("active");
        el.classList.add("done");
      });
    }
    $("status-card").classList.add("hidden");
  }

  /* ---------- form submit ---------- */
  let currentAbort = null;
  let lastMarkdown = "";
  let lastTopic = "";

  $("research-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const topic = $("topic").value.trim();
    if (!topic) {
      showError(t("err_empty_topic"));
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      user_id: getUserId(),
      topic,
      target_audience: $("target_audience").value.trim() || t("default_audience"),
      tone: $("tone").value.trim() || t("default_tone"),
      platform: $("platform").value.trim() || t("default_platform"),
    };
    lastTopic = topic;

    $("submit-btn").disabled = true;
    $("cancel-btn").classList.remove("hidden");
    $("error-card").classList.add("hidden");
    startPipeline();

    currentAbort = new AbortController();
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: currentAbort.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const data = Array.isArray(raw) ? raw[0] : raw;
      renderReport(data);
      stopPipeline(true);
      $("report").classList.remove("hidden");
    } catch (err) {
      if (err.name === "AbortError") {
        showError(t("err_aborted"));
      } else if (err instanceof TypeError) {
        showError(t("err_network"));
      } else {
        showError(`${t("err_bad_response")} (${err.message || err})`);
      }
      stopPipeline(false);
    } finally {
      $("submit-btn").disabled = false;
      $("cancel-btn").classList.add("hidden");
      currentAbort = null;
    }
  });

  $("cancel-btn").addEventListener("click", () => {
    if (currentAbort) currentAbort.abort();
  });
  $("retry-btn").addEventListener("click", () => {
    $("error-card").classList.add("hidden");
    $("research-form").requestSubmit();
  });

  function showError(msg) {
    $("error-msg").textContent = msg;
    $("error-card").classList.remove("hidden");
  }

  /* ---------- render the full report ---------- */
  function renderReport(data) {
    if (!data || typeof data !== "object") {
      showError(t("err_bad_response"));
      return;
    }

    const research = data.research || {};
    const draft = data.draft || {};
    const qa = data.qa || {};
    const qaFinal = qa.final || {};
    const finalText = data.final_content || qaFinal.content || draft.content || "";
    const score = (typeof data.confidence_score === "number") ? data.confidence_score : qa.confidence_score;

    // Research
    $("research-summary").innerHTML = renderMarkdown(research.research_summary || "");
    fillList("research-facts", research.facts);
    fillList("research-sources", research.sources);
    fillList("research-needs", research.needs_verification);

    // Draft
    $("draft-content").innerHTML = renderMarkdown(draft.content || "");
    $("draft-chars").textContent = String(
      typeof draft.character_count === "number" ? draft.character_count : (draft.content || "").length
    );
    fillList("draft-risk", draft.risk_flags);

    // QA
    setConfidenceBadge(score);
    fillList("qa-issues", qa.issues_found);
    fillList("qa-factflags", qa.fact_check_flags);
    fillList("qa-improvements", qa.improvements_made);

    // Final
    $("final-content").innerHTML = renderMarkdown(finalText);

    lastMarkdown = buildMarkdown({ data, research, draft, qa, score, finalText });
  }

  function mdList(items) {
    const arr = Array.isArray(items) ? items.filter((x) => x != null && String(x).trim() !== "") : [];
    if (arr.length === 0) return `_${t("none")}_\n`;
    return arr.map((x) => `- ${String(x).replace(/\n+/g, " ")}`).join("\n") + "\n";
  }

  function buildMarkdown({ data, research, draft, qa, score, finalText }) {
    const req = data.request || {};
    const lang = getLang();
    const hdr = (en, zh) => (lang === "zh" ? zh : en);
    const lines = [];
    lines.push(`# ${lastTopic}`);
    lines.push("");
    if (req.target_audience || req.tone || req.platform) {
      lines.push(`> **${hdr("Audience", "受众")}:** ${req.target_audience || "—"}  `);
      lines.push(`> **${hdr("Tone", "语气")}:** ${req.tone || "—"}  `);
      lines.push(`> **${hdr("Platform", "平台")}:** ${req.platform || "—"}  `);
      lines.push(`> **${hdr("Generated", "生成时间")}:** ${req.timestamp || new Date().toISOString()}`);
      lines.push("");
    }
    lines.push(`## 🔎 ${t("sec_research")}`);
    if (research.research_summary) { lines.push(research.research_summary); lines.push(""); }
    lines.push(`### ${t("sub_facts")}`);   lines.push(mdList(research.facts));
    lines.push(`### ${t("sub_sources")}`); lines.push(mdList(research.sources));
    lines.push(`### ${t("sub_needs_verification")}`); lines.push(mdList(research.needs_verification));
    lines.push(`## ✍️ ${t("sec_draft")}`);
    lines.push(draft.content || "");
    lines.push("");
    lines.push(`### ${t("sub_risk_flags")}`); lines.push(mdList(draft.risk_flags));
    lines.push(`## ✅ ${t("sec_qa")}`);
    if (typeof score === "number") lines.push(`**${t("confidence")}:** ${score}`);
    lines.push("");
    lines.push(`### ${t("sub_issues")}`);       lines.push(mdList(qa.issues_found));
    lines.push(`### ${t("sub_fact_flags")}`);   lines.push(mdList(qa.fact_check_flags));
    lines.push(`### ${t("sub_improvements")}`); lines.push(mdList(qa.improvements_made));
    lines.push(`## 📄 ${t("sec_final")}`);
    lines.push(finalText || "");
    return lines.join("\n");
  }

  /* ---------- copy / download ---------- */
  $("copy-md-btn").addEventListener("click", async () => {
    if (!lastMarkdown) return;
    try {
      await navigator.clipboard.writeText(lastMarkdown);
      const fb = $("copy-feedback");
      fb.textContent = t("copied");
      fb.classList.add("show");
      setTimeout(() => fb.classList.remove("show"), 1800);
    } catch {
      // Fallback: create a textarea
      const ta = document.createElement("textarea");
      ta.value = lastMarkdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  });

  $("download-md-btn").addEventListener("click", () => {
    if (!lastMarkdown) return;
    const blob = new Blob([lastMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (lastTopic || "nike-research").replace(/[^\w一-龥-]+/g, "_").slice(0, 60);
    a.href = url;
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* ---------- init ---------- */
  initTheme();
  initLang();
  applyI18n();
})();
