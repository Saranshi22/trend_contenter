/**
 * Trend Contenter - Interactive Frontend Controller
 */

// Base API Prefix (Version 1)
const API_BASE = '/api/v1';

// Application State
const state = {
  currentTab: 'concepts',
  selectedStyle: 'photorealistic',
  editorMode: 'replace_background',
  brushActive: false,
  brushSize: 25,
  isDrawing: false,
  currentImageBase64: null,
  currentMaskBase64: null,
  lastEditedImageBase64: null,
  videoImageBase64: null,
  currentVideoUrl: null,
  briefFileBase64: null,
  briefFileMimeType: null,
  briefFileName: null,
  generatedConcepts: [],
  apiKeys: {
    gemini: localStorage.getItem('cfg_gemini_key') || '',
    gcse_key: localStorage.getItem('cfg_gcse_key') || '',
    gcse_id: localStorage.getItem('cfg_gcse_id') || '',
    serpapi: localStorage.getItem('cfg_serpapi_key') || ''
  }
};

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    lucide.createIcons();
  }

  // Populate settings inputs
  document.getElementById('cfg-gemini-key').value = state.apiKeys.gemini;
  document.getElementById('cfg-gcse-key').value = state.apiKeys.gcse_key;
  document.getElementById('cfg-gcse-id').value = state.apiKeys.gcse_id;
  document.getElementById('cfg-serpapi-key').value = state.apiKeys.serpapi;

  // Initialize Canvas
  initCanvas();

  // Setup Style Preset Chips
  document.querySelectorAll('.style-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedStyle = chip.dataset.style;
    });
  });

  // Check backend health
  checkHealth();

  // Setup Brief Dropzone
  const briefDropzone = document.getElementById('brief-dropzone');
  if (briefDropzone) {
    briefDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      briefDropzone.classList.add('border-amber-500', 'bg-amber-950/20');
    });
    briefDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      briefDropzone.classList.remove('border-amber-500', 'bg-amber-950/20');
    });
    briefDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      briefDropzone.classList.remove('border-amber-500', 'bg-amber-950/20');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        processBriefFile(e.dataTransfer.files[0]);
      }
    });
  }
});

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bg = type === 'error' ? 'bg-rose-900/90 border-rose-700 text-rose-200' :
             type === 'success' ? 'bg-emerald-900/90 border-emerald-700 text-emerald-200' :
             'bg-slate-800/90 border-slate-700 text-slate-200';

  toast.className = `${bg} pointer-events-auto border px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl flex items-center space-x-2 transition-all transform duration-300 translate-y-2 opacity-0`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Show/Hide Loading Overlay
