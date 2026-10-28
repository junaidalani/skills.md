/*!
 * Voice Sales Agent - embeddable website widget (voice + chat). No dependencies.
 *
 *   <script src="https://YOUR-SERVER/widget.js" data-title="Chat with Sam" data-color="#f59e0b" async></script>
 *
 * Optional attributes: data-server (default: where this script was loaded from), data-title,
 * data-color, data-position ("right" | "left"), data-open ("true" to open on load).
 */
(function () {
  "use strict";
  if (window.__vsaWidget) return;
  window.__vsaWidget = true;

  var script = document.currentScript || document.querySelector("script[src*='widget.js']");
  var server = (script && script.dataset.server) || (script ? new URL(script.src).origin : location.origin);
  var title = (script && script.dataset.title) || "Talk to us";
  var color = (script && script.dataset.color) || "#d97706";
  var side = (script && script.dataset.position) === "left" ? "left" : "right";
  var wsBase = server.replace(/^http/, "ws");
  var TARGET_RATE = 16000;

  var host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" +
    ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}" +
    ".fab{width:58px;height:58px;border-radius:50%;border:0;background:" + color + ";color:#fff;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.28);display:grid;place-items:center}" +
    ".fab svg{width:26px;height:26px}.fab:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #2563eb;outline-offset:2px}" +
    ".panel{display:none;position:absolute;bottom:72px;" + side + ":0;width:340px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 110px);background:#fff;color:#111;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,.3);overflow:hidden;flex-direction:column}" +
    ".panel.open{display:flex}" +
    ".head{background:" + color + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
    ".head b{font-size:15px}.head small{display:block;opacity:.9;font-size:12px;margin-top:2px}" +
    ".x{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}" +
    ".log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#faf9f7}" +
    ".m{max-width:85%;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}" +
    ".a{background:#fff;border:1px solid #e7e5e4;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".u{background:" + color + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".sys{align-self:center;font-size:12px;color:#78716c}" +
    ".bar{display:flex;gap:8px;padding:10px;border-top:1px solid #e7e5e4;background:#fff}" +
    ".bar input{flex:1;border:1px solid #d6d3d1;border-radius:10px;padding:10px;font-size:14px;min-width:0}" +
    ".bar button{border:0;border-radius:10px;padding:0 12px;cursor:pointer;font-size:14px;background:#f5f5f4;color:#111}" +
    ".bar .send{background:" + color + ";color:#fff}.bar .mic.live{background:#dc2626;color:#fff}" +
    ".status{font-size:12px;padding:4px 12px;color:#57534e;background:#fff;border-top:1px solid #f5f5f4;min-height:22px}" +
    "@media (prefers-reduced-motion:no-preference){.panel{transition:opacity .15s}}" +
    "</style>" +
    '<button class="fab" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg></button>' +
    '<div class="panel" role="dialog" aria-label="' + title.replace(/"/g, "") + '">' +
    '<div class="head"><div><b></b><small>AI assistant - you can type or talk</small></div><button class="x" aria-label="Close">&times;</button></div>' +
    '<div class="log" aria-live="polite"></div><div class="status"></div>' +
    '<div class="bar"><button class="mic" aria-label="Talk with voice" title="Talk with voice">&#127908; Talk</button>' +
    '<input type="text" maxlength="500" placeholder="Type a message..." aria-label="Message"/><button class="send">Send</button></div></div>';

  var $ = function (s) { return root.querySelector(s); };
  var fab = $(".fab"), panel = $(".panel"), log = $(".log"), input = $("input"), micBtn = $(".mic"), statusEl = $(".status");
  $(".head b").textContent = title;

  var ws = null, voice = false, ctx = null, micStream = null, node = null, nextTime = 0, sources = [], playRate = 24000;
  var lastBubble = null;

  function status(t) { statusEl.textContent = t || ""; }
  function bubble(role, text, append) {
    if (append && lastBubble && lastBubble.dataset.role === role) {
      lastBubble.textContent += " " + text;
    } else {
      var d = document.createElement("div");
      d.className = "m " + (role === "user" ? "u" : role === "sys" ? "sys" : "a");
      d.dataset.role = role;
      d.textContent = text; // textContent: never render caller/agent text as HTML
      log.appendChild(d);
      lastBubble = d;
    }
    log.scrollTop = log.scrollHeight;
  }

  function stopPlayback() {
    sources.forEach(function (s) { try { s.stop(); } catch (e) {} });
    sources = [];
    nextTime = 0;
  }

  function play(buf) {
    if (!ctx) return;
    var i16 = new Int16Array(buf.byteLength >> 1 << 1 ? buf.slice(0, buf.byteLength & ~1) : buf);
    var f32 = new Float32Array(i16.length);
    for (var i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    var ab = ctx.createBuffer(1, f32.length, playRate);
    ab.copyToChannel(f32, 0);
    var src = ctx.createBufferSource();
    src.buffer = ab;
    src.connect(ctx.destination);
    var t = Math.max(ctx.currentTime + 0.03, nextTime);
    src.start(t);
    nextTime = t + ab.duration;
    sources.push(src);
    src.onended = function () { sources = sources.filter(function (s) { return s !== src; }); };
  }

  function closeSocket() {
    if (ws) { try { ws.send(JSON.stringify({ type: "end" })); } catch (e) {} try { ws.close(); } catch (e) {} ws = null; }
  }

  function stopMic() {
    if (node) { try { node.disconnect(); } catch (e) {} node = null; }
    if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
    stopPlayback();
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    voice = false;
    micBtn.classList.remove("live");
    micBtn.innerHTML = "&#127908; Talk";
  }

  function connect(withVoice) {
    closeSocket();
    var url = wsBase + "/web/ws?voice=" + (withVoice ? "1" : "0") + "&page=" + encodeURIComponent(location.href);
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    var mine = ws;
    ws.onopen = function () { status(withVoice ? "Listening... just start talking." : "Connected."); };
    ws.onmessage = function (e) {
      if (typeof e.data !== "string") { play(e.data); return; }
      var m; try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.type === "ready") { playRate = (m.audio && m.audio.rate) || 24000; }
      else if (m.type === "transcript") { bubble(m.role, m.text, m.role === "assistant" && m.partial); }
      else if (m.type === "clear") { stopPlayback(); }
      else if (m.type === "end") { status("Conversation ended."); stopMic(); if (ws === mine) ws = null; }
    };
    ws.onclose = function () { if (ws === mine) { status("Disconnected."); stopMic(); ws = null; } };
    ws.onerror = function () { status("Could not reach the assistant."); };
  }

  var WORKLET = "class P extends AudioWorkletProcessor{constructor(o){super();this.r=o.processorOptions.target;this.acc=[];this.pos=0;}" +
    "process(i){var c=i[0][0];if(!c)return true;var ratio=sampleRate/this.r,out=[];" +
    "for(var n=0;n<c.length;n++){this.acc.push(c[n]);}" +
    "while(this.pos+ratio<=this.acc.length){var s=0,k=Math.floor(this.pos),e=Math.floor(this.pos+ratio);for(var j=k;j<e;j++)s+=this.acc[j];" +
    "var v=s/Math.max(1,e-k);v=Math.max(-1,Math.min(1,v));out.push(v<0?v*32768:v*32767);this.pos+=ratio;}" +
    "var drop=Math.floor(this.pos);if(drop>0){this.acc=this.acc.slice(drop);this.pos-=drop;}" +
    "if(out.length){var b=new Int16Array(out.length);for(var q=0;q<out.length;q++)b[q]=out[q];this.port.postMessage(b.buffer,[b.buffer]);}return true;}}" +
    "registerProcessor('vsa-down',P);";

  function startVoice() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status("Voice is not supported in this browser."); return; }
    status("Requesting microphone...");
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .then(function (stream) {
        micStream = stream;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        voice = true;
        micBtn.classList.add("live");
        micBtn.innerHTML = "&#9632; Stop";
        connect(true);
        var src = ctx.createMediaStreamSource(stream);
        var send = function (buf) { if (ws && ws.readyState === 1) ws.send(buf); };
        if (ctx.audioWorklet) {
          var url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
          return ctx.audioWorklet.addModule(url).then(function () {
            node = new AudioWorkletNode(ctx, "vsa-down", { processorOptions: { target: TARGET_RATE } });
            node.port.onmessage = function (e) { send(e.data); };
            src.connect(node);
            var mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute); mute.connect(ctx.destination);
          });
        }
        // fallback for old browsers
        var sp = ctx.createScriptProcessor(4096, 1, 1), ratio = ctx.sampleRate / TARGET_RATE;
        sp.onaudioprocess = function (ev) {
          var d = ev.inputBuffer.getChannelData(0), n = Math.floor(d.length / ratio), o = new Int16Array(n);
          for (var i = 0; i < n; i++) { var v = Math.max(-1, Math.min(1, d[Math.floor(i * ratio)])); o[i] = v < 0 ? v * 32768 : v * 32767; }
          send(o.buffer);
        };
        src.connect(sp); sp.connect(ctx.destination); node = sp;
      })
      .catch(function () { status("Microphone blocked. You can still type below."); stopMic(); });
  }

  function sendText() {
    var t = input.value.trim();
    if (!t) return;
    input.value = "";
    if (!ws || ws.readyState !== 1) connect(voice);
    var go = function () { ws.send(JSON.stringify({ type: "text", text: t })); };
    if (ws.readyState === 1) go(); else ws.addEventListener("open", go, { once: true });
  }

  function open() {
    panel.classList.add("open");
    fab.setAttribute("aria-label", "Close chat");
    if (!ws) connect(false);
    input.focus();
  }
  function close() {
    panel.classList.remove("open");
    fab.setAttribute("aria-label", "Open chat");
    stopMic();
    closeSocket();
    log.textContent = "";
    lastBubble = null;
    status("");
  }

  fab.addEventListener("click", function () { panel.classList.contains("open") ? close() : open(); });
  $(".x").addEventListener("click", close);
  $(".send").addEventListener("click", sendText);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") sendText(); });
  micBtn.addEventListener("click", function () { if (voice) { stopMic(); connect(false); } else startVoice(); });
  if (script && script.dataset.open === "true") open();
})();
