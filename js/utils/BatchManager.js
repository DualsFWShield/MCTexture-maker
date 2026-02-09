/**
 * BatchManager.js
 * Handles multi-file processing (Batch Mode).
 * Uses the current ImageProcessor pipeline settings to process a queue of images.
 */

import { ImageProcessor } from '../imageProcessor.js';

export class BatchManager {
    constructor(imageProcessor) {
        this.processor = imageProcessor;
        this.queue = [];
        this.isProcessing = false;
        this.uiContainer = null;
    }

    destroy() {
        if (this.statusEl) {
            const dropZone = this.statusEl.closest('.batch-drop-zone');
            if (dropZone) dropZone.remove();
        }
    }

    // Initialize the Batch UI area (Drag & Drop zone)
    initUI(containerId) {
        let container = document.getElementById(containerId);

        // Fallback if specific container not found, append to main workspace
        if (!container) {
            console.warn("BatchManager: ui-container not found, falling back to .workspace-area");
            container = document.querySelector('.workspace-area');
        }
        if (!container) {
            console.error("BatchManager: No container found for Batch UI!");
            return;
        }
        console.log("BatchManager: Initializing UI in", container);

        // Create Drop Zone
        // GLOBAL CLEANUP: Remove ANY existing batch drop zone by ID to prevent duplicates
        const existingGlobal = document.getElementById('global-batch-drop-zone');
        if (existingGlobal) existingGlobal.remove();

        const dropZone = document.createElement('div');
        dropZone.id = 'global-batch-drop-zone'; // Enforce Unique ID
        dropZone.className = 'batch-drop-zone';
        dropZone.innerHTML = `
            <div class="batch-icon">📂</div>
            <h3>BATCH PROCESSING</h3>
            <p>Drag images here or Add from Assets</p>
            
            <div id="batch-queue-list" class="batch-queue-list" style="max-height:100px; overflow-y:auto; margin:10px 0; background:rgba(0,0,0,0.2); text-align:left; font-size:0.8rem; padding:5px;">
                <div style="color:#aaa; text-align:center;">Queue empty</div>
            </div>

            <div class="batch-controls" style="display:flex; gap:5px; justify-content:center;">
                <button id="batch-add-btn" class="btn btn-secondary btn-small">➕ Add File</button>
                <button id="batch-clear-btn" class="btn btn-danger btn-small" disabled>🗑️</button>
                <button id="batch-run-btn" class="btn btn-primary btn-small" disabled>▶️ RUN</button>
            </div>
            
            <input type="file" id="batch-input" multiple accept="image/*" style="display:none">
            <div id="batch-status" class="batch-status" style="margin-top:10px;"></div>
        `;

        // Style
        dropZone.style.border = '2px dashed var(--accent-secondary)';
        dropZone.style.padding = '15px';
        dropZone.style.textAlign = 'center';
        dropZone.style.marginTop = '20px';
        dropZone.style.borderRadius = '8px';
        dropZone.style.background = 'rgba(255,255,255,0.05)';
        dropZone.style.transition = 'all 0.3s ease';

        container.appendChild(dropZone);
        this.statusEl = dropZone.querySelector('#batch-status');
        this.queueListEl = dropZone.querySelector('#batch-queue-list');
        this.runBtn = dropZone.querySelector('#batch-run-btn');
        this.clearBtn = dropZone.querySelector('#batch-clear-btn');

        // Events
        dropZone.ondragover = (e) => {
            e.preventDefault();
            dropZone.style.background = 'rgba(255,255,255,0.1)';
            dropZone.style.borderColor = 'var(--accent-primary)';
        };
        dropZone.ondragleave = (e) => {
            e.preventDefault();
            dropZone.style.background = 'rgba(255,255,255,0.05)';
            dropZone.style.borderColor = 'var(--accent-secondary)';
        };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.style.background = 'rgba(255,255,255,0.05)';
            if (e.dataTransfer.files.length > 0) {
                this.handleFiles(e.dataTransfer.files);
            }
        };

        const input = dropZone.querySelector('#batch-input');
        dropZone.querySelector('#batch-add-btn').onclick = () => input.click();

        this.runBtn.onclick = () => this.startBatch();
        this.clearBtn.onclick = () => {
            this.queue = [];
            this.updateQueueUI();
        };

