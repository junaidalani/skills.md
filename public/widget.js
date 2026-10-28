(() => {
  const script = document.currentScript;
  if (!script || !(script instanceof HTMLScriptElement)) return;
  const key = script.dataset.agentCallerKey || "";
  const fallbackPhone = script.dataset.phone || "";
  const fallbackBusiness = script.dataset.business || "";
  const apiBase = new URL("/api/widget/config", script.src).toString();
  if (!key) return;

  fetch(`${apiBase}?key=${encodeURIComponent(key)}`, { mode: "cors", credentials: "omit" })
    .then((response) => response.ok ? response.json() : null)
    .then((config) => {
      if (!config || !config.active) return;
      const business = String(config.businessName || fallbackBusiness || "Call us").replace(/[<>]/g, "");
      const phone = String(config.phone || fallbackPhone || "").replace(/[^+\d]/g, "");
      const root = document.createElement("div");
      root.setAttribute("data-agent-caller-widget", "");
      const shadow = root.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `:host{all:initial} .wrap{position:fixed;right:22px;bottom:22px;z-index:2147483000;font-family:Inter,system-ui,-apple-system,sans-serif}.button{display:flex;align-items:center;gap:10px;padding:13px 17px;border:0;border-radius:4px;background:#245565;color:#fff;box-shadow:0 8px 28px rgba(20,47,62,.22);font-size:13px;font-weight:700;text-decoration:none;cursor:pointer;transition:transform .18s,background .18s}.button:hover{transform:translateY(-2px);background:#173e4c}.icon{display:grid;width:27px;height:27px;place-items:center;border:1px solid rgba(255,255,255,.4);border-radius:50%;font-size:15px}.hint{display:block;margin-top:4px;color:#d4e3e6;font-size:9px;font-weight:400}.button:focus-visible{outline:3px solid #d3a56e;outline-offset:3px}@media(max-width:600px){.wrap{right:13px;bottom:13px}.button{padding:11px 14px}}`;
      const wrap = document.createElement("div");
      wrap.className = "wrap";
      const anchor = document.createElement("a");
      anchor.className = "button";
      anchor.href = phone ? `tel:${phone}` : "#";
      anchor.setAttribute("aria-label", phone ? `Call ${business}` : `${business} phone assistant is not connected yet`);
      if (!phone) anchor.addEventListener("click", (event) => { event.preventDefault(); });
      anchor.innerHTML = `<span class="icon" aria-hidden="true">⌕</span><span>${phone ? `Call ${business}` : `Talk to ${business}`}<small class="hint">${phone ? "A real person is one tap away" : "Phone line coming soon"}</small></span>`;
      wrap.appendChild(anchor);
      shadow.append(style, wrap);
      document.body.appendChild(root);
    })
    .catch(() => {});
})();