function setLoading(show, title = 'Processing with Gemini...', desc = 'Executing operation') {
  const overlay = document.getElementById('loading-overlay');
  if (show) {
    document.getElementById('loading-title').innerText = title;
    document.getElementById('loading-desc').innerText = desc;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// Navigation Tab Switcher
function switchTab(tab) {
  state.currentTab = tab;
  ['concepts', 'generate', 'video', 'editor', 'recommend', 'settings'].forEach(t => {
    const navBtn = document.getElementById(`nav-tab-${t}`);
    const viewSec = document.getElementById(`view-${t}`);
    if (navBtn && viewSec) {
      if (t === tab) {
        navBtn.classList.add('active');
        viewSec.classList.remove('hidden');
      } else {
        navBtn.classList.remove('active');
        viewSec.classList.add('hidden');
      }
    }
  });
  if (window.lucide) lucide.createIcons();
}

// Check Backend Connection & API Keys
async function checkHealth() {
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    if (data.status === 'online') {
      const hasKey = data.has_gemini_key || !!state.apiKeys.gemini;
      statusText.innerText = hasKey ? 'Gemini 3.1 Pro Image Ready' : 'Demo Mode (No API Key)';
      statusBadge.className = 'flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs';
    }
  } catch (err) {
    statusText.innerText = 'Backend Offline';
    statusBadge.className = 'flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-800 text-xs text-rose-300';
  }
}

// Save Settings
function saveSettings() {
  state.apiKeys.gemini = document.getElementById('cfg-gemini-key').value.trim();
  state.apiKeys.gcse_key = document.getElementById('cfg-gcse-key').value.trim();
  state.apiKeys.gcse_id = document.getElementById('cfg-gcse-id').value.trim();
  state.apiKeys.serpapi = document.getElementById('cfg-serpapi-key').value.trim();

  localStorage.setItem('cfg_gemini_key', state.apiKeys.gemini);
  localStorage.setItem('cfg_gcse_key', state.apiKeys.gcse_key);
  localStorage.setItem('cfg_gcse_id', state.apiKeys.gcse_id);
  localStorage.setItem('cfg_serpapi_key', state.apiKeys.serpapi);

  showToast('Settings & API Credentials saved successfully!', 'success');
  checkHealth();
}

async function testConnection() {
  saveSettings();
  showToast('Checking API connection status...', 'info');
  await checkHealth();
}

// ==============================================================
// TAB 1: GENERATOR CONTROLLER
// ==============================================================

async function enhanceGeneratePrompt() {
  const promptInput = document.getElementById('gen-prompt');
  const promptVal = promptInput.value.trim();
  if (!promptVal) {
    showToast('Please enter a brief prompt to enhance!', 'error');
    return;
  }

  setLoading(true, 'Enhancing Prompt with Gemini 2.0...', 'Optimizing lighting, details, textures, and composition');
  try {
    const res = await fetch(`${API_BASE}/enhance-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptVal,
        style_preset: state.selectedStyle,
        api_key: state.apiKeys.gemini || null
      })
    });
    const data = await res.json();
    if (data.enhanced_prompt) {
      promptInput.value = data.enhanced_prompt;
      showToast('Prompt enhanced with Gemini!', 'success');
    }
  } catch (err) {
    showToast('Enhancement error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

async function executeGenerate() {
  const promptInput = document.getElementById('gen-prompt');
  const promptVal = promptInput.value.trim();
  if (!promptVal) {
    showToast('Please enter an image prompt!', 'error');
    return;
  }

  const selectedModel = document.getElementById('gen-model')?.value || 'gemini-3.1-pro-image';
  const aspectRatio = document.getElementById('gen-aspect-ratio').value;
  const count = parseInt(document.getElementById('gen-count').value);
  const negPrompt = document.getElementById('gen-negative-prompt').value.trim() || null;

  setLoading(true, `Synthesizing with ${selectedModel}...`, `Generating ${count} image variation(s) (${aspectRatio})`);

  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptVal,
        aspect_ratio: aspectRatio,
        number_of_images: count,
        negative_prompt: negPrompt,
        style_preset: state.selectedStyle,
        model: selectedModel,
        api_key: state.apiKeys.gemini || null
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Generation request failed');
    }

    const data = await res.json();
    renderGenerationResults(data);
    showToast('Image(s) generated successfully!', 'success');
  } catch (err) {
    showToast('Generation error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderGenerationResults(data) {
  const sec = document.getElementById('gen-results-section');
  const grid = document.getElementById('gen-results-grid');
  const badge = document.getElementById('gen-model-badge');

  badge.innerText = `Model: ${data.model_used}`;
  grid.innerHTML = '';

  data.images.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col group';
    card.innerHTML = `
      <div class="relative bg-slate-950 overflow-hidden aspect-square flex items-center justify-center">
        <img src="${item.url || item.image_base64}" alt="Generated ${idx+1}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105">
      </div>
      <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
        <p class="text-xs text-slate-400 line-clamp-2">${item.enhanced_prompt || data.prompt}</p>
        <div class="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
          <button onclick="downloadImage('${item.url || item.image_base64}', 'gemini_${item.id}.png')" class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center justify-center gap-1 transition-all" title="Download">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Save</span>
          </button>
          <button onclick="transferToEditor('${item.image_base64}')" class="p-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg flex items-center justify-center gap-1 transition-all" title="Edit in Smart Editor">
            <i data-lucide="layers" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Edit</span>
          </button>
          <button onclick="searchSimilarFromPrompt('${encodeURIComponent(data.prompt)}')" class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center justify-center gap-1 transition-all" title="Search Similar Recommendations">
            <i data-lucide="search" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">Similar</span>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  sec.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

// ==========================================
// AI VIDEO STUDIO (Google Veo)
// ==========================================

function appendVideoPreset(preset) {
  const p = document.getElementById('video-prompt');
  p.value = p.value ? `${p.value.trim()}, ${preset}` : preset;
  p.focus();
}

function handleVideoImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    state.videoImageBase64 = e.target.result;
    const box = document.getElementById('video-img-preview-box');
    box.innerHTML = `<img src="${state.videoImageBase64}" class="w-full h-full object-cover">`;
    document.getElementById('btn-clear-video-img').classList.remove('hidden');
    showToast('Input image loaded for Image-to-Video generation!', 'info');
  };
  reader.readAsDataURL(file);
}

function clearVideoInputImage() {
  state.videoImageBase64 = null;
  document.getElementById('video-file-input').value = '';
  document.getElementById('video-img-preview-box').innerHTML = '<i data-lucide="image" class="w-6 h-6"></i>';
  document.getElementById('btn-clear-video-img').classList.add('hidden');
  if (window.lucide) lucide.createIcons();
}

async function enhanceVideoPrompt() {
  const promptInput = document.getElementById('video-prompt');
  const promptVal = promptInput.value.trim();
  if (!promptVal) {
    showToast('Enter a video concept to enhance!', 'error');
    return;
  }

  setLoading(true, 'Enhancing Video Cinematography...', 'Gemini is choreographing camera motion & lighting');

  try {
    const res = await fetch(`${API_BASE}/enhance-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Cinematic video scene: ${promptVal}. Choreograph camera motion, pacing, depth of field, and lighting for Google Veo.`,
        api_key: state.apiKeys.gemini || null
      })
    });
    if (!res.ok) throw new Error('Failed to enhance prompt');
    const data = await res.json();
    promptInput.value = data.enhanced_prompt;
    showToast('Video prompt enhanced with cinematography details!', 'success');
  } catch (err) {
    promptInput.value = `${promptVal}, cinematic camera movement, smooth 24fps motion, volumetric studio lighting, 4k ultra-detailed`;
    showToast('Using prompt expansion preset', 'info');
  } finally {
    setLoading(false);
  }
}

