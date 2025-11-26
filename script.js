function showToast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--success)"></i> ${msg}`;
    document.getElementById('toast-container').appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

function openCameraSettings() {
    const modal = document.getElementById('cameraSettingsModal');
    const host = document.getElementById('cameraSettingsHost');
    if (!modal || !host) return;

    // Lazily resolve the shared sidebar in case it wasn't ready at script load
    if (!settingsSidebar) {
        settingsSidebar = document.querySelector('.edit-sidebar');
        sidebarOriginalParent = settingsSidebar ? settingsSidebar.parentElement : null;
    }

    if (settingsSidebar && settingsSidebar.parentElement !== host) {
        host.appendChild(settingsSidebar);
        settingsSidebar.classList.add('camera-mode');
    }
    modal.classList.add('active');
}

function closeCameraSettings() {
    const modal = document.getElementById('cameraSettingsModal');
    if (!modal || !settingsSidebar || !sidebarOriginalParent) return;
    sidebarOriginalParent.appendChild(settingsSidebar);
    settingsSidebar.classList.remove('camera-mode');
    modal.classList.remove('active');
}

function toggleDate() {
    const cb = document.getElementById('includeDateCheck');
    includeDate = !!(cb && cb.checked);
    triggerRender();
}

// Color helpers
function setPresetColor(val) {
    if (!val) return;
    const frameInput = document.getElementById('frameColor');
    if (frameInput) frameInput.value = val;
    triggerRender();
}

function setTextColorPreset(val) {
    if (!val) return;
    textColor = val;
    const input = document.getElementById('textColor');
    if (input) input.value = val;
    triggerRender();
}

function handleTextColorInput(val) {
    textColor = val;
    triggerRender();
}

function triggerRender() {
    if (!capturedPhotos.length) return;
    renderCanvas();
    renderCapturePreview();
}

function showConfirm(msg, onConfirm) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'confirm-toast';
    toast.innerHTML = `
                <div style="color:white; font-weight:600;">${msg}</div>
                <div class="confirm-actions">
                    <button class="btn btn-primary" style="padding:6px 16px; font-size:0.8rem;" id="confirmYes">Yes</button>
                    <button class="btn btn-outline" style="padding:6px 16px; font-size:0.8rem;" id="confirmNo">No</button>
                </div>
            `;
    container.appendChild(toast);
    toast.querySelector('#confirmYes').onclick = () => { onConfirm(); toast.remove(); };
    toast.querySelector('#confirmNo').onclick = () => toast.remove();
}

function toggleAccordion(element) {
    const currentGroup = element.closest('.control-group');
    const container = element.closest('.edit-sidebar');
    const allGroups = container.querySelectorAll('.control-group.open');
    allGroups.forEach(group => { if (group !== currentGroup) group.classList.remove('open'); });
    currentGroup.classList.toggle('open');
}

function toggleHomeAccordion(element) {
    const currentGroup = element.closest('.control-group');
    const container = element.closest('.home-layout-panel');
    if (!container) return;
    const openGroups = container.querySelectorAll('.control-group.open');
    openGroups.forEach(group => { if (group !== currentGroup) group.classList.remove('open'); });
    currentGroup.classList.toggle('open');
}

const DB_NAME = 'PhotoBoothProDB';
const DB_VERSION = 2;
let db;
let customBorders = { strip: null, grid: null, horizontal: null };
let borderFileNames = { strip: "No file chosen", grid: "No file chosen", horizontal: "No file chosen" };

function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    };
    request.onsuccess = (e) => {
        db = e.target.result;
        loadGallery();
        renderBorderManager();
    };
}
initDB();

let stream = null;
let capturedPhotos = [];
let currentTimer = 3;
let isShooting = false;
let abortShooting = false;
let currentLayout = 'strip';
let retakeIndex = null;
let currentSessionId = null;
let saveTimer = null;
let includeDate = true;
let textColor = '#ffffff';
let settingsSidebar = null;
let sidebarOriginalParent = null;
let editorOrigin = 'camera';

const video = document.getElementById('webcam');
const countdownDisplay = document.getElementById('countdownDisplay');
const statusText = document.getElementById('statusText');
const flash = document.getElementById('flash');
const finalCanvas = document.getElementById('finalCanvas');
const ctx = finalCanvas.getContext('2d');
const shutterBtn = document.getElementById('shutterBtn');
const timerButtons = document.getElementById('timerButtons');
const cameraToggle = document.getElementById('cameraToggle');
// capture reference to shared settings sidebar (script is at end of body, so DOM is ready)
settingsSidebar = document.querySelector('.edit-sidebar');
sidebarOriginalParent = settingsSidebar ? settingsSidebar.parentElement : null;

