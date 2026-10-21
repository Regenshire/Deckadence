(() => {
  "use strict";
  const panel = document.querySelector("[data-local-mirror]");
  if (!panel) return;
  const el = name => panel.querySelector(`[data-local-ai-${name}]`);
  let state, timer, sending = false;
  async function api(method = "GET", payload, suffix = "") {
    const response = await fetch(panel.dataset.url + suffix, {
      method, headers: {"Content-Type": "application/json"},
      ...(payload ? {body: JSON.stringify(payload)} : {})
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || "Could not update local AI settings.");
    return result;
  }
  function choices(name, values, active) {
    const select = el(name);
    if (select.options.length) return;
    for (const item of values) {
      const label = name === "model" ? `${item.name} · ~${item.download_gb} GB download` : item.name;
      select.add(new Option(label, item.id));
    }
    if (active) select.value = active;
  }
  function render() {
    if (!state) return;
    const model = state.models.find(item => item.id === el("model").value);
    const hardware = state.hardware.find(item => item.id === el("hardware").value);
    const running = state.setup.running;
    const selected = state.active?.model === model.id && state.active?.hardware === hardware.id;
    el("badge").textContent = state.ready ? "Enabled" : "Optional download";
    el("model-info").textContent = model.description + " " + model.memory;
    el("hardware-info").textContent = hardware.description;
    el("size").textContent = `${model.downloaded ? "Model downloaded." : `Model download: approximately ${model.download_gb} GB.`} ${hardware.installed ? "Processor runtime installed." : "Processor libraries require an additional download and disk space."}`;
    el("license").href = model.license_url;
    const activeModel = state.models.find(item => item.id === state.active?.model);
    const activeHardware = state.hardware.find(item => item.id === state.active?.hardware);
    el("active").textContent = state.ready ? `Active: ${activeModel.name} · ${activeHardware.name}` : "Local AI is off.";
    el("status").textContent = state.setup.message ? (state.setup.message.startsWith(state.setup.stage) ? state.setup.message : `${state.setup.stage}: ${state.setup.message}`) : "Choose a model and processor to enable local generation.";
    el("install").textContent = running ? "Downloading…" : selected ? "Enabled" : model.downloaded && hardware.installed ? "Use this model and processor" : "Download & enable";
    for (const name of ["model", "hardware"]) el(name).disabled = sending || running;
    el("install").disabled = sending || running || selected;
    el("cancel").hidden = !running;
    el("cancel").disabled = sending;
    el("disable").hidden = !state.ready;
    el("disable").disabled = sending || running;
  }
  function accept(result) {
    state = result;
    const selected = state.setup.running ? state.setup : state.active || state.setup;
    choices("model", state.models, selected.model || state.default_model);
    choices("hardware", state.hardware, selected.hardware);
    render();
    clearTimeout(timer);
    if (state.setup.running) timer = setTimeout(refresh, 2000);
  }
  async function refresh() {
    try { accept(await api()); }
    catch (error) {
      el("status").textContent = error.message;
      timer = setTimeout(refresh, 5000);
    }
  }
  async function action(method, payload, suffix) {
    sending = true; render(); clearTimeout(timer);
    try { accept(await api(method, payload, suffix)); }
    catch (error) {
      el("status").textContent = error.message;
      // The action may have succeeded even if its response was lost. Read the
      // current state again; never repeat a download, cancel or disable request.
      timer = setTimeout(refresh, 5000);
    }
    finally { sending = false; if (state) {
      // Preserve a request error until the next deliberate action/status poll.
      el("install").disabled = state.setup.running || (state.active?.model === el("model").value && state.active?.hardware === el("hardware").value);
      el("model").disabled = el("hardware").disabled = state.setup.running;
      el("cancel").disabled = false; el("disable").disabled = state.setup.running;
    } }
  }
  el("model").addEventListener("change", render);
  el("hardware").addEventListener("change", render);
  el("install").addEventListener("click", () => action("POST", {model: el("model").value, hardware: el("hardware").value}));
  el("cancel").addEventListener("click", () => action("POST", undefined, "/cancel"));
  el("disable").addEventListener("click", () => action("DELETE"));
  refresh();
})();
