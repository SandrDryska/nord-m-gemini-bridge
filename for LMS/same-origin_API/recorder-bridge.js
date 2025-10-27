// recorder-bridge.js (Same-Origin Universal API)
// Global API: window.WebRecorder
// Modes: 'text' | 'voice' | 'mixed'

(function(){
  'use strict';

  // ======= Config =======
  const ORIGIN = '*'; // Same-origin expected. Replace with exact origin in production if needed.
  const DEFAULTS = {
    pollIntervalMs: 250,
    autosync: true,
    autosend: false, // if true, autosend on SR_Prompt change (debounced)
    mode: 'mixed',   // 'text' | 'voice' | 'mixed'
    audioFormat: 'webm',
    endpoint: 'https://nord-m-gemini.netlify.app/.netlify/functions/generate', // default to production Netlify URL; can be overridden by SR_FunctionUrl or init({ endpoint })
  };

  // Storyline variable names (with SR_ prefix)
  const VARS = {
    prompt: 'SR_Prompt',
    system: 'SR_System',
    sessionId: 'SR_SessionId',
    resetContext: 'SR_ResetContext',
    endSession: 'SR_EndSession',
    mode: 'SR_Mode', // 'text' | 'voice' | 'mixed'
    autosend: 'SR_AutoSend', // boolean
    audioFormat: 'SR_AudioFormat', // 'webm' | 'oggopus'
    modelName: 'SR_ModelName',
    modelUri: 'SR_ModelUri',
    temperature: 'SR_Temperature',
    maxTokens: 'SR_MaxTokens',
    provider: 'SR_Provider', // advisory; backend chooses provider via env for now
    debug: 'SR_Debug',
    response: 'SR_Response',       // output text (optional)
    transcript: 'SR_Transcript',   // output transcript (optional)
    statusOut: 'SR_Status',        // output status text (optional)
    functionUrl: 'SR_FunctionUrl', // absolute URL to backend function (optional)
  };

  // ======= State =======
  let cfg = { ...DEFAULTS };
  let state = {
    prompt: '',
    system: '',
    sessionId: '',
    resetContext: false,
    endSession: false,
    mode: DEFAULTS.mode,
    autosend: DEFAULTS.autosend,
    audioFormat: DEFAULTS.audioFormat,
    modelName: undefined,
    modelUri: undefined,
    temperature: undefined,
    maxTokens: undefined,
    provider: undefined,
    debug: false,
    functionUrl: undefined,
  };

  let player = null; // Storyline player (same-origin)
  let pollTimer = null;

  let mediaRecorder = null;
  let audioChunks = [];
  let recordedAudioBlob = null;
  let audioPreviewElement = null;

  // ======= Utils =======
  const log = (...args) => { if (state.debug) { try { console.log('[SR]', ...args); } catch(_) {} } };
  const status = (text) => {
    postToParent('SR_status', text);
    setVar(VARS.statusOut, String(text || ''));
  };
  const responseMsg = (payload) => {
    postToParent('SR_response', payload);
    // payload is expected to be string; coerce defensively
    try { setVar(VARS.response, String(payload ?? '')); } catch(_) {}
  };

  function postToParent(type, payload) {
    try { window.parent && window.parent.postMessage({ type, payload }, ORIGIN); } catch(_) {}
    try { window.top && window.top.postMessage({ type, payload }, ORIGIN); } catch(_) {}
  }

  function getPlayerSafe(){
    try {
      if (window.parent && typeof window.parent.GetPlayer === 'function') {
        return window.parent.GetPlayer();
      }
    } catch(_) {}
    return null;
  }

  // Cache to avoid repeatedly querying missing Storyline variables (prevents resolver spam)
  const varPresenceCache = Object.create(null); // name -> true (exists) | false (missing)

  function readVar(name){
    if (!player) return undefined;
    if (varPresenceCache[name] === false) return undefined;
    try {
      const v = player.GetVar(name);
      // Mark as missing only when truly undefined; empty string is a valid defined value
      if (typeof v === 'undefined') { varPresenceCache[name] = false; return undefined; }
      varPresenceCache[name] = true;
      return v;
    } catch(_) {
      varPresenceCache[name] = false;
      return undefined;
    }
  }

  function setVar(name, value){
    try {
      if (player && typeof player.SetVar === 'function') {
        player.SetVar(name, value);
      }
    } catch(_) {}
  }

  function toBool(v){
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '1';
    if (typeof v === 'number') return v !== 0;
    return false;
  }

  function debounce(fn, ms){
    let t;
    return function(...args){
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function generateId(prefix = 'sr'){
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return (prefix ? prefix + '-' : '') + crypto.randomUUID();
      }
    } catch(_) {}
    const rnd = Math.random().toString(36).slice(2);
    const ts = Date.now().toString(36);
    return (prefix ? prefix + '-' : '') + ts + '-' + rnd;
  }

  // Session ID helpers (avoid referencing WebRecorder inside its own initializer)
  function setSessionIdImpl(v){
    const newId = String(v || '');
    state.sessionId = newId;
    setVar(VARS.sessionId, newId);
    return newId;
  }

  function newSessionIdImpl(prefix){
    const id = generateId(prefix);
    state.sessionId = id;
    setVar(VARS.sessionId, id);
    return id;
  }

  const debouncedAutoSend = debounce(() => {
    if (state.autosend) {
      // Use direct function reference to avoid circular dependency
      send().catch(e => log('AutoSend error', e));
    }
  }, 300);

  function syncFromPlayer(){
    if (!player) return;
    const newState = { ...state };
    const vPrompt = readVar(VARS.prompt);
    const vSystem = readVar(VARS.system);
    const vSession = readVar(VARS.sessionId);
    const vReset = readVar(VARS.resetContext);
    const vEnd = readVar(VARS.endSession);
    const vMode = readVar(VARS.mode);
    const vAutosend = readVar(VARS.autosend);
    const vAudioFormat = readVar(VARS.audioFormat);
    const vModelName = readVar(VARS.modelName);
    const vModelUri = readVar(VARS.modelUri);
    const vTemp = readVar(VARS.temperature);
    const vMax = readVar(VARS.maxTokens);
    const vProvider = readVar(VARS.provider);
    const vDebug = readVar(VARS.debug);
    const vFunctionUrl = readVar(VARS.functionUrl);

    if (typeof vPrompt !== 'undefined') newState.prompt = String(vPrompt ?? '');
    if (typeof vSystem !== 'undefined') newState.system = String(vSystem ?? '');
    if (typeof vSession !== 'undefined') newState.sessionId = String(vSession ?? '');
    if (typeof vReset !== 'undefined') newState.resetContext = toBool(vReset);
    if (typeof vEnd !== 'undefined') newState.endSession = toBool(vEnd);
    if (typeof vMode !== 'undefined' && vMode) newState.mode = String(vMode);
    // Treat missing SR_AutoSend as false to avoid stale true state
    newState.autosend = toBool(vAutosend);
    if (typeof vAudioFormat !== 'undefined' && vAudioFormat) newState.audioFormat = String(vAudioFormat);
    if (typeof vModelName !== 'undefined') newState.modelName = vModelName ? String(vModelName) : undefined;
    if (typeof vModelUri !== 'undefined') newState.modelUri = vModelUri ? String(vModelUri) : undefined;
    if (typeof vTemp !== 'undefined') newState.temperature = (vTemp === '' || vTemp === null) ? undefined : Number(vTemp);
    if (typeof vMax !== 'undefined') newState.maxTokens = (vMax === '' || vMax === null) ? undefined : Number(vMax);
    if (typeof vProvider !== 'undefined') newState.provider = vProvider ? String(vProvider) : undefined;
    if (typeof vDebug !== 'undefined') newState.debug = toBool(vDebug);
    if (typeof vFunctionUrl !== 'undefined') newState.functionUrl = vFunctionUrl ? String(vFunctionUrl) : undefined;

    const promptChanged = newState.prompt !== state.prompt;
    const autosendChanged = newState.autosend !== state.autosend;
    state = newState;

    if (promptChanged) {
      log('Prompt changed ->', state.prompt);
      log('Autosend enabled:', state.autosend);
      if (state.autosend) {
        log('Triggering autosend...');
        debouncedAutoSend();
      } else {
        log('Autosend disabled, skipping');
      }
    }
    
    if (autosendChanged) {
      log('Autosend setting changed to:', state.autosend);
    }
  }

  function startPolling(){
    if (pollTimer) return;
    pollTimer = setInterval(syncFromPlayer, cfg.pollIntervalMs);
  }

  function stopPolling(){
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ======= Media =======
  async function startRecording(){
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      recordedAudioBlob = null;

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        try {
          if (audioPreviewElement) {
            audioPreviewElement.src = URL.createObjectURL(recordedAudioBlob);
            try { audioPreviewElement.currentTime = 0; } catch(_) {}
          }
        } catch(_) {}
        status('Recorded. Ready to play or send.');
      };

      mediaRecorder.start();
      status('Recording...');
    } catch (err) {
      status('Mic access error: ' + err.message);
      throw err;
    }
  }

  function stopRecording(){
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    else status('Recorder not active.');
  }

  function play(){
    if (!recordedAudioBlob) { status('No recorded audio.'); return; }
    if (!audioPreviewElement) {
      audioPreviewElement = new Audio();
      audioPreviewElement.onended = () => status('Playback stopped');
    }
    audioPreviewElement.src = URL.createObjectURL(recordedAudioBlob);
    audioPreviewElement.play();
    status('Playing...');
  }

  // ======= Backend =======
  // Waits until recordedAudioBlob is ready if we just stopped recording
  async function ensureAudioReady(){
    if (recordedAudioBlob) return true;
    try {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        log('ensureAudioReady(): stopping MediaRecorder...');
        const ready = new Promise((resolve) => {
          const prevOnStop = mediaRecorder.onstop;
          mediaRecorder.onstop = (...args) => {
            try { if (typeof prevOnStop === 'function') prevOnStop.apply(mediaRecorder, args); } catch(_) {}
            resolve(true);
          };
        });
        mediaRecorder.stop();
        await ready;
        log('ensureAudioReady(): onstop fired, blob ready?', !!recordedAudioBlob);
        return !!recordedAudioBlob;
      }
    } catch(_) {}
    return !!recordedAudioBlob;
  }

  async function send(){
    // Decide path by mode
    const mode = (state.mode || 'mixed').toLowerCase();
    // If not pure text mode, try to ensure audio is finalized
    if (mode !== 'text') {
      await ensureAudioReady();
    }
    const hasAudio = !!recordedAudioBlob;
    log('send() mode=', mode, 'hasAudio=', hasAudio);
    if (mode === 'text') return sendText();
    if (mode === 'voice') {
      if (!hasAudio) throw new Error('No recorded audio to send');
      return sendAudio();
    }
    // mixed: if audio exists -> audio, else text
    if (hasAudio) return sendAudio();
    return sendText();
  }

  async function sendText(){
    status('Sending text...');
    // Fallback to Storyline's built-in variables if SR_Prompt is empty
    let promptText = state.prompt || '';
    if (!promptText) {
      try {
        const p = getPlayerSafe();
        if (p) {
          const ur = (function(){
            try { return p.GetVar('UserResponse'); } catch(_) { return undefined; }
          })() ?? (function(){
            try { return p.GetVar('UserResponce'); } catch(_) { return undefined; }
          })();
          if (typeof ur !== 'undefined' && ur !== null) {
            promptText = String(ur);
          }
        }
      } catch(_) {}
    }
    if (!promptText || !String(promptText).trim()) {
      status('No text to send');
      throw new Error('No text to send');
    }
    const body = {
      prompt: String(promptText),
      system: state.system || '',
      sessionId: state.sessionId || undefined,
      endSession: !!state.endSession,
      resetContext: !!state.resetContext,
      modelName: state.modelName,
      modelUri: state.modelUri,
      temperature: state.temperature,
      maxTokens: state.maxTokens
      // provider: backend currently takes provider from env (AI_PROVIDER)
    };
    try{
      const url = state.functionUrl || cfg.endpoint || '/.netlify/functions/generate';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.error || ('HTTP '+res.status));
      if (data && typeof data.transcript !== 'undefined') {
        const tr = data.transcript || '';
        postToParent('SR_transcription', tr);
        setVar(VARS.transcript, String(tr));
      }
      responseMsg(data.generatedText || '');
      status('Idle');
      return data;
    }catch(e){
      status('Error: ' + e.message);
      throw e;
    }
  }

  async function sendAudio(){
    if (!recordedAudioBlob) throw new Error('No recorded audio to send');
    status('Sending audio...');

    const fd = new FormData();
    fd.append('prompt', state.prompt || '');
    fd.append('system', state.system || '');
    if (state.sessionId) fd.append('sessionId', state.sessionId);
    if (state.endSession) fd.append('endSession', 'true');
    if (state.resetContext) fd.append('resetContext', 'true');
    if (state.modelName) fd.append('modelName', state.modelName);
    if (state.modelUri) fd.append('modelUri', state.modelUri);
    if (typeof state.temperature === 'number') fd.append('temperature', String(state.temperature));
    if (typeof state.maxTokens === 'number') fd.append('maxTokens', String(state.maxTokens));
    if (state.audioFormat) fd.append('audioFormat', state.audioFormat);

    const filename = state.audioFormat === 'oggopus' ? 'recording.ogg' : 'recording.webm';
    fd.append('audio', recordedAudioBlob, filename);

    try{
      const url = state.functionUrl || cfg.endpoint || '/.netlify/functions/generate';
      const res = await fetch(url, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.error || ('HTTP '+res.status));
      if (data && typeof data.transcript !== 'undefined') {
        const tr = data.transcript || '';
        postToParent('SR_transcription', tr);
        setVar(VARS.transcript, String(tr));
      }
      responseMsg(data.generatedText || '');
      status('Idle');
      // optionally clear audio after send
      // recordedAudioBlob = null;
      return data;
    }catch(e){
      status('Error: ' + e.message);
      throw e;
    }
  }

  // ======= API =======
  const WebRecorder = {
    init(options){
      cfg = { ...DEFAULTS, ...(options || {}) };
      state.mode = cfg.mode;
      state.autosend = !!cfg.autosend;
      if (cfg.endpoint && typeof cfg.endpoint === 'string') {
        state.functionUrl = cfg.endpoint;
      }
      status('Initializing...');
      // Obtain Storyline player if same-origin
      player = getPlayerSafe();
      if (player && cfg.autosync) startPolling();
      postToParent('SR_ready', true);
      status('Idle');
      return true;
    },
    // Recording controls
    startRecording,
    stopRecording,
    play,
    // Sending
    send,
    // Direct setters (optional use)
    setPrompt(v){ 
      const oldPrompt = state.prompt;
      state.prompt = String(v || ''); 
      // Trigger autosend if prompt changed and autosend is enabled
      if (oldPrompt !== state.prompt && state.autosend) {
        debouncedAutoSend();
      }
    },
    setSystem(v){ state.system = String(v || ''); },
    setMode(v){ if (v) state.mode = String(v); },
    setSession({ id, resetContext, endSession } = {}){
      if (typeof id !== 'undefined') { setSessionIdImpl(id); }
      if (typeof resetContext !== 'undefined') state.resetContext = !!resetContext;
      if (typeof endSession !== 'undefined') state.endSession = !!endSession;
    },
    resetContext(){ state.resetContext = true; },
    endSession(){ state.endSession = true; },
    setSessionId(v){ return setSessionIdImpl(v); },
    newSessionId(prefix){ return newSessionIdImpl(prefix); },
    setProvider(v){ state.provider = v ? String(v) : undefined; }, // advisory only
    setAutosend(v){
      state.autosend = !!v;
      // keep in sync with Storyline variable to prevent autosync from overriding
      try { setVar(VARS.autosend, state.autosend); } catch(_) {}
    },
    setAudioFormat(v){ if (v) state.audioFormat = String(v); },
    debug(on){ state.debug = !!on; },
    setEndpoint(v){ state.functionUrl = v ? String(v) : undefined; },
    setAudioElement(el){ try { if (el && el.tagName === 'AUDIO') { audioPreviewElement = el; } } catch(_) {}
    },
  };

  window.WebRecorder = WebRecorder;
})();