function mountHomeSidebarIfDesktop() {
    const host = document.getElementById('cameraSettingsPanelHost');
    const isDesktop = window.innerWidth > 900;
    const home = document.getElementById('view-home');
    const homeActive = home && home.classList.contains('active');
    if (homeActive && host && isDesktop && settingsSidebar && settingsSidebar.parentElement !== host) {
        host.appendChild(settingsSidebar);
        settingsSidebar.classList.add('camera-mode');
    }
}

window.addEventListener('resize', () => {
    mountHomeSidebarIfDesktop();
});

mountHomeSidebarIfDesktop();

async function startCamera() {
    try {
        if (stream) return;
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" } });
        video.srcObject = stream;
        video.play();
        document.getElementById('cameraError').style.display = 'none';
        cameraToggle.checked = true;
    } catch (err) {
        console.error("Camera Error:", err);
        document.getElementById('cameraError').style.display = 'flex';
        cameraToggle.checked = false;
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
    }
    cameraToggle.checked = false;
    document.getElementById('cameraError').style.display = 'flex';
}

function toggleCameraState() {
    if (cameraToggle.checked) startCamera();
    else stopCamera();
}

function updateHeaderBackButton(show) {
    const btn = document.getElementById('headerToggleBtn');
    if (!btn) return;
    btn.style.display = show ? 'inline-flex' : 'none';
}

function toggleGallery() {
    const home = document.getElementById('view-home');
    const mobileBtn = document.querySelector('.mobile-gallery-btn');
    if (home.classList.contains('active')) {
        // Camera → Gallery
        switchView('gallery');
        stopCamera();
        updateHeaderBackButton(true);
        if (mobileBtn) {
            mobileBtn.innerHTML = '<i class="fa-solid fa-arrow-left"></i><span style="margin-left:6px;">Back</span>';
        }
    } else {
        // Gallery → Camera
        switchView('home');
        if (cameraToggle.checked) startCamera();
        updateHeaderBackButton(false);
        if (mobileBtn) {
            mobileBtn.innerHTML = '<i class="fa-solid fa-images"></i><span style="margin-left:6px;">Gallery</span>';
        }
    }
}

function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    if (viewName === 'gallery') {
        loadGallery();
        if (settingsSidebar && sidebarOriginalParent && settingsSidebar.parentElement !== sidebarOriginalParent) {
            sidebarOriginalParent.appendChild(settingsSidebar);
        }
        if (settingsSidebar) settingsSidebar.classList.remove('camera-mode');
    } else if (viewName === 'home') {
        const host = document.getElementById('cameraSettingsPanelHost');
        const isDesktop = window.innerWidth > 900;
        if (host && isDesktop && settingsSidebar && settingsSidebar.parentElement !== host) {
            host.appendChild(settingsSidebar);
        }
        if (isDesktop && settingsSidebar) settingsSidebar.classList.add('camera-mode');
    }
}

// Shared layout switcher for both home panel and editor sidebar
function setLayout(type, el) {
    currentLayout = type;

    // Sync active state across all layout buttons
    document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    }

    // Only render the full canvas when we actually have photos
    if (capturedPhotos.length) {
        renderCanvas();
    }

    // Keep the camera live preview in sync once photos exist
    renderCapturePreview();
}

function setTimer(seconds) {
    if (isShooting) return;
    currentTimer = seconds;
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.includes(seconds + 's')) btn.classList.add('active');
    });
}

function handleShutter() {
    if (!stream) { startCamera(); return; }
    if (isShooting && !retakeIndex) stopShooting();
    else if (retakeIndex !== null) startReshootSingle();
    else startPhotoSequence();
}

function stopShooting() {
    abortShooting = true;
    isShooting = false;
    shutterBtn.classList.remove('stop');
    timerButtons.classList.remove('disabled');
    statusText.style.display = 'none';
    countdownDisplay.classList.remove('active');
    showToast("Session Cancelled", "info");
}

async function startReshootSingle() {
    if (isShooting) return;
    isShooting = true;
    document.getElementById('retakeIndicator').style.display = 'block';
    document.getElementById('retakeNum').innerText = retakeIndex + 1;
    await runCountdown(currentTimer);
    const newImg = await takePhoto();
    capturedPhotos[retakeIndex] = newImg;
    renderCapturePreview();
    isShooting = false;
    retakeIndex = null;
    document.getElementById('retakeIndicator').style.display = 'none';
    document.getElementById('modeText').innerHTML = '4 Shots';
    openEditor();
}

