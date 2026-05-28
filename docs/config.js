window.CH_CONFIG = {
  PIPELINE_API: localStorage.getItem('cp_api_url') || location.origin,
  N8N_API: localStorage.getItem('ch_n8n_url') || location.origin,
  GEMINI_KEY: localStorage.getItem('ch_gemini_key') || ''
};

(function() {
  if (document.getElementById('ch-settings-modal')) return;

  var css = document.createElement('style');
  css.textContent = '#ch-gear{position:fixed;bottom:16px;right:16px;z-index:9998;width:40px;height:40px;border-radius:50%;background:#232736;border:1px solid #2d3148;color:#8b8fa8;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.3)}#ch-gear:hover{background:#2d3148;color:#818cf8}#ch-settings-modal{display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);align-items:center;justify-content:center}#ch-settings-modal.open{display:flex}#ch-settings-box{background:#1a1d27;border:1px solid #2d3148;border-radius:12px;padding:28px;width:90%;max-width:460px;color:#e4e6f0}#ch-settings-box h3{font-size:17px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}#ch-settings-box label{display:block;font-size:12px;color:#8b8fa8;margin-bottom:4px;margin-top:14px}#ch-settings-box input{width:100%;padding:9px 12px;background:#232736;border:1px solid #2d3148;border-radius:6px;color:#e4e6f0;font-size:13px;font-family:monospace}#ch-settings-box input:focus{border-color:#6366f1;outline:none}#ch-settings-box .note{font-size:11px;color:#64748b;margin-top:4px}#ch-settings-box .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}#ch-settings-box .btn-s{padding:8px 18px;border-radius:6px;border:none;font-size:13px;cursor:pointer;font-weight:500}#ch-settings-box .btn-save{background:#6366f1;color:#fff}#ch-settings-box .btn-save:hover{background:#818cf8}#ch-settings-box .btn-cancel{background:transparent;border:1px solid #2d3148;color:#8b8fa8}';
  document.head.appendChild(css);

  var gear = document.createElement('button');
  gear.id = 'ch-gear';
  gear.innerHTML = '⚙';
  gear.title = 'Settings';
  gear.onclick = function() { document.getElementById('ch-settings-modal').classList.add('open'); };
  document.body.appendChild(gear);

  var modal = document.createElement('div');
  modal.id = 'ch-settings-modal';
  modal.innerHTML = '<div id="ch-settings-box"><h3>Settings <span style="cursor:pointer;font-size:20px;color:#8b8fa8" onclick="document.getElementById(\'ch-settings-modal\').classList.remove(\'open\')">&times;</span></h3>'
    + '<label>Gemini API Key</label><input id="ch-set-gemini" type="password" placeholder="AIzaSy..." value="' + (localStorage.getItem('ch_gemini_key') || '') + '"><div class="note">Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#818cf8">aistudio.google.com/apikey</a></div>'
    + '<label>Pipeline API URL</label><input id="ch-set-pipeline" placeholder="https://..." value="' + (localStorage.getItem('cp_api_url') || '') + '"><div class="note">Leave empty to use current server</div>'
    + '<label>n8n Webhook URL</label><input id="ch-set-n8n" placeholder="https://..." value="' + (localStorage.getItem('ch_n8n_url') || '') + '"><div class="note">Leave empty to use current server</div>'
    + '<div class="actions"><button class="btn-s btn-cancel" onclick="document.getElementById(\'ch-settings-modal\').classList.remove(\'open\')">Cancel</button><button class="btn-s btn-save" onclick="chSaveSettings()">Save & Reload</button></div></div>';
  modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('open'); };
  document.body.appendChild(modal);

  window.chSaveSettings = function() {
    var gemini = document.getElementById('ch-set-gemini').value.trim();
    var pipeline = document.getElementById('ch-set-pipeline').value.trim();
    var n8n = document.getElementById('ch-set-n8n').value.trim();
    if (gemini) localStorage.setItem('ch_gemini_key', gemini); else localStorage.removeItem('ch_gemini_key');
    if (pipeline) localStorage.setItem('cp_api_url', pipeline); else localStorage.removeItem('cp_api_url');
    if (n8n) localStorage.setItem('ch_n8n_url', n8n); else localStorage.removeItem('ch_n8n_url');
    location.reload();
  };

  window.chRequireGeminiKey = function() {
    if (window.CH_CONFIG.GEMINI_KEY) return true;
    document.getElementById('ch-settings-modal').classList.add('open');
    document.getElementById('ch-set-gemini').focus();
    return false;
  };
})();