        input.onchange = (e) => {
            if (e.target.files.length > 0) this.handleFiles(e.target.files);
            input.value = ''; // Reset
        };
    }

    handleFiles(fileList) {
        const newFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (newFiles.length === 0) return;

        this.queue.push(...newFiles);
        this.updateQueueUI();
    }

    addFile(file) {
        if (!file.type.startsWith('image/')) return;
        this.queue.push(file);
        this.updateQueueUI();
    }

    updateQueueUI() {
        if (!this.queueListEl) return;

        if (this.queue.length === 0) {
            this.queueListEl.innerHTML = '<div style="color:#aaa; text-align:center;">Queue empty</div>';
            this.runBtn.disabled = true;
            this.clearBtn.disabled = true;
            return;
        }

        this.runBtn.disabled = false;
        this.clearBtn.disabled = false;
        this.queueListEl.innerHTML = '';

        this.queue.forEach((f, i) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.borderBottom = '1px solid #444';
            row.style.padding = '2px';

            row.innerHTML = `
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;" title="${f.name}">${f.name}</span>
                <span style="cursor:pointer; color:#f55;" onclick="this.dispatchEvent(new CustomEvent('remove-item', {bubbles:true, detail:${i}}))">×</span>
            `;

            // Event delegation workaround or direct listener
            row.querySelector('span:last-child').onclick = () => {
                this.queue.splice(i, 1);
                this.updateQueueUI();
            };

            this.queueListEl.appendChild(row);
        });
    }

    async startBatch() {
        this.isProcessing = true;
        this.updateStatus(0, this.queue.length, "Starting...");

        if (!window.JSZip) {
            alert("JSZip not loaded. Cannot create archive.");
            this.isProcessing = false;
            return;
        }

        const zip = new JSZip();
        // Capture current state of params
        const stateSnapshot = JSON.parse(JSON.stringify(this.processor.state));
        const settings = this.processor.exportSettings;

        // Hidden Canvas for processing
        const workCanvas = document.createElement('canvas');
        const workCtx = workCanvas.getContext('2d');

        for (let i = 0; i < this.queue.length; i++) {
            const file = this.queue[i];
            this.updateStatus(i + 1, this.queue.length, `Processing ${file.name}...`);

            try {
                const img = await this.loadFile(file);

                // Determine Size
                let w = img.width, h = img.height;
                if (settings.resizeMode === 'custom') {
                    w = settings.customWidth;
                    h = settings.customHeight;
                    // Maintain aspect logic manual check here or assume custom is strict
                    if (settings.maintainAspect) {
                        // Ratio based on img
                        const r = img.width / img.height;
                        if (w / h > r) w = h * r; else h = w / r;
                        w = Math.round(w); h = Math.round(h);
                    }
                }

                workCanvas.width = w;
                workCanvas.height = h;

                // 1. Draw
                // Background
                if (this.processor.backgroundMode === 'color') {
                    workCtx.fillStyle = this.processor.backgroundColor;
                    workCtx.fillRect(0, 0, w, h);
                } else {
                    workCtx.drawImage(img, 0, 0, w, h);
                }

                // 2. Process
                // We need to temporally set processor scale for effects?
                // Pipeline process expects context.
                // We can reuse the pipeline objects but we must pass the stateSnapshot so we don't accidentally use mutated state (though state shouldn't mutate during process).

                // Scale factor for effects (Blur radius etc)
                // Assume Preview width was ~960. 
                // We need to calculate a scale factor relative to "Design Resolution".
                // ImageProcessor uses 'this.canvas.width' (preview) as base.
                // We don't have access to Preview Width here easily unless we ask processor.
                const previewW = this.processor.canvas.width || 800;
                const scale = w / previewW;

                this.processor.pipeline.forEach(effect => {
                    // Use Snapshot state
                    effect.process(workCtx, w, h, stateSnapshot[effect.id], scale);
                });

                // 3. Add to Zip
                const blob = await new Promise(r => workCanvas.toBlob(r, settings.format === 'jpg' ? 'image/jpeg' : 'image/png', settings.quality));
                // Rename
                const nameParts = file.name.split('.');
                const ext = nameParts.pop();
                const cleanName = nameParts.join('.');
                zip.file(`${cleanName}.${settings.format}`, blob);

            } catch (err) {
                console.error(`Error processing ${file.name}`, err);
                zip.file(`${file.name}_ERROR.txt`, err.message);
            }
        }

        this.updateStatus(this.queue.length, this.queue.length, "Finalizing Zip...");

        try {
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `VOID_BATCH_${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert("Zip Error: " + e.message);
        }

        this.isProcessing = false;
        this.updateStatus(this.queue.length, this.queue.length, "Done!");
    }

    loadFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    updateStatus(current, total, msg) {
        if (!this.statusEl) return;
        this.statusEl.innerHTML = `
            <span>${msg}</span>
            <div style="background:#333; width:100%; height:4px; margin-top:5px;">
                <div style="background:var(--accent-primary); width:${(current / total) * 100}%; height:100%;"></div>
            </div>
            <small>${current} / ${total}</small>
        `;
    }
}