async function startPhotoSequence() {
    if (isShooting) return;
    isShooting = true;
    abortShooting = false;
    currentSessionId = Date.now();
    capturedPhotos = [];

    statusText.style.display = 'block';
    shutterBtn.classList.add('stop');
    timerButtons.classList.add('disabled');

    for (let i = 1; i <= 4; i++) {
        if (abortShooting) break;
        statusText.innerText = `Photo ${i} of 4`;
        await runCountdown(currentTimer);
        if (abortShooting) break;
        const img = await takePhoto();
        capturedPhotos.push(img);
        renderCapturePreview();

        if (i < 4) {
            if (abortShooting) break;
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    shutterBtn.classList.remove('stop');
    timerButtons.classList.remove('disabled');
    statusText.style.display = 'none';
    isShooting = false;
    if (!abortShooting) openEditor();
}

function runCountdown(seconds) {
    return new Promise(resolve => {
        let count = seconds;
        countdownDisplay.innerText = count;
        countdownDisplay.classList.add('active');
        const interval = setInterval(() => {
            if (abortShooting) {
                clearInterval(interval);
                countdownDisplay.classList.remove('active');
                resolve(); return;
            }
            count--;
            if (count > 0) countdownDisplay.innerText = count;
            else {
                clearInterval(interval);
                countdownDisplay.innerText = "CHEESE!";
                setTimeout(() => { countdownDisplay.classList.remove('active'); resolve(); }, 500);
            }
        }, 1000);
    });
}

function takePhoto() {
    return new Promise(resolve => {
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 150);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth; tempCanvas.height = video.videoHeight;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.translate(tempCanvas.width, 0); tCtx.scale(-1, 1);
        tCtx.drawImage(video, 0, 0);
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = tempCanvas.toDataURL('image/jpeg');
    });
}

function openEditor() {
    editorOrigin = document.getElementById('view-gallery')?.classList.contains('active') ? 'gallery' : 'camera';
    stopCamera();
    document.getElementById('resultModal').classList.add('active');
    renderBorderManager();
    renderCanvas();
}

function closeEditor() {
    document.getElementById('resultModal').classList.remove('active');
    autoSaveSession();
    showToast('Changes saved');
    if (retakeIndex !== null) {
        retakeIndex = null;
        document.getElementById('retakeIndicator').style.display = 'none';
        document.getElementById('modeText').innerHTML = '4 Shots';
        startCamera();
    } else if (editorOrigin === 'gallery') {
        loadGallery();
        switchView('gallery');
    } else {
        switchView('home');
        startCamera();
    }
}

// --- GALLERY ---
function loadGallery() {
    if (!db) return;
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const request = store.getAll();
    request.onsuccess = () => {
        const sessions = request.result.reverse();
        const grid = document.getElementById('galleryGrid');
        grid.innerHTML = '';
        if (sessions.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            document.getElementById('emptyState').style.display = 'none';
            sessions.forEach(s => {
                const div = document.createElement('div');
                div.className = 'gallery-item';
                const thumbSrc = s.photos[0];
                div.innerHTML = `
                            <div class="gallery-thumb-wrapper" onclick="loadSession(${s.id})">
                                <img src="${thumbSrc}" class="gallery-thumb">
                                <div class="gallery-overlay"><i class="fa-solid fa-pen-to-square"></i> Edit</div>
                            </div>
                            <div class="gallery-meta">
                                <input type="text" class="gallery-name-input" value="${s.settings.name}" onblur="updateName(this, ${s.id})" onkeypress="if(event.key==='Enter')this.blur()">
                                <label class="checkbox-wrapper">
                                    <input type="checkbox" class="select-check" value="${s.id}" onchange="toggleBulk()">
                                    <div class="checkmark"><i class="fa-solid fa-check"></i></div>
                                </label>
                            </div>
                        `;
                grid.appendChild(div);
            });
        }
    };
}

function updateName(input, id) {
    const newName = input.value.trim() || "Untitled";
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').get(id).onsuccess = (e) => {
        const s = e.target.result; s.settings.name = newName;
        tx.objectStore('sessions').put(s).onsuccess = () => showToast("Renamed");
    };
}

function loadSession(id) {
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    store.get(id).onsuccess = (e) => {
        const s = e.target.result;

        currentSessionId = s.id;
        currentLayout = s.settings.layout;
        document.getElementById('frameColor').value = s.settings.color;
        document.getElementById('footerText').value = s.settings.text;
        document.getElementById('fileName').value = s.settings.name;
        includeDate = s.settings.includeDate !== undefined ? s.settings.includeDate : true;
        document.getElementById('includeDateCheck').checked = includeDate;

        // Restore text color if present
        textColor = s.settings.textColor || '#ffffff';
        const textColorInput = document.getElementById('textColor');
        if (textColorInput) textColorInput.value = textColor;

        customBorders = { strip: null, grid: null, horizontal: null };
        borderFileNames = { strip: "Default", grid: "Default", horizontal: "Default" };

        if (s.settings.borders) {
            ['strip', 'grid', 'horizontal'].forEach(type => {
                const b = s.settings.borders[type];
                if (b && b.src) {
                    const img = new Image();
                    img.onload = () => {
                        customBorders[type] = img;
                        if (currentLayout === type) renderCanvas();
                    };
                    img.src = b.src;
                    borderFileNames[type] = b.name || 'Custom border';
                }
            });
        }

        capturedPhotos = [];
        let count = 0;
        s.photos.forEach(src => {
            const img = new Image();

            img.onload = () => { count++; if (count === 4) openEditor(); };
            img.src = src;
            capturedPhotos.push(img);
        });
    };
}