async function executeGenerateVideo() {
  const promptInput = document.getElementById('video-prompt');
  const promptVal = promptInput.value.trim();
  if (!promptVal && !state.videoImageBase64) {
    showToast('Please enter a video prompt or upload an image!', 'error');
    return;
  }

  const modelVal = document.getElementById('video-model')?.value || 'veo-2.0-generate-001';
  const aspectRatio = document.getElementById('video-aspect-ratio').value;
  const duration = parseInt(document.getElementById('video-duration').value) || 5;
  const negPrompt = document.getElementById('video-negative-prompt').value.trim() || null;

  setLoading(true, `Generating Video with Google Veo (${modelVal})...`, `Synthesizing ${duration}s clip (${aspectRatio}). Rendering may take a moment...`);

  try {
    const res = await fetch(`${API_BASE}/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptVal || 'Cinematic camera pan and ambient motion',
        image_base64: state.videoImageBase64 || null,
        aspect_ratio: aspectRatio,
        duration_seconds: duration,
        fps: duration > 6 ? 30 : 24,
        negative_prompt: negPrompt,
        model: modelVal,
        api_key: state.apiKeys.gemini || null
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Video generation failed');
    }

    const data = await res.json();
    renderVideoResult(data);
    showToast('Veo Video ready!', 'success');
  } catch (err) {
    showToast('Video generation error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderVideoResult(data) {
  state.currentVideoUrl = data.video_url;
  const sec = document.getElementById('video-results-section');
  const player = document.getElementById('video-player');
  const source = document.getElementById('video-source');
  const badge = document.getElementById('video-model-badge');
  const promptDisp = document.getElementById('video-prompt-display');
  const metaDisp = document.getElementById('video-meta-display');
  const downloadBtn = document.getElementById('video-download-btn');

  badge.innerText = `Model: ${data.model_used}`;
  source.src = data.video_url;
  player.load();
  player.play().catch(() => {});

  promptDisp.innerText = data.enhanced_prompt || data.prompt;
  metaDisp.innerText = `Aspect: ${data.aspect_ratio} • Duration: ${data.duration_seconds}s • FPS: ${data.fps}fps • ID: ${data.id}`;
  downloadBtn.href = data.video_url;

  sec.classList.remove('hidden');
  sec.scrollIntoView({ behavior: 'smooth' });
  if (window.lucide) lucide.createIcons();
}

function captureVideoFrameToEditor() {
  const video = document.getElementById('video-player');
  if (!video || !video.videoWidth) {
    showToast('Video is not loaded yet!', 'error');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const frameB64 = canvas.toDataURL('image/png');
  transferToEditor(frameB64);
  showToast('Current video frame sent to Smart Editor!', 'success');
}

function downloadImage(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'generated_image.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function transferToEditor(b64) {
  loadImageIntoCanvas(b64);
  switchTab('editor');
  showToast('Image loaded into Smart Editor canvas!', 'info');
}

function searchSimilarFromPrompt(encodedPrompt) {
  const prompt = decodeURIComponent(encodedPrompt);
  document.getElementById('rec-prompt').value = prompt;
  switchTab('recommend');
  executeRecommendation();
}

// ==============================================================
// TAB 2: SMART IMAGE EDITOR (Canvas & AI Operations)
// ==============================================================

let baseCanvas, maskCanvas, baseCtx, maskCtx;

function initCanvas() {
  baseCanvas = document.getElementById('base-canvas');
  maskCanvas = document.getElementById('mask-canvas');
  baseCtx = baseCanvas.getContext('2d');
  maskCtx = maskCanvas.getContext('2d');

  // Drawing event listeners for mask
  maskCanvas.addEventListener('mousedown', startDrawing);
  maskCanvas.addEventListener('mousemove', draw);
  maskCanvas.addEventListener('mouseup', stopDrawing);
  maskCanvas.addEventListener('mouseleave', stopDrawing);

  maskCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = maskCanvas.getBoundingClientRect();
    startDrawing({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false });

  maskCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    draw({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false });

  maskCanvas.addEventListener('touchend', stopDrawing);
}

function setEditorMode(mode) {
  state.editorMode = mode;
  document.querySelectorAll('.edit-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  const promptField = document.getElementById('field-prompt-container');
  const targetField = document.getElementById('field-target-container');
  const typoField = document.getElementById('field-typography-container');
  const promptLabel = document.getElementById('editor-prompt-label');
  const promptInput = document.getElementById('editor-prompt');
  const btnText = document.getElementById('btn-edit-text');

  if (mode === 'replace_background') {
    promptField.classList.remove('hidden');
    targetField.classList.add('hidden');
    typoField.classList.add('hidden');
    promptLabel.innerText = 'New Background Description';
    promptInput.placeholder = 'E.g., Sunset over Scandinavian coastal fjord with soft warm reflections...';
    btnText.innerText = 'Execute Background Replacement';
  } else if (mode === 'remove_object') {
    promptField.classList.remove('hidden');
    targetField.classList.remove('hidden');
    typoField.classList.add('hidden');
    promptLabel.innerText = 'Removal / Inpaint Context';
    promptInput.placeholder = 'E.g., Inpaint cleanly blending surrounding textures and light...';
    btnText.innerText = 'Erase & Inpaint Object';
  } else if (mode === 'add_object') {
    promptField.classList.remove('hidden');
    targetField.classList.remove('hidden');
    typoField.classList.add('hidden');
    promptLabel.innerText = 'Object to Insert & Context';
    promptInput.placeholder = 'E.g., Add a sleek minimalist ceramic coffee mug with soft shadow...';
    btnText.innerText = 'Insert Object';
  } else if (mode === 'modify_object') {
    promptField.classList.remove('hidden');
    targetField.classList.add('hidden');
    typoField.classList.add('hidden');
    promptLabel.innerText = 'Modification & Style Change';
    promptInput.placeholder = 'E.g., Change jacket to emerald green velvet, enhance dramatic rim lighting...';
    btnText.innerText = 'Execute Object Modification';
  } else if (mode === 'add_text') {
    promptField.classList.add('hidden');
    targetField.classList.add('hidden');
    typoField.classList.remove('hidden');
    btnText.innerText = 'Apply Stylized Typography Overlay';
  }
}

function toggleBrushMode() {
  state.brushActive = !state.brushActive;
  const label = document.getElementById('brush-toggle-label');
  const bar = document.getElementById('brush-size-bar');
  if (state.brushActive) {
    label.innerText = 'Mask Brush: ON';
    bar.classList.remove('hidden');
    maskCanvas.classList.remove('pointer-events-none');
    showToast('Brush active: Paint over image to create custom edit mask', 'info');
  } else {
    label.innerText = 'Mask Brush: OFF';
    bar.classList.add('hidden');
    maskCanvas.classList.add('pointer-events-none');
  }
}

function clearMask() {
  if (maskCtx && maskCanvas) {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    state.currentMaskBase64 = null;
    showToast('Mask cleared', 'info');
  }
}

function getCanvasPos(e) {
  const rect = maskCanvas.getBoundingClientRect();
  const scaleX = maskCanvas.width / rect.width;
  const scaleY = maskCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function startDrawing(e) {
  if (!state.brushActive || !state.currentImageBase64) return;
  state.isDrawing = true;
  const pos = getCanvasPos(e);
  maskCtx.beginPath();
  maskCtx.moveTo(pos.x, pos.y);
}

function draw(e) {
  if (!state.isDrawing || !state.brushActive) return;
  const pos = getCanvasPos(e);
  const size = parseInt(document.getElementById('brush-size').value) || 25;
  maskCtx.lineTo(pos.x, pos.y);
  maskCtx.strokeStyle = 'rgba(236, 72, 153, 0.7)'; // Translucent pink for user mask visualization
  maskCtx.lineWidth = size;
  maskCtx.lineCap = 'round';
  maskCtx.lineJoin = 'round';
  maskCtx.stroke();
}

function stopDrawing() {
  if (state.isDrawing) {
    state.isDrawing = false;
    exportBinaryMask();
  }
}

function exportBinaryMask() {
  // Generate binary B&W mask (255 white=edit, 0 black=preserve)
  const temp = document.createElement('canvas');
  temp.width = maskCanvas.width;
  temp.height = maskCanvas.height;
  const ctx = temp.getContext('2d');

  // Fill black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, temp.width, temp.height);

  // Draw user strokes in white
  const imgData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const targetData = ctx.getImageData(0, 0, temp.width, temp.height);

  for (let i = 0; i < imgData.data.length; i += 4) {
    if (imgData.data[i + 3] > 20) { // Alpha threshold
      targetData.data[i] = 255;
      targetData.data[i + 1] = 255;
      targetData.data[i + 2] = 255;
      targetData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(targetData, 0, 0);
  state.currentMaskBase64 = temp.toDataURL('image/png');
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    loadImageIntoCanvas(evt.target.result);
  };
  reader.readAsDataURL(file);
}

function loadSampleToEditor() {
  const sampleUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80';
  // Fetch sample as base64
  setLoading(true, 'Loading Sample Image...', 'Fetching high-resolution asset');
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || 800;
    c.height = img.naturalHeight || 800;
    c.getContext('2d').drawImage(img, 0, 0);
    const b64 = c.toDataURL('image/png');
    loadImageIntoCanvas(b64);
    setLoading(false);
    showToast('Sample sneaker product loaded into editor!', 'success');
  };
  img.onerror = () => {
    setLoading(false);
    showToast('Failed to load sample image directly.', 'error');
  };
  img.src = sampleUrl;
}

function loadImageIntoCanvas(b64) {
  state.currentImageBase64 = b64;
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    baseCanvas.width = w;
    baseCanvas.height = h;
    maskCanvas.width = w;
    maskCanvas.height = h;

    baseCtx.clearRect(0, 0, w, h);
    baseCtx.drawImage(img, 0, 0);

    maskCtx.clearRect(0, 0, w, h);
    state.currentMaskBase64 = null;

    document.getElementById('editor-empty-state').classList.add('hidden');
    document.getElementById('canvas-container').classList.remove('hidden');
    document.getElementById('canvas-info').innerText = `${w} × ${h} px`;

    // Reset comparison
    document.getElementById('comparison-section').classList.add('hidden');
  };
  img.src = b64;
}

async function executeEdit() {
  if (!state.currentImageBase64) {
    showToast('Please upload or load an image first!', 'error');
    return;
  }

  // Handle precision typography overlay mode
  if (state.editorMode === 'add_text') {
    const text = document.getElementById('typo-text').value.trim();
    if (!text) {
      showToast('Please enter text to add!', 'error');
      return;
    }
    const fontSize = parseInt(document.getElementById('typo-size').value) || 52;
    const fontFam = document.getElementById('typo-font').value;
    const color = document.getElementById('typo-color').value;
    const pos = document.getElementById('typo-position').value;
    const shadow = document.getElementById('typo-shadow').checked;
    const badge = document.getElementById('typo-badge').checked;

    setLoading(true, 'Rendering Stylized Typography...', 'Compositing text layer with shadow & badges');
    try {
      const res = await fetch(`${API_BASE}/add-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: state.currentImageBase64,
          text: text,
          font_size: fontSize,
          font_family: fontFam,
          font_color: color,
          position: pos,
          shadow: shadow,
          background_box: badge
        })
      });
      const data = await res.json();
      displayEditResult(data.image_base64);
      showToast('Typography added successfully!', 'success');
    } catch (err) {
      showToast('Typography error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
    return;
  }

  // AI Editing Operations (replace_background, remove_object, add_object, modify_object)
  const selectedModel = document.getElementById('editor-model')?.value || 'gemini-3.1-pro-image';
  const promptVal = document.getElementById('editor-prompt').value.trim();
  const targetObj = document.getElementById('editor-target-object').value.trim() || null;

  setLoading(true, `Executing ${state.editorMode.replace('_', ' ')} with ${selectedModel}...`, 'Multimodal composition & lighting synthesis');

  try {
    const res = await fetch(`${API_BASE}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: state.currentImageBase64,
        mask_base64: state.currentMaskBase64 || null,
        operation: state.editorMode,
        prompt: promptVal || 'Enhance scene',
        target_object: targetObj,
        replacement_prompt: promptVal,
        model: selectedModel,
        api_key: state.apiKeys.gemini || null
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || 'Editing failed');
    }

    const data = await res.json();
    if (data.images && data.images.length > 0) {
      displayEditResult(data.images[0].image_base64);
      showToast(data.message || 'Edit completed!', 'success');
    }
  } catch (err) {
    showToast('Edit error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function displayEditResult(editedB64) {
  state.lastEditedImageBase64 = editedB64;
  const compSection = document.getElementById('comparison-section');
  const compOrig = document.getElementById('comp-original');
  const compEdit = document.getElementById('comp-edited');

  compOrig.src = state.currentImageBase64;
  compEdit.src = editedB64;
  compSection.classList.remove('hidden');

  compSection.scrollIntoView({ behavior: 'smooth' });
}

function adoptEditedImage() {
  if (state.lastEditedImageBase64) {
    loadImageIntoCanvas(state.lastEditedImageBase64);
    showToast('Edited image is now the base canvas for subsequent operations!', 'success');
  }
}

function downloadEditedResult() {
  if (state.lastEditedImageBase64) {
    downloadImage(state.lastEditedImageBase64, 'edited_result.png');
  }
}

async function analyzeCurrentImage() {
  if (!state.currentImageBase64) {
    showToast('Load an image to analyze with Gemini Vision!', 'error');
    return;
  }

  setLoading(true, 'Gemini 2.0 Multimodal Scene Analysis...', 'Identifying objects, lighting, background, and editing ideas');
  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: state.currentImageBase64,
        api_key: state.apiKeys.gemini || null
      })
    });
    const data = await res.json();

    const card = document.getElementById('gemini-analysis-card');
    document.getElementById('analysis-desc').innerText = data.description || '';
    const suggList = document.getElementById('analysis-suggestions');
    suggList.innerHTML = '';
    (data.edit_suggestions || []).forEach(s => {
      const li = document.createElement('li');
      li.innerText = s;
      suggList.appendChild(li);
    });

    card.classList.remove('hidden');
    card.scrollIntoView({ behavior: 'smooth' });
    showToast('Gemini vision analysis complete!', 'success');
  } catch (err) {
    showToast('Analysis error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ==============================================================
// TAB 3: IMAGE RECOMMENDATION ENGINE & RERANKER CONTROLLER
// ==============================================================

function setRecQuickPrompt(text) {
  document.getElementById('rec-prompt').value = text;
}

async function executeRecommendation() {
  const promptInput = document.getElementById('rec-prompt');
  const promptVal = promptInput.value.trim();
  if (!promptVal) {
    showToast('Please enter a recommendation search prompt!', 'error');
    return;
  }

  const provider = document.getElementById('rec-provider').value;
  const reranker = document.getElementById('rec-reranker').value;
  const count = parseInt(document.getElementById('rec-count').value) || 9;

  setLoading(true, 'Searching & Multimodal Reranking...', `Querying images & computing relevance with ${reranker.toUpperCase()} reranker`);

  try {
    const res = await fetch(`${API_BASE}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptVal,
        num_results: count,
        search_provider: provider,
        reranker_model: reranker,
        gemini_api_key: state.apiKeys.gemini || null,
        serpapi_key: state.apiKeys.serpapi || null,
        google_cse_key: state.apiKeys.gcse_key || null,
        google_cse_id: state.apiKeys.gcse_id || null
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Recommendation search failed');
    }

    const data = await res.json();
    renderRecommendationResults(data);
    showToast(`Recommended ${data.recommendations.length} images ranked by ${data.reranker_model}!`, 'success');
  } catch (err) {
    showToast('Recommendation error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderRecommendationResults(data) {
  const sec = document.getElementById('rec-results-section');
  const grid = document.getElementById('rec-results-grid');
  const countBadge = document.getElementById('rec-count-badge');
  const rerankBadge = document.getElementById('rec-reranker-badge');

  countBadge.innerText = `${data.recommendations.length} of ${data.total_candidates} candidates ranked`;
  rerankBadge.innerText = `Reranker: ${data.reranker_model.toUpperCase()}`;
  grid.innerHTML = '';

  data.recommendations.forEach((item, idx) => {
    const scorePct = Math.round(item.overall_score * 100);
    const relPct = Math.round(item.relevance_score * 100);
    const aesPct = Math.round((item.aesthetic_score || 0.8) * 100);

    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col group hover:border-indigo-500/50 transition-all';
    card.innerHTML = `
      <div class="relative bg-slate-950 aspect-[4/3] overflow-hidden">
        <img src="${item.thumbnail_url || item.image_url}" alt="${item.title}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onerror="this.src='https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=400&q=80'">

        <!-- Rank & Score Badges -->
        <div class="absolute top-3 left-3 flex items-center space-x-1.5">
          <span class="px-2 py-0.5 rounded-lg bg-black/75 backdrop-blur-md text-white text-xs font-bold border border-white/10">#${idx+1}</span>
          <span class="px-2 py-0.5 rounded-lg bg-emerald-500/90 text-slate-950 text-xs font-black shadow-lg">${scorePct}% Match</span>
        </div>

        <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-slate-300 text-[10px] backdrop-blur-sm">
          ${item.source_domain || 'Web'}
        </div>
      </div>

      <div class="p-4 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <h4 class="text-sm font-semibold text-slate-100 line-clamp-1">${item.title}</h4>
          <p class="text-xs text-slate-400 mt-1 line-clamp-2">${item.snippet || item.reasoning}</p>
        </div>

        <!-- Metric Breakdown Bars -->
        <div class="space-y-1.5 pt-1 border-t border-slate-800 text-[11px]">
          <div class="flex items-center justify-between text-slate-400">
            <span>Prompt Fidelity</span>
            <span class="font-medium text-blue-400">${relPct}%</span>
          </div>
          <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
            <div class="bg-blue-500 h-full rounded-full" style="width: ${relPct}%"></div>
          </div>

          <div class="flex items-center justify-between text-slate-400 pt-0.5">
            <span>Aesthetics & Quality</span>
            <span class="font-medium text-purple-400">${aesPct}%</span>
          </div>
          <div class="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
            <div class="bg-purple-500 h-full rounded-full" style="width: ${aesPct}%"></div>
          </div>
        </div>

        ${item.reasoning ? `<div class="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[11px] text-indigo-300 italic">“${item.reasoning}”</div>` : ''}

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <a href="${item.image_url}" target="_blank" rel="noopener noreferrer" class="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg flex items-center justify-center gap-1 transition-all">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            <span>Original</span>
          </a>
          <button onclick="loadRemoteImageToEditor('${item.image_url}')" class="p-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg flex items-center justify-center gap-1 transition-all">
            <i data-lucide="layers" class="w-3.5 h-3.5"></i>
            <span>Use in Editor</span>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  sec.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  sec.scrollIntoView({ behavior: 'smooth' });
}

function loadRemoteImageToEditor(url) {
  setLoading(true, 'Transferring Image to Editor...', 'Loading high-res image');
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const b64 = c.toDataURL('image/png');
    loadImageIntoCanvas(b64);
    switchTab('editor');
    setLoading(false);
    showToast('Recommended image loaded into Smart Editor canvas!', 'success');
  };
  img.onerror = () => {
    setLoading(false);
    showToast('Failed to load image directly due to CORS; please download and upload manually.', 'error');
  };
  img.src = url;
}

// ==============================================================
// CONCEPT GENERATION STUDIO CONTROLLER
// ==============================================================

function processBriefFile(file) {
  if (!file) return;
  state.briefFileName = file.name;
  state.briefFileMimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'text/markdown');

  const reader = new FileReader();
  reader.onload = (e) => {
    state.briefFileBase64 = e.target.result;
    const chip = document.getElementById('brief-file-chip');
    const chipName = document.getElementById('brief-file-name');
    if (chip && chipName) {
      chipName.innerText = file.name;
      chip.classList.remove('hidden');
    }
    showToast(`Loaded ${file.name} for concept analysis`, 'success');
  };
  reader.readAsDataURL(file);
}

function handleBriefFileUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (file) {
    processBriefFile(file);
  }
}

function clearBriefFile(event) {
  if (event) event.stopPropagation();
  state.briefFileBase64 = null;
  state.briefFileMimeType = null;
  state.briefFileName = null;
  const input = document.getElementById('brief-file-input');
  if (input) input.value = '';
  const chip = document.getElementById('brief-file-chip');
  if (chip) chip.classList.add('hidden');
  showToast('Brief file cleared', 'info');
}

function clearBriefText() {
  const txt = document.getElementById('brief-textarea');
  if (txt) txt.value = '';
}

async function loadSampleBrief() {
  try {
    setLoading(true, 'Loading Sample Brief...', 'Fetching CBD Ground opportunity dossier');
    const res = await fetch(`${API_BASE}/sample-brief`);
    const data = await res.json();
    setLoading(false);
    if (data.brief_markdown) {
      document.getElementById('brief-textarea').value = data.brief_markdown;
      showToast('Loaded CBD Ground organizing dossier sample brief!', 'success');
    }
  } catch (err) {
    setLoading(false);
    showToast('Failed to load sample brief: ' + err.message, 'error');
  }
}

async function executeGenerateConcepts() {
  const briefText = document.getElementById('brief-textarea').value.trim();
  const fileBase64 = state.briefFileBase64;

  if (!briefText && !fileBase64) {
    showToast('Please upload a brief file (PDF/Markdown) or paste brief text first.', 'error');
    return;
  }

  const mediaMix = document.getElementById('concept-media-mix').value;
  const targetCount = parseInt(document.getElementById('concept-count').value) || 4;

  setLoading(true, 'Analyzing Brief with Gemini...', 'Extracting audience friction points, determining platform suitability & crafting prompts');

  try {
    const payload = {
      file_base64: fileBase64 || null,
      file_mime_type: state.briefFileMimeType || null,
      brief_text: briefText || null,
      media_mix: mediaMix,
      target_count: targetCount,
      api_key: state.apiKeys.gemini || null
    };

    const res = await fetch(`${API_BASE}/generate-concepts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      throw new Error(data.detail || 'Failed to generate content concepts');
    }

    renderConceptResults(data);
    showToast(`Generated ${data.concepts.length} platform-optimized content concepts!`, 'success');
  } catch (err) {
    setLoading(false);
    showToast(`Concept generation failed: ${err.message}`, 'error');
  }
}

function getPlatformMeta(platform) {
  const p = (platform || '').toLowerCase();
  if (p.includes('reel') || p.includes('instagram')) {
    return { name: platform, icon: 'instagram', color: 'from-pink-500/20 to-purple-500/20 text-pink-300 border-pink-500/30' };
  } else if (p.includes('short') || p.includes('youtube')) {
    return { name: platform, icon: 'youtube', color: 'from-red-500/20 to-rose-500/20 text-red-300 border-red-500/30' };
  } else if (p.includes('linkedin')) {
    return { name: platform, icon: 'linkedin', color: 'from-blue-600/20 to-sky-600/20 text-sky-300 border-sky-500/30' };
  } else if (p.includes('tiktok')) {
    return { name: platform, icon: 'video', color: 'from-cyan-500/20 to-teal-500/20 text-cyan-300 border-cyan-500/30' };
  } else if (p.includes('x') || p.includes('twitter')) {
    return { name: platform, icon: 'twitter', color: 'from-slate-600/20 to-zinc-600/20 text-slate-300 border-slate-500/30' };
  }
  return { name: platform || 'Social Media', icon: 'share-2', color: 'from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/30' };
}

function renderConceptResults(data) {
  state.generatedConcepts = data.concepts || [];

  const resContainer = document.getElementById('concept-results-container');
  const titleEl = document.getElementById('concept-brief-title');
  const summaryEl = document.getElementById('concept-brief-summary');
  const audienceEl = document.getElementById('concept-target-audience');
  const frictionEl = document.getElementById('concept-friction-points');
  const modelBadgeEl = document.getElementById('concept-model-badge');
  const gridEl = document.getElementById('concepts-grid');

  if (titleEl) titleEl.innerText = data.brief_title || 'Analyzed Content Opportunity';
  if (summaryEl) summaryEl.innerText = data.brief_summary || '';
  if (audienceEl) audienceEl.innerText = data.target_audience || 'General Audience';
  if (modelBadgeEl) modelBadgeEl.innerText = data.model_used || 'Gemini 3.1 & Veo 2';

  if (frictionEl) {
    frictionEl.innerHTML = '';
    (data.key_friction_points || []).forEach(fp => {
      const chip = document.createElement('span');
      chip.className = 'px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-300 flex items-center gap-1.5';
      chip.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> ${escapeHtml(fp)}`;
      frictionEl.appendChild(chip);
    });
  }

  if (gridEl) {
    gridEl.innerHTML = '';
    (data.concepts || []).forEach((c, idx) => {
      const isVideo = (c.media_type || '').toLowerCase() === 'video';
      const platMeta = getPlatformMeta(c.target_platform);
      const promptToUse = isVideo ? (c.video_prompt || c.visual_prompt) : (c.image_prompt || c.visual_prompt);

      const card = document.createElement('div');
      card.className = 'bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl hover:border-slate-700 transition-all';
      card.innerHTML = `
        <div class="space-y-4">
          <!-- Top Badges -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <span class="px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${platMeta.color} border flex items-center gap-1.5">
              <i data-lucide="${platMeta.icon}" class="w-3.5 h-3.5"></i>
              <span>${escapeHtml(platMeta.name)}</span>
            </span>

            <div class="flex items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${isVideo ? 'bg-pink-950/60 border-pink-700/60 text-pink-300' : 'bg-blue-950/60 border-blue-700/60 text-blue-300'} flex items-center gap-1">
                <i data-lucide="${isVideo ? 'video' : 'image'}" class="w-3 h-3"></i>
                <span>${isVideo ? 'Veo Video' : 'Gemini Image'}</span>
              </span>
              <span class="px-2 py-0.5 rounded bg-slate-800 text-[11px] text-slate-400 border border-slate-700 font-mono">
                ${escapeHtml(c.aspect_ratio || (isVideo ? '9:16' : '1:1'))}
              </span>
            </div>
          </div>

          <!-- Title & Format -->
          <div>
            <h4 class="text-base font-bold text-white">${idx + 1}. ${escapeHtml(c.title)}</h4>
            <p class="text-xs text-amber-300/90 font-medium mt-0.5">${escapeHtml(c.format || '')}</p>
          </div>

          <!-- Friction Point Hook -->
          <div class="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <i data-lucide="zap" class="w-3.5 h-3.5 text-amber-400"></i>
              <span>Audience Friction & Hook</span>
            </div>
            <p class="text-xs text-slate-200"><strong>Hook:</strong> “${escapeHtml(c.hook)}”</p>
            ${c.friction_point_addressed ? `<p class="text-[11px] text-slate-400"><strong>Friction:</strong> ${escapeHtml(c.friction_point_addressed)}</p>` : ''}
            ${c.platform_optimization_rationale ? `<p class="text-[11px] text-indigo-300"><strong>Optimization Rationale:</strong> ${escapeHtml(c.platform_optimization_rationale)}</p>` : ''}
          </div>

          <!-- Visual Narrative Description -->
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
              <i data-lucide="eye" class="w-3.5 h-3.5 text-indigo-400"></i>
              <span>Visual Narrative & Scene</span>
            </div>
            <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(c.visual_description || '')}</p>
          </div>

          ${c.camera_motion ? `
          <div class="p-2 rounded-lg bg-pink-950/30 border border-pink-900/40 text-[11px] text-pink-200 flex items-center gap-1.5">
            <i data-lucide="camera" class="w-3.5 h-3.5 text-pink-400 shrink-0"></i>
            <span><strong>Camera Choreography:</strong> ${escapeHtml(c.camera_motion)}</span>
          </div>` : ''}

          <!-- Generation Prompt Box -->
          <div class="space-y-1">
            <div class="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <span class="flex items-center gap-1">
                <i data-lucide="terminal" class="w-3.5 h-3.5 text-emerald-400"></i>
                <span>${isVideo ? 'Google Veo Prompt' : 'Gemini 3.1 Pro Image Prompt'}</span>
              </span>
              <button onclick="copyToClipboard('${escapeAttr(promptToUse)}', 'Prompt')" class="text-slate-400 hover:text-emerald-300 text-[11px] flex items-center gap-1">
                <i data-lucide="copy" class="w-3 h-3"></i> Copy
              </button>
            </div>
            <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300/90 leading-relaxed max-h-36 overflow-y-auto">
              ${escapeHtml(promptToUse)}
            </div>
          </div>
        </div>

        <!-- Transfer & Action Buttons -->
        <div class="pt-4 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
          ${isVideo ? `
            <button onclick="transferConceptToVideo('${escapeAttr(promptToUse)}', '${escapeAttr(c.aspect_ratio || '9:16')}', '${escapeAttr(c.camera_motion || '')}')" class="w-full py-2 px-3 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-pink-600/20 flex items-center justify-center gap-1.5 transition-all">
              <i data-lucide="video" class="w-3.5 h-3.5"></i>
              <span>Send to Video Studio (Veo)</span>
            </button>
          ` : `
            <button onclick="transferConceptToGenerator('${escapeAttr(promptToUse)}', '${escapeAttr(c.aspect_ratio || '1:1')}')" class="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-600/20 flex items-center justify-center gap-1.5 transition-all">
              <i data-lucide="wand-2" class="w-3.5 h-3.5"></i>
              <span>Send to Image Studio (Gemini)</span>
            </button>
          `}
        </div>
      `;
      gridEl.appendChild(card);
    });
  }

  resContainer.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
  resContainer.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

function copyToClipboard(text, label = 'Content') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied to clipboard!`, 'success');
  }).catch(() => {
    showToast('Failed to copy to clipboard', 'error');
  });
}

function transferConceptToGenerator(prompt, aspectRatio) {
  switchTab('generate');
  const promptEl = document.getElementById('gen-prompt');
  if (promptEl) promptEl.value = prompt;

  const ratioEl = document.getElementById('gen-aspect-ratio');
  if (ratioEl && aspectRatio) {
    for (let i = 0; i < ratioEl.options.length; i++) {
      if (ratioEl.options[i].value === aspectRatio) {
        ratioEl.selectedIndex = i;
        break;
      }
    }
  }

  const genView = document.getElementById('view-generate');
  if (genView) genView.scrollIntoView({ behavior: 'smooth' });

  showToast('Concept prompt transferred to Image Studio!', 'success');
}

function transferConceptToVideo(prompt, aspectRatio, cameraMotion) {
  switchTab('video');
  const promptEl = document.getElementById('video-prompt');
  if (promptEl) {
    let fullPrompt = prompt;
    if (cameraMotion && !fullPrompt.toLowerCase().includes(cameraMotion.toLowerCase())) {
      fullPrompt = `${fullPrompt}, ${cameraMotion}`;
    }
    promptEl.value = fullPrompt;
  }

  const ratioEl = document.getElementById('video-aspect-ratio');
  if (ratioEl && aspectRatio) {
    for (let i = 0; i < ratioEl.options.length; i++) {
      if (ratioEl.options[i].value === aspectRatio) {
        ratioEl.selectedIndex = i;
        break;
      }
    }
  }

  const vidView = document.getElementById('view-video');
  if (vidView) vidView.scrollIntoView({ behavior: 'smooth' });

  showToast('Concept prompt transferred to Video Studio (Veo)!', 'success');
}

