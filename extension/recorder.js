// Tujuan file: Mengumpulkan interaksi halaman untuk fitur perekaman extension.
(() => {
  if (window.__zraLoginRecorderInstalled) return;
  window.__zraLoginRecorderInstalled = true;

  const sentFields = new Set();
  const safeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);

  function selectorFor(element) {
    if (!(element instanceof Element)) return "";
    if (element.id) {
      const selector = `#${CSS.escape(element.id)}`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const name = element.getAttribute("name");
    if (name) {
      const selector = `${element.tagName.toLowerCase()}[name=${JSON.stringify(name)}]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }
    const chain = [];
    let current = element;
    while (current && current !== document.documentElement && chain.length < 6) {
      let segment = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (sameTag.length > 1) segment += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
      }
      chain.unshift(segment);
      const candidate = chain.join(" > ");
      if (document.querySelectorAll(candidate).length === 1) return candidate;
      current = parent;
    }
    return chain.join(" > ").slice(0, 300);
  }

  function valueReference(field) {
    const type = (field.getAttribute("type") ?? "text").toLowerCase();
    const clues = `${field.getAttribute("name") ?? ""} ${field.id ?? ""} ${field.getAttribute("autocomplete") ?? ""} ${field.getAttribute("aria-label") ?? ""}`.toLowerCase();
    if (type === "password" || /pass(word)?|secret/.test(clues)) return "password";
    if (type === "email" || /email|e-mail/.test(clues)) return "email";
    if (/user(name)?|account|login/.test(clues)) return "username";
    if (/\bname\b|\bnama\b|full.?name|first.?name/.test(clues)) return "name";
    return "optional";
  }

  function record(step) {
    chrome.runtime.sendMessage({ type: "RECORDED_STEP", step });
  }

  document.addEventListener("focusin", (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const type = (field.getAttribute("type") ?? "text").toLowerCase();
    if (!["text", "email", "password", "tel", "search", "url"].includes(type)) return;
    if (field.disabled || field.readOnly || field.autocomplete === "one-time-code") return;
    const selector = selectorFor(field);
    if (!selector || sentFields.has(selector)) return;
    sentFields.add(selector);
    record({ action: "fill", selector, valueRef: valueReference(field) });
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const control = target?.closest("button, input[type=button], a");
    if (!control || (control instanceof HTMLButtonElement && control.type === "submit")) return;
    if (control instanceof HTMLAnchorElement) {
      try { if (new URL(control.href).origin !== location.origin) return; } catch { return; }
    }
    const selector = selectorFor(control);
    if (!selector) return;
    record({ action: "click", selector, label: safeText(control.getAttribute("aria-label") || control.textContent) });
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const selector = selectorFor(form);
    if (selector) record({ action: "submit", selector, submit: true });
  }, true);
})();