function downloadImage() {
    let name = document.getElementById('fileName').value || "untitled";
    finalCanvas.toBlob(blob => { saveAs(blob, `${name}.png`); showToast(`Saved as ${name}.png`); }, 'image/png');
}

function toggleBulk() {
    const checked = document.querySelectorAll('.select-check:checked');
    const actions = document.getElementById('bulkActions');
    if (checked.length > 0) actions.classList.add('active'); else actions.classList.remove('active');
}
function deselectAll() { document.querySelectorAll('.select-check').forEach(c => c.checked = false); toggleBulk(); }

function deleteSelected() {
    const checked = document.querySelectorAll('.select-check:checked');
    if (checked.length === 0) return;
    showConfirm(`Delete ${checked.length} items?`, () => {
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        checked.forEach(box => store.delete(parseInt(box.value)));
        tx.oncomplete = () => { showToast("Items deleted"); loadGallery(); deselectAll(); };
    });
}

async function downloadAllGallery() {
    if (!db) return;
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').getAll();
    req.onsuccess = async () => {
        if (req.result.length === 0) return showToast("Gallery empty", "info");
        const zip = new JSZip();
        const folder = zip.folder("All_Photobooth_Layouts");
        const promises = req.result.map(s => renderSessionToBlob(s).then(res => folder.file(res.name, res.blob)));
        await Promise.all(promises);
        zip.generateAsync({ type: "blob" }).then(c => saveAs(c, "All_Layouts.zip"));
    };
}

async function downloadSelected() {
    const checked = document.querySelectorAll('.select-check:checked');
    if (checked.length === 0) return;

    const total = checked.length;

    const progress = document.createElement('div');
    progress.className = 'toast';
    progress.innerHTML = `
                <span><i class="fa-solid fa-download" style="color:var(--primary)"></i> Downloading <span id="dlCount">0</span> / ${total}</span>
                <div style="width:140px; height:6px; background:rgba(148,163,184,0.3); border-radius:999px; overflow:hidden;">
                    <div id="dlBar" style="height:100%; width:0%; background:var(--primary);"></div>
                </div>
            `;
    document.getElementById('toast-container').appendChild(progress);
    const countEl = progress.querySelector('#dlCount');
    const barEl = progress.querySelector('#dlBar');

    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');

    let done = 0;
    for (const box of Array.from(checked)) {
        const id = parseInt(box.value);
        const session = await new Promise(resolve => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (session) {
            const res = await renderSessionToBlob(session);
            saveAs(res.blob, res.name);
        }
        done++;
        countEl.textContent = done;
        barEl.style.width = `${Math.round((done / total) * 100)}%`;
    }

    setTimeout(() => progress.remove(), 1000);
    deselectAll();
    showToast(`Downloaded ${total} PNG file${total > 1 ? 's' : ''}`);
}

function isLight(color) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 > 155;
}

function renderBorderManager() {
    const types = ['strip', 'grid', 'horizontal'];
    const labels = { 'strip': 'Strip', 'grid': 'Grid', 'horizontal': 'Wide' };

    let html = '';
    types.forEach(type => {
        html += `
                    <div class="border-manage-item">
                        <div class="border-info">
                            <span class="border-type">${labels[type]}</span>
                            <span class="border-name">${borderFileNames[type]}</span>
                        </div>
                        <div class="border-actions">
                            <label class="btn-upload-wrap icon-btn">
                                <i class="fa-solid fa-upload" style="font-size:0.8rem;"></i>
                                <input type="file" accept="image/png" onchange="handleBorderUpload(this, '${type}')">
                            </label>
                            ${customBorders[type] ? `<button class="icon-btn btn-trash" onclick="removeBorder('${type}')"><i class="fa-solid fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
    });

    const editorContainer = document.getElementById('borderManagerContainer');
    const homeContainer = document.getElementById('borderManagerHome');
    if (editorContainer) editorContainer.innerHTML = html;
    if (homeContainer) homeContainer.innerHTML = html;
}

function handleBorderUpload(input, type) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
        const img = new Image();
        img.onload = () => {
            customBorders[type] = img;
            borderFileNames[type] = file.name;
            showToast(`✅ Border uploaded for ${type} layout!`);
            renderBorderManager();
            if (currentLayout === type) {
                renderCanvas();
                renderCapturePreview();
            }
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
}

function removeBorder(type) {
    customBorders[type] = null;
    borderFileNames[type] = "Default";
    renderBorderManager();
    if (currentLayout === type) {
        renderCanvas();
        renderCapturePreview();
    }
}

function downloadTemplate() {
    const layout = arguments[0] || currentLayout;
    // Create temp canvas
    const tempCvs = document.createElement('canvas');
    const photoW = 400;
    const photoH = capturedPhotos.length > 0 ? (capturedPhotos[0].height / capturedPhotos[0].width) * photoW : (4 / 3) * 400;
    const pad = 30; const foot = 100;
    if (layout === 'strip') { tempCvs.width = photoW + (pad * 2); tempCvs.height = (photoH * 4) + (pad * 5) + foot; }
    else if (layout === 'grid') { tempCvs.width = (photoW * 2) + (pad * 3); tempCvs.height = (photoH * 2) + (pad * 3) + foot; }
    else { tempCvs.width = (photoW * 4) + (pad * 5); tempCvs.height = photoH + (pad * 2) + foot; }

    const tCtx = tempCvs.getContext('2d');
    tCtx.fillStyle = "#ffffff";
    tCtx.fillRect(0, 0, tempCvs.width, tempCvs.height);
    tCtx.globalCompositeOperation = "destination-out";

    if (layout === 'strip') { let y = pad; for (let i = 0; i < 4; i++) { tCtx.fillRect(pad, y, photoW, photoH); y += photoH + pad; } }
    else if (layout === 'grid') { tCtx.fillRect(pad, pad, photoW, photoH); tCtx.fillRect(pad + photoW + pad, pad, photoW, photoH); tCtx.fillRect(pad, pad + photoH + pad, photoW, photoH); tCtx.fillRect(pad + photoW + pad, pad + photoH + pad, photoW, photoH); }
    else { let x = pad; for (let i = 0; i < 4; i++) { tCtx.fillRect(x, pad, photoW, photoH); x += photoW + pad; } }

    tempCvs.toBlob(blob => saveAs(blob, `${layout}_template.png`));
}

function renderCanvas() {
    const frameColor = document.getElementById('frameColor').value;
    const footerText = document.getElementById('footerText').value;
    const footerSpace = 100;
    const photoW = 400;
    const photoH = (capturedPhotos[0].height / capturedPhotos[0].width) * photoW;
    const padding = 30;

    if (currentLayout === 'strip') {
        finalCanvas.width = photoW + (padding * 2);
        finalCanvas.height = (photoH * 4) + (padding * 5) + footerSpace;
    } else if (currentLayout === 'grid') {
        finalCanvas.width = (photoW * 2) + (padding * 3);
        finalCanvas.height = (photoH * 2) + (padding * 3) + footerSpace;
    } else {
        finalCanvas.width = (photoW * 4) + (padding * 5);
        finalCanvas.height = photoH + (padding * 2) + footerSpace;
    }

    ctx.fillStyle = frameColor; ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    if (currentLayout === 'strip') {
        let currentY = padding;
        capturedPhotos.forEach(img => { ctx.drawImage(img, padding, currentY, photoW, photoH); currentY += photoH + padding; });
    } else if (currentLayout === 'grid') {
        if (capturedPhotos[0]) ctx.drawImage(capturedPhotos[0], padding, padding, photoW, photoH);
        if (capturedPhotos[1]) ctx.drawImage(capturedPhotos[1], padding + photoW + padding, padding, photoW, photoH);
        if (capturedPhotos[2]) ctx.drawImage(capturedPhotos[2], padding, padding + photoH + padding, photoW, photoH);
        if (capturedPhotos[3]) ctx.drawImage(capturedPhotos[3], padding + photoW + padding, padding + photoH + padding, photoW, photoH);
    } else {
        let currentX = padding;
        capturedPhotos.forEach(img => { ctx.drawImage(img, currentX, padding, photoW, photoH); currentX += photoW + padding; });
    }

    if (customBorders[currentLayout]) {
        ctx.drawImage(customBorders[currentLayout], 0, 0, finalCanvas.width, finalCanvas.height);
    }

    // Use chosen text color; fall back to contrast-based color if missing
    const effectiveTextColor = textColor || (isLight(frameColor) ? '#000' : '#fff');
    ctx.fillStyle = effectiveTextColor;
    ctx.font = "bold 24px Inter"; ctx.textAlign = "center";
    const incDate = includeDate !== undefined ? includeDate : true;
    const dateStr = incDate ? ` • ${new Date().toLocaleDateString()}` : '';
    const fullText = `${footerText}${dateStr}`;
    ctx.fillText(fullText, finalCanvas.width / 2, finalCanvas.height - (footerSpace / 2) + 10);

    triggerAutoSave();
}

function renderCapturePreview() {
    const preview = document.getElementById('capturePreview');
    if (!preview) return;
    const pctx = preview.getContext('2d');
    if (!capturedPhotos.length) {
        pctx.clearRect(0, 0, preview.width || 0, preview.height || 0);
        return;
    }

    const frameColor = document.getElementById('frameColor').value;
    // Use the same geometry as renderCanvas / downloadTemplate so borders and photos line up
    const photoW = 400;
    const photoH = (capturedPhotos[0].height / capturedPhotos[0].width) * photoW;
    const padding = 30;
    const footerSpace = 100;

    if (currentLayout === 'strip') {
        preview.width = photoW + (padding * 2);
        preview.height = (photoH * 4) + (padding * 5) + footerSpace;
    } else if (currentLayout === 'grid') {
        preview.width = (photoW * 2) + (padding * 3);
        preview.height = (photoH * 2) + (padding * 3) + footerSpace;
    } else {
        preview.width = (photoW * 4) + (padding * 5);
        preview.height = photoH + (padding * 2) + footerSpace;
    }

    pctx.fillStyle = frameColor;
    pctx.fillRect(0, 0, preview.width, preview.height);

    if (currentLayout === 'strip') {
        let currentY = padding;
        capturedPhotos.forEach(img => {
            pctx.drawImage(img, padding, currentY, photoW, photoH);
            currentY += photoH + padding;
        });
    } else if (currentLayout === 'grid') {
        if (capturedPhotos[0]) pctx.drawImage(capturedPhotos[0], padding, padding, photoW, photoH);
        if (capturedPhotos[1]) pctx.drawImage(capturedPhotos[1], padding + photoW + padding, padding, photoW, photoH);
        if (capturedPhotos[2]) pctx.drawImage(capturedPhotos[2], padding, padding + photoH + padding, photoW, photoH);
        if (capturedPhotos[3]) pctx.drawImage(capturedPhotos[3], padding + photoW + padding, padding + photoH + padding, photoW, photoH);
    } else {
        let currentX = padding;
        capturedPhotos.forEach(img => {
            pctx.drawImage(img, currentX, padding, photoW, photoH);
            currentX += photoW + padding;
        });
    }

    if (customBorders[currentLayout]) {
        pctx.drawImage(customBorders[currentLayout], 0, 0, preview.width, preview.height);
    }
}

function triggerAutoSave() {
    if (saveTimer) clearTimeout(saveTimer);
    const statusEl = document.getElementById('autoSaveStatus');
    if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    saveTimer = setTimeout(() => {
        autoSaveSession();
        if (document.getElementById('applyAllCheck').checked) applySettingsToAll();
        if (statusEl) statusEl.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
    }, 500);
}

function autoSaveSession() {
    if (!db || !currentSessionId) return;
    const photoData = capturedPhotos.map(img => img.src);
    const session = {
        id: currentSessionId, date: new Date(), photos: photoData,
        settings: getCurrentSettings()
    };
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put(session);
}

function getCurrentSettings() {
    const borders = { strip: null, grid: null, horizontal: null };
    ['strip', 'grid', 'horizontal'].forEach(type => {
        if (customBorders[type]) {
            borders[type] = {
                src: customBorders[type].src,
                name: borderFileNames[type] || 'Custom border'
            };
        }
    });

    return {
        layout: currentLayout,
        color: document.getElementById('frameColor').value,
        text: document.getElementById('footerText').value,
        name: document.getElementById('fileName').value || 'Untitled',
        includeDate: includeDate,
        textColor: textColor,
        borders
    };
}

function applySettingsToAll() {
    if (!db) return;
    const current = getCurrentSettings();
    const tx = db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            const update = cursor.value;
            update.settings.layout = current.layout;
            update.settings.color = current.color;
            update.settings.text = current.text;
            update.settings.includeDate = current.includeDate;
            update.settings.borders = current.borders || update.settings.borders;
            cursor.update(update);
            cursor.continue();
        }
    };
    tx.oncomplete = () => {
        showToast("Applied style to all gallery items");
    };
}

// --- ROBUST CLICK TO RETAKE ---
finalCanvas.addEventListener('click', (e) => {
    if (capturedPhotos.length < 4) return;

    const rect = finalCanvas.getBoundingClientRect();

    // Calculate scaling ratio
    const scaleX = finalCanvas.width / rect.width;
    const scaleY = finalCanvas.height / rect.height;

    // Mouse position mapped to internal Canvas coordinates
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const photoW = 400;
    const photoH = (capturedPhotos[0].height / capturedPhotos[0].width) * photoW;
    const padding = 30;
    let clickedIndex = -1;

    if (currentLayout === 'strip') {
        if (x > padding && x < padding + photoW) {
            for (let i = 0; i < 4; i++) {
                let startY = padding + (i * (photoH + padding));
                if (y > startY && y < startY + photoH) clickedIndex = i;
            }
        }
    } else if (currentLayout === 'grid') {
        // Explicitly check 4 boxes
        if (x > padding && x < padding + photoW && y > padding && y < padding + photoH) clickedIndex = 0;
        if (x > padding * 2 + photoW && x < padding * 2 + photoW * 2 && y > padding && y < padding + photoH) clickedIndex = 1;
        if (x > padding && x < padding + photoW && y > padding * 2 + photoH && y < padding * 2 + photoH * 2) clickedIndex = 2;
        if (x > padding * 2 + photoW && x < padding * 2 + photoW * 2 && y > padding * 2 + photoH && y < padding * 2 + photoH * 2) clickedIndex = 3;
    } else {
        if (y > padding && y < padding + photoH) {
            for (let i = 0; i < 4; i++) {
                let startX = padding + (i * (photoW + padding));
                if (x > startX && x < startX + photoW) clickedIndex = i;
            }
        }
    }

    if (clickedIndex > -1) {
        showConfirm(`Retake photo #${clickedIndex + 1}?`, () => {
            retakeIndex = clickedIndex;
            document.getElementById('resultModal').classList.remove('active');
            switchView('home');
            const headerBtn = document.getElementById('headerToggleBtn');
            if (headerBtn) headerBtn.innerHTML = '<i class="fa-solid fa-images"></i> <span style="margin-left:6px">Gallery</span>';
            document.getElementById('modeText').innerHTML = `<i class="fa-solid fa-rotate"></i> Retake #${clickedIndex + 1}`;
            startCamera();
        });
    }
});

// --- GALLERY ---
function loadGallery() {
    if (!db) return;
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const request = store.getAll();
    request.onsuccess = () => {
        const sessions = request.result.reverse();
        const grid = document.getElementById('galleryGrid');
        grid.innerHTML = '';
        if (sessions.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
        } else {
            document.getElementById('emptyState').style.display = 'none';
            sessions.forEach(s => {
                const div = document.createElement('div');
                div.className = 'gallery-item';
                const thumbSrc = s.photos[0];
                div.innerHTML = `
                            <div class="gallery-thumb-wrapper" onclick="loadSession(${s.id})">
                                <img src="${thumbSrc}" class="gallery-thumb">
                                <div class="gallery-overlay"><i class="fa-solid fa-pen-to-square"></i> Edit</div>
                            </div>
                            <div class="gallery-meta">
                                <input type="text" class="gallery-name-input" value="${s.settings.name}" onblur="updateName(this, ${s.id})" onkeypress="if(event.key==='Enter')this.blur()">
                                <label class="checkbox-wrapper">
                                    <input type="checkbox" class="select-check" value="${s.id}" onchange="toggleBulk()">
                                    <div class="checkmark"><i class="fa-solid fa-check"></i></div>
                                </label>
                            </div>
                        `;
                grid.appendChild(div);
            });
        }
    };
}

function updateName(input, id) {
    const newName = input.value.trim() || "Untitled";
    const tx = db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').get(id).onsuccess = (e) => {
        const s = e.target.result; s.settings.name = newName;
        tx.objectStore('sessions').put(s).onsuccess = () => showToast("Renamed");
    };
}

function loadSession(id) {
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    store.get(id).onsuccess = (e) => {
        const s = e.target.result;

        currentSessionId = s.id;
        currentLayout = s.settings.layout;
        document.getElementById('frameColor').value = s.settings.color;
        document.getElementById('footerText').value = s.settings.text;
        document.getElementById('fileName').value = s.settings.name;
        includeDate = s.settings.includeDate !== undefined ? s.settings.includeDate : true;
        document.getElementById('includeDateCheck').checked = includeDate;

        customBorders = { strip: null, grid: null, horizontal: null };
        borderFileNames = { strip: "Default", grid: "Default", horizontal: "Default" };

        if (s.settings.borders) {
            ['strip', 'grid', 'horizontal'].forEach(type => {
                const b = s.settings.borders[type];
                if (b && b.src) {
                    const img = new Image();
                    img.onload = () => {
                        customBorders[type] = img;
                        if (currentLayout === type) renderCanvas();
                    };
                    img.src = b.src;
                    borderFileNames[type] = b.name || 'Custom border';
                }
            });
        }

        capturedPhotos = [];
        let count = 0;
        s.photos.forEach(src => {
            const img = new Image();

            img.onload = () => { count++; if (count === 4) openEditor(); };
            img.src = src;
            capturedPhotos.push(img);
        });
    };
}

function downloadImage() {
    let name = document.getElementById('fileName').value || "untitled";
    finalCanvas.toBlob(blob => { saveAs(blob, `${name}.png`); showToast(`Saved as ${name}.png`); }, 'image/png');
}

function toggleBulk() {
    const checked = document.querySelectorAll('.select-check:checked');
    const actions = document.getElementById('bulkActions');
    if (checked.length > 0) actions.classList.add('active'); else actions.classList.remove('active');
}
function deselectAll() { document.querySelectorAll('.select-check').forEach(c => c.checked = false); toggleBulk(); }

function deleteSelected() {
    const checked = document.querySelectorAll('.select-check:checked');
    if (checked.length === 0) return;
    showConfirm(`Delete ${checked.length} items?`, () => {
        const tx = db.transaction('sessions', 'readwrite');
        const store = tx.objectStore('sessions');
        checked.forEach(box => store.delete(parseInt(box.value)));
        tx.oncomplete = () => { showToast("Items deleted"); loadGallery(); deselectAll(); };
    });
}

async function downloadAllGallery() {
    if (!db) return;
    const tx = db.transaction('sessions', 'readonly');
    const req = tx.objectStore('sessions').getAll();
    req.onsuccess = async () => {
        if (req.result.length === 0) return showToast("Gallery empty", "info");
        const zip = new JSZip();
        const folder = zip.folder("All_Photobooth_Layouts");
        const promises = req.result.map(s => renderSessionToBlob(s).then(res => folder.file(res.name, res.blob)));
        await Promise.all(promises);
        zip.generateAsync({ type: "blob" }).then(c => saveAs(c, "All_Layouts.zip"));
    };
}

async function downloadSelected() {
    const checked = document.querySelectorAll('.select-check:checked');
    if (checked.length === 0) return;

    const total = checked.length;

    const progress = document.createElement('div');
    progress.className = 'toast';
    progress.innerHTML = `
                <span><i class="fa-solid fa-download" style="color:var(--primary)"></i> Downloading <span id="dlCount">0</span> / ${total}</span>
                <div style="width:140px; height:6px; background:rgba(148,163,184,0.3); border-radius:999px; overflow:hidden;">
                    <div id="dlBar" style="height:100%; width:0%; background:var(--primary);"></div>
                </div>
            `;
    document.getElementById('toast-container').appendChild(progress);
    const countEl = progress.querySelector('#dlCount');
    const barEl = progress.querySelector('#dlBar');

    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');

    let done = 0;
    for (const box of Array.from(checked)) {
        const id = parseInt(box.value);
        const session = await new Promise(resolve => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
        if (session) {
            const res = await renderSessionToBlob(session);
            saveAs(res.blob, res.name);
        }
        done++;
        countEl.textContent = done;
        barEl.style.width = `${Math.round((done / total) * 100)}%`;
    }

    setTimeout(() => progress.remove(), 1000);
    deselectAll();
    showToast(`Downloaded ${total} PNG file${total > 1 ? 's' : ''}`);
}

const renderSessionToBlob = (s) => new Promise((resolve) => {
    const cvs = document.createElement('canvas');
    const cx = cvs.getContext('2d');
    const photoW = 400;
    const i1 = new Image();
    i1.onload = () => {
        const photoH = (i1.height / i1.width) * photoW;
        const pad = 30; const foot = 100;
        if (s.settings.layout === 'strip') { cvs.width = photoW + (pad * 2); cvs.height = (photoH * 4) + (pad * 5) + foot; }
        else if (s.settings.layout === 'grid') { cvs.width = (photoW * 2) + (pad * 3); cvs.height = (photoH * 2) + (pad * 3) + foot; }
        else { cvs.width = (photoW * 4) + (pad * 5); cvs.height = photoH + (pad * 2) + foot; }

        cx.fillStyle = s.settings.color; cx.fillRect(0, 0, cvs.width, cvs.height);
        const loadAndDraw = (idx, x, y) => { const img = new Image(); img.src = s.photos[idx]; cx.drawImage(img, x, y, photoW, photoH); }
        if (s.settings.layout === 'strip') { let y = pad; s.photos.forEach((_, i) => { loadAndDraw(i, pad, y); y += photoH + pad; }); }
        else if (s.settings.layout === 'grid') { loadAndDraw(0, pad, pad); loadAndDraw(1, pad + photoW + pad, pad); loadAndDraw(2, pad, pad + photoH + pad); loadAndDraw(3, pad + photoW + pad, pad + photoH + pad); }
        else { let x = pad; s.photos.forEach((_, i) => { loadAndDraw(i, x, pad); x += photoW + pad; }); }

        const exportTextColor = s.settings.textColor || (isLight(s.settings.color) ? '#000' : '#fff');
        cx.fillStyle = exportTextColor;
        cx.font = "bold 24px Inter"; cx.textAlign = "center";
        const incDate = s.settings.includeDate !== undefined ? s.settings.includeDate : true;
        const dateStr = incDate ? ` • ${new Date(s.date).toLocaleDateString()}` : '';
        cx.fillText(`${s.settings.text}${dateStr}`, cvs.width / 2, cvs.height - foot / 2);

        setTimeout(() => { cvs.toBlob(blob => resolve({ blob, name: `${s.settings.name}_${s.id}.png` })); }, 100);
    };
    i1.src = s.photos[0];
});

function isLight(color) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 > 155;
}
