import { PreProcessEffect } from './effects/PreProcessEffect.js';
import { UIBuilder } from './ui/UIBuilder.js';
import { DitherEffect } from './effects/DitherEffect.js';
import { GlitchEffect } from './effects/GlitchEffect.js';
import { HalftoneEffect } from './effects/HalftoneEffect.js';
import { Animator } from './animator/Animator.js';
import { WebGLManager } from './webgl/WebGLManager.js';
import { SeparationExporter } from './utils/SeparationExporter.js';

import { BatchManager } from './utils/BatchManager.js';
import { DrawingManager } from './img/DrawingManager.js';

export class ImageProcessor {
    constructor(canvas) {
        this.canvas = canvas; // Output Canvas (Render)
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.ctx.imageSmoothingEnabled = false;

        // New: Source Canvas (Holds the actual pixel data)
        this.sourceCanvas = document.createElement('canvas'); // Offscreen
        this.sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });

        // New: Interactive Canvas (Top layer for events/cursors)
        this.drawingCanvas = document.getElementById('drawing-canvas');

        this.originalImage = null; // Keeps reference to original file object if needed, but pixel data is in sourceCanvas
        this.currentFilePath = null;
        this.videoElement = null;
        this.sourceType = 'image';
        this.onSaveToPack = null;

        this.showGrid = false;
        this.gridSize = 16;

        // Ensure UI Builder targets the new rack
        this.ui = new UIBuilder('modules-rack');

        // Pipeline Definition
        this.pipeline = [
            PreProcessEffect,
            HalftoneEffect,
            DitherEffect,
            GlitchEffect
        ];

        this.state = {};
        this.pipeline.forEach(effect => {
            this.state[effect.id] = { ...effect.params };
        });

        this.renderTimeout = null;
        this.previewScale = 1.0;

        // Recorder & Animator
        this.exportFormat = 'gif';
        this.animator = null;

        // Drawing Manager
        this.drawingManager = null;

        // GPU Manager
        this.glManager = null;
        this.gpuCanvas = document.createElement('canvas');
        this.useGPU = true;

        // Texture / Background Settings
        this.backgroundMode = 'image';
        this.backgroundColor = '#000000';

        // Export Settings
        this.exportSettings = {
            format: 'png',
            resolutions: {
                1: false, 2: false, 4: false, 8: false,
                16: false, 32: false, 64: false,
                128: false, 256: false, 512: false
            },
            original: true
        };
    }

    loadImage(file) {
        console.log("ImageProcessor: Loading Image...", file.name, file.type, file.size);
        this.sourceType = 'image';
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.remove();
            this.videoElement = null;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log("ImageProcessor: FileReader loaded. Creating Image object...");
            const img = new Image();
            img.onload = () => {
                console.log("ImageProcessor: Image object loaded. Drawing to source canvas...", img.width, "x", img.height);
                try {
                    // Initialize Source Canvas with Image Data
                    this.sourceCanvas.width = img.width;
                    this.sourceCanvas.height = img.height;
                    this.sourceCtx.drawImage(img, 0, 0);

                    this.originalImage = img; // Keep ref just in case

                    // Show Canvas Stack
                    document.getElementById('canvas-stack').hidden = false;
                    const prompt = document.getElementById('preview-container').querySelector('.upload-prompt');
                    if (prompt) prompt.hidden = true;

                    this.setupPreview(img);
                    this.initSystem();
                    console.log("ImageProcessor: System Initialized.");
                } catch (err) {
                    console.error("ImageProcessor: Error during initialization:", err);
                    alert("Error initializing image processor: " + err.message);
                }
            };
            img.onerror = (err) => {
                console.error("ImageProcessor: Failed to load Image object from data URL.", err);
                alert("Failed to load image data.");
            };
            img.src = e.target.result;
        };
        reader.onerror = (err) => {
            console.error("ImageProcessor: FileReader error:", err);
            alert("Failed to read file.");
        };
        reader.readAsDataURL(file);
    }

    processImportSize(img) {
        let w = img.width;
        let h = img.height;
        return { w, h };
    }

    loadVideo(file) {
        this.sourceType = 'video';
        this.originalImage = null;

        const url = URL.createObjectURL(file);

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = "";
        }
        this.videoElement = document.createElement('video');
        this.videoElement.src = url;
        this.videoElement.muted = true;
        this.videoElement.loop = true;
        this.videoElement.playsInline = true;

        this.videoElement.onloadedmetadata = () => {
            this.setupPreview({ width: this.videoElement.videoWidth, height: this.videoElement.videoHeight });
            this.initSystem();
            this.videoElement.play();
            this.renderVideo();
        };
    }

    initSystem() {
        // UI & Animation
        this.generateUI();
        if (!this.animator) this.animator = new Animator(this);

        // Drawing Manager
        if (!this.drawingManager) {
            this.drawingManager = new DrawingManager(this);
        }

        // Pass the Source Canvas to Drawing Manager so it draws on the base layer
        this.drawingManager.setTarget(this.sourceCanvas, this.drawingCanvas);

        // Batch Manager
        if (!this.batchManager) {
            this.batchManager = new BatchManager(this);
            this.batchManager.initUI('ui-container');
        }

        // Controls
        document.getElementById('export-btn').disabled = false;
        this.setupRefreshedControls();

        // Initial Render
        this.initWebGL();
        this.requestRender();
    }

    initWebGL() {
        if (!this.useGPU) return;
        this.glManager = new WebGLManager(this.gpuCanvas);
        if (!this.glManager.isSupported) {
            this.useGPU = false;
        }
    }

    setupRefreshedControls() {
        const header = document.querySelector('.header-controls');
        // Remove old buttons logic if needed
        ['save-pack-btn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });

        // Setup Main Toolbar (Vertical)
        const toolbar = document.getElementById('main-toolbar');
        toolbar.innerHTML = ''; // Clear existing

        if (this.sourceType === 'image') {
            const tools = [
                { id: 'select', icon: '⛶', title: 'Select (S)' },
                { id: 'pencil', icon: '✏️', title: 'Pencil (P)' },
                { id: 'eraser', icon: '🧹', title: 'Eraser (E)' },
                { id: 'picker', icon: '💉', title: 'Color Picker (I)' },
                { id: 'bucket', icon: '🪣', title: 'Fill Bucket (G)' },
                { id: 'text', icon: 'T', title: 'Text Tool' },
                { id: 'crop', icon: '✂️', title: 'Crop / Resize' },
                { id: 'move', icon: '✋', title: 'Pan/Move' }
            ];

            tools.forEach(t => {
                const btn = document.createElement('div');
                btn.className = `draw-tool-btn ${t.id === 'pencil' ? 'active' : ''}`;
                btn.innerHTML = t.icon;
                btn.title = t.title;
                btn.onclick = () => {
                    this.drawingManager.activeTool = t.id;
                    toolbar.querySelectorAll('.draw-tool-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    // Special handling for Crop if it's an action, not a tool?
                    // If it's a tool, DrawingManager handles click. 
                    // If it's a dialog, better to have it here. 
                    // Let's handle 'crop' click here to open dialog immediately?
                    if (t.id === 'crop') {
                        // Deselect visual since it's an action
                        // Or if it's a "Select & Crop" tool, keep selected.
                        // Let's make it a tool that opens a dialog on click for V1
                        this.openCropDialog();
                    }
                };
                toolbar.appendChild(btn);
            });

            // OPTIONS POPOUT (Color & Size)
            // Instead of inline, let's append a settings panel or keep it simple in the toolbar
            // For vertical toolbar, proper popouts are better, but let's put them at the bottom for now

            // Spacer
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            toolbar.appendChild(spacer);

            // Color
            const colorWrap = document.createElement('div');
            colorWrap.className = 'draw-tool-btn';
            colorWrap.style.background = this.drawingManager.color;
            colorWrap.style.border = '2px solid #fff';
            colorWrap.title = "Current Color";

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.style.opacity = 0;
            colorInput.style.position = 'absolute';
            colorInput.style.width = '100%';
            colorInput.style.height = '100%';
            colorInput.value = this.drawingManager.color;

            colorInput.oninput = (e) => {
                this.drawingManager.color = e.target.value;
                colorWrap.style.background = e.target.value;
            };

            colorWrap.appendChild(colorInput);
            toolbar.appendChild(colorWrap);
        }
    }

    updateToolbarColor(color) {
        // Find the color input and wrapper in the toolbar
        const colorInput = document.querySelector('#main-toolbar input[type="color"]');
        const colorWrap = document.querySelector('#main-toolbar .draw-tool-btn[title="Current Color"]');

        if (colorInput) {
            colorInput.value = color;
        }
        if (colorWrap) {
            colorWrap.style.background = color;
        }
    }

    createBtn(text, id, onClick) {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'btn btn-secondary';
        btn.textContent = text;
        btn.style.marginRight = '10px';
        btn.onclick = onClick;
        return btn;
    }

    // Video Export Removed

    updateProgress(btn, percent, text) {
        btn.textContent = text || `${Math.round(percent)}%`;
        btn.style.background = `linear-gradient(90deg, var(--accent-primary) ${percent}%, var(--bg-surface) ${percent}%)`;
    }

    setupPreview(img) {
        // LIMIT PREVIEW SIZE FOR PERFORMANCE
        // Dynamic Mobile Optimization
        const isMobile = window.innerWidth <= 768;
        const maxPreview = isMobile ? 600 : 960; // Reduce load on mobile GPU
        const minPreview = isMobile ? 256 : 512; // Minimum size for comfortable editing

        let w = img.width;
        let h = img.height;

        console.log("setupPreview: Original image size:", w, "x", h);

        // Scale UP small images (like 16x16 Minecraft textures)
        if (w < minPreview && h < minPreview) {
            // Calculate how many times we can multiply while staying under max
            const scaleUp = Math.floor(Math.min(maxPreview / w, maxPreview / h));
            // Use the larger of: fit to minPreview OR integer scale
            const targetScale = Math.max(minPreview / Math.max(w, h), scaleUp);
            this.previewScale = targetScale;
            w *= targetScale;
            h *= targetScale;
            console.log("setupPreview: Scaled UP by", targetScale, "to", w, "x", h);
        }
        // Scale DOWN large images
        else if (w > maxPreview || h > maxPreview) {
            const ratio = Math.min(maxPreview / w, maxPreview / h);
            this.previewScale = ratio;
            w *= ratio;
            h *= ratio;
            console.log("setupPreview: Scaled DOWN by", ratio, "to", w, "x", h);
        } else {
            this.previewScale = 1.0;
        }

        // Ensure integer dimensions
        w = Math.round(w);
        h = Math.round(h);

        this.canvas.width = w;
        this.canvas.height = h;

        // Sync Interactive Canvas to Preview Size
        if (this.drawingCanvas) {
            this.drawingCanvas.width = w;
            this.drawingCanvas.height = h;
        }

        console.log("setupPreview: Final canvas size:", this.canvas.width, "x", this.canvas.height);
    }

    /**
     * Resize preview canvas to a specific target resolution (e.g., 512x512).
     * Used by the preview resolution selector UI.
     */
    setupPreviewWithResolution(targetSize) {
        const isMobile = window.innerWidth <= 768;
        const visualMin = isMobile ? 300 : 512; // Minimum visual size in pixels

        // 1. Set Internal Resolution (Actual pixels)
        this.canvas.width = targetSize;
        this.canvas.height = targetSize;

        // 2. Set Visual Size (CSS Pixels)
        // If target is small (e.g. 32x32), we scale it up visually to at least visualMin (e.g. 512px)
        // If target is large (e.g. 2048x2048), we let CSS max-width constrain it naturally or set it to match.

        let visualSize = Math.max(targetSize, visualMin);

        this.canvas.style.width = `${visualSize}px`;
        this.canvas.style.height = `${visualSize}px`;

        // Log for debugging
        console.log(`setupPreviewWithResolution: Internal ${targetSize}x${targetSize} -> Visual ${visualSize}px`);

        // 3. Sync Interactive Canvas
        if (this.drawingCanvas) {
            this.drawingCanvas.width = targetSize;
            this.drawingCanvas.height = targetSize;
            this.drawingCanvas.style.width = `${visualSize}px`;
            this.drawingCanvas.style.height = `${visualSize}px`;
        }

        // 4. Disable smoothing on the main context for sharp scaling
        this.ctx.imageSmoothingEnabled = false;

        // Update scale factor for internal logic if needed
        const sw = this.sourceCanvas.width;
        this.previewScale = targetSize / sw;
    }

    openCropDialog() {
        const w = this.sourceCanvas.width;
        const h = this.sourceCanvas.height;

        const newW = prompt("New Width:", w);
        if (!newW) return;
        const newH = prompt("New Height:", h);
        if (!newH) return;

        const width = parseInt(newW);
        const height = parseInt(newH);

        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            alert("Invalid dimensions.");
            return;
        }

        // Resize logic: Create new canvas, draw old one centered or top-left?
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tCtx = temp.getContext('2d');
        tCtx.imageSmoothingEnabled = false;

        // Default: Center? Or Top-Left?
        // Let's do Top-Left for now as it's standard for resizing without 'anchor' UI
        tCtx.drawImage(this.sourceCanvas, 0, 0);

        // Update Source Canvas
        this.sourceCanvas.width = width;
        this.sourceCanvas.height = height;
        this.sourceCtx.imageSmoothingEnabled = false; // Reset after resize
        this.sourceCtx.clearRect(0, 0, width, height);
        this.sourceCtx.drawImage(temp, 0, 0);

        // We also need to update Drawing Manager targets because sourceCanvas size changed!
        // But sourceCanvas object is same? No, resizing clears context usually or we just drew to it.
        // Wait, setting width/height clears canvas. 
        // We drew temp back to sourceCanvas.

        // Update Interactive Canvas size
        if (this.drawingCanvas) {
            this.drawingCanvas.width = width;
            this.drawingCanvas.height = height;
        }

        // Re-setup Preview (Scale might change)
        this.setupPreview({ width, height });

        // Render
        this.requestRender();
    }

    generateUI() {
        this.ui.clear();

        // VIEW OPTIONS
        const viewGroup = this.ui.createModuleGroup("VIEW OPTIONS", null, "Editor helpers.");
        viewGroup.addToggle("SHOW GRID (16x16)", this.showGrid, (v) => {
            this.showGrid = v;
            this.requestRender();
        });

        // Preview Resolution Selector - absolute pixel sizes matching export
        viewGroup.addSelect("PREVIEW SIZE", [
            { label: "1x1", value: 1 },
            { label: "2x2", value: 2 },
            { label: "4x4", value: 4 },
            { label: "8x8", value: 8 },
            { label: "16x16", value: 16 },
            { label: "32x32", value: 32 },
            { label: "64x64", value: 64 },
            { label: "128x128", value: 128 },
            { label: "256x256", value: 256 },
            { label: "512x512", value: 512 },
            { label: "1024x1024", value: 1024 },
            { label: "2048x2048", value: 2048 }
        ], this.previewResolution || 512, (v) => {
            this.previewResolution = parseInt(v);
            console.log("Preview resolution changed to:", this.previewResolution);
            // Rebuild preview with new resolution
            if (this.sourceCanvas && this.sourceCanvas.width > 0) {
                this.setupPreviewWithResolution(this.previewResolution);
                this.requestRender();
            }
        }, "Preview at export resolution");

        // --- TEXTURE / BACKGROUND CONTROLS ---
        const bgGroup = this.ui.createModuleGroup("CANVAS / TEXTURE EXPORT", null, "Hide source image to export texture overlays.");
        bgGroup.addSelect("BACKGROUND", [
            { label: "SOURCE IMAGE", value: 'image' },
            { label: "SOLID COLOR", value: 'color' },
            { label: "TRANSPARENT", value: 'transparent' }
        ], this.backgroundMode, (v) => {
            this.backgroundMode = v;
            this.requestRender();
        });

        // Color Picker (Only if Color mode) - Dynamic UI updates not fully implemented in UIBuilder, 
        // so we just show it always or let user toggle. 
        // Showing always is simpler for V1.
        bgGroup.addColor("BG COLOR", this.backgroundColor, (v) => {
            this.backgroundColor = v;
            if (this.backgroundMode === 'color') this.requestRender();
        });

        // --- EXPORT SETTINGS ---
        const expGroup = this.ui.createModuleGroup("EXPORT SETTINGS", null, "Configure texture output.");

        // FORMAT
        expGroup.addSelect("FORMAT", [
            { label: 'PNG (Standard)', value: 'png' }
        ], this.exportSettings.format, (v) => {
            this.exportSettings.format = v;
        }, "PNG is best for Minecraft textures.");

        // RESOLUTIONS
        const resGroup = document.createElement('div');
        resGroup.className = 'control-group';
        resGroup.style.display = 'flex';
        resGroup.style.flexDirection = 'column';
        resGroup.style.gap = '5px';
        resGroup.innerHTML = `<label style="font-size:0.75rem; color:#aaa; margin-bottom:5px;">OUTPUT RESOLUTIONS</label>`;

        const resolutions = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
        const resContainer = document.createElement('div');
        resContainer.style.display = 'grid';
        resContainer.style.gridTemplateColumns = '1fr 1fr';
        resContainer.style.gap = '5px';

        resolutions.forEach(res => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '5px';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = this.exportSettings.resolutions[res];
            cb.onchange = (e) => this.exportSettings.resolutions[res] = e.target.checked;

            const lbl = document.createElement('label');
            lbl.textContent = `${res}x`;
            lbl.style.fontSize = '0.85rem';

            row.appendChild(cb);
            row.appendChild(lbl);
            resContainer.appendChild(row);
        });
        resGroup.appendChild(resContainer);

        // Current/Original
        const rowOrg = document.createElement('div');
        rowOrg.style.display = 'flex';
        rowOrg.style.alignItems = 'center';
        rowOrg.style.gap = '10px';
        rowOrg.style.marginTop = '5px';
        const cbOrg = document.createElement('input');
        cbOrg.type = 'checkbox';
        cbOrg.checked = this.exportSettings.original;
        cbOrg.onchange = (e) => this.exportSettings.original = e.target.checked;
        const lblOrg = document.createElement('label');
        lblOrg.textContent = "Original Size";
        rowOrg.appendChild(cbOrg);
        rowOrg.appendChild(lblOrg);
        resGroup.appendChild(rowOrg);

        expGroup.content.appendChild(resGroup);


        this.pipeline.forEach(effect => {
            // Pass description if available in effect
            effect.getControls(this.ui, this.state[effect.id], (key, value) => {
                this.state[effect.id][key] = value;
                this.requestRender();
            });
        });

        // Re-attach Animation Controls if they exist
        if (this.animator) {
            this.animator.setupUI();
        }
    }

    requestRender() {
        if (this.animator && this.animator.isPlaying) return;

        // Show Loading
        this.toggleLoading(true);

        if (this.renderTimeout) clearTimeout(this.renderTimeout);

        // Debounce 30ms for responsiveness
        this.renderTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                if (this.sourceType === 'video') this.renderVideo();
                else this.render();
                this.toggleLoading(false);
            });
        }, 30);
    }

    toggleLoading(show) {
        let loader = document.getElementById('proc-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'proc-loader';
            loader.innerHTML = `<div class="spinner"></div><span>PROCESSING...</span>`;
            // Inline styles for speed
            loader.style.position = 'absolute';
            loader.style.top = '10px';
            loader.style.right = '10px';
            loader.style.background = 'rgba(0,0,0,0.8)';
            loader.style.color = '#0f0';
            loader.style.padding = '5px 10px';
            loader.style.border = '1px solid #0f0';
            loader.style.fontFamily = 'monospace';
            loader.style.display = 'none';
            loader.style.pointerEvents = 'none';
            loader.style.zIndex = '1000';

            const container = document.querySelector('.preview-container');
            if (container) container.appendChild(loader);

            const style = document.createElement('style');
            style.textContent = `
            .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid #0f0; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 5px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `;
            document.head.appendChild(style);
        }
        loader.style.display = show ? 'flex' : 'none';
    }

    render() {
        console.log("=== RENDER START ===");

        if (!this.sourceCanvas) {
            console.error("RENDER ABORT: sourceCanvas is null/undefined");
            return;
        }

        console.log("sourceCanvas dimensions:", this.sourceCanvas.width, "x", this.sourceCanvas.height);
        console.log("main canvas dimensions:", this.canvas.width, "x", this.canvas.height);
        console.log("backgroundMode:", this.backgroundMode);

        // Try GPU Render First - Passing sourceCanvas instead of Image
        if (this.tryGPURender(this.sourceCanvas, 1.0)) {
            console.log("RENDER: GPU render completed");
            return;
        }

        console.log("RENDER: Falling back to CPU render");

        // Fallback to CPU
        const w = this.canvas.width;
        const h = this.canvas.height;

        if (w === 0 || h === 0) {
            console.error("RENDER ABORT: canvas has zero dimensions", w, h);
            return;
        }

        this.ctx.clearRect(0, 0, w, h);

        // CRITICAL: Disable antialiasing for pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;

        if (this.backgroundMode === 'color') {
            console.log("RENDER: Drawing solid color background");
            this.ctx.fillStyle = this.backgroundColor;
            this.ctx.fillRect(0, 0, w, h);
        } else if (this.backgroundMode === 'image') {
            console.log("RENDER: Drawing sourceCanvas to main canvas (no smoothing)");
            // Draw from Source Canvas (which contains the edited image)
            try {
                this.ctx.drawImage(this.sourceCanvas, 0, 0, w, h);
                console.log("RENDER: drawImage completed successfully");
            } catch (e) {
                console.error("RENDER: drawImage FAILED:", e);
            }
        }
        // If transparent, we already cleared.

        // Run Pipeline on Preview
        this.pipeline.forEach(effect => {
            effect.process(this.ctx, this.canvas.width, this.canvas.height, this.state[effect.id], 1.0);
        });

        if (this.showGrid) {
            this.drawGrid();
        }

        console.log("=== RENDER COMPLETE ===");
    }


    drawGrid() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const ctx = this.ctx;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Verticals
        for (let x = 0; x <= w; x += this.gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }

        // Horizontals
        for (let y = 0; y <= h; y += this.gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    tryGPURender(source, scaleFactor) {
        // DEBUG: Force CPU render to rule out WebGL issues
        console.warn("ImageProcessor: WebGL disabled for debugging.");
        return false;

        if (!this.useGPU || !this.glManager) return false;

        // Check if ALL enabled effects have WebGL support
        // Mixing CPU and GPU is expensive (readPixels), so we only use GPU if we can stay on GPU 
        // OR if the heavy effects are at the end? 
        // For V1, simplest is: if ANY heavy effect is on, try GPU for that, but we need to pass textures.

        // Let's iterate. 
        // If an effect has `shaderSource`, we can use GPU.
        // If it doesn't, we must use CPU.

        // Strategy: 
        // 1. Upload Source to GPU Texture
        // 2. Ping-Pong? Or just apply effects sequentially if they are all GPU.
        // 3. If we hit a CPU effect, we readPixels -> CPU process -> uploadTexture? Too slow.

        // Optimization: Only use GPU if Halftone or Dither(Bayer) is enabled.
        // PreProcess (Blur/Levels) is fast enough on CPU usually, BUT handling 4k video?
        // Let's implement partial GPU pipeline:
        // Render CPU effects first to a canvas, then upload to GPU for Halftone/Dither?

        const activeEffects = this.pipeline.filter(e => this.state[e.id].enabled);
        if (activeEffects.length === 0) return false; // Just draw image

        // Identifying split point
        // If we have CPU effects only -> CPU
        // If we have GPU effects -> Do we have CPU effects *after* GPU effects?

        // For this task, Halftone and Dither are the heavy ones and they correspond to the END of pipeline usually.
        // Pipeline: Pre(CPU) -> Halftone(GPU) -> Dither(GPU) -> Glitch(CPU/GPU)

        // 1. Execute CPU-only effects at the start on temp canvas or main canvas
        // Handle Background Logic
        // We draw to 'this.ctx' (Main Canvas) as a base.
        const w = this.canvas.width;
        const h = this.canvas.height;

        this.ctx.clearRect(0, 0, w, h);

        if (this.backgroundMode === 'color') {
            this.ctx.fillStyle = this.backgroundColor;
            this.ctx.fillRect(0, 0, w, h);
        } else if (this.backgroundMode === 'image') {
            this.ctx.drawImage(source, 0, 0, w, h);
        }
        // Transparent: Just clear (done)

        const gpuEffects = [];
        let cpuEnded = false;

        // Run CPU effects until we hit a GPU capable one?
        // Actually, let's just run PreProcess (always CPU for now)
        // Then run Halftone/Dither on GPU. 

        // This hybrid approach:
        // 1. Draw Source to Context.
        // 2. PreProcessEffect.process(ctx...) (CPU)
        // 3. Upload Context to GPU.
        // 4. Run Halftone/Dither on GPU.
        // 5. Draw GPU result back to Context.

        // Valid? Yes.

        // Run CPU Pre-pass
        const pre = this.pipeline.find(p => p.id === 'preprocess_v1');
        if (pre && this.state[pre.id].enabled) {
            pre.process(this.ctx, this.canvas.width, this.canvas.height, this.state[pre.id], scaleFactor);
        }
        const glitch = this.pipeline.find(p => p.id === 'glitch_v1'); // Post CPU for now

        // GPU Candidates
        const halftone = this.pipeline.find(p => p.id === 'halftone_v1');
        const dither = this.pipeline.find(p => p.id === 'dither_v1');

        const useHalftone = (halftone && this.state[halftone.id].enabled);
        const useDither = (dither && this.state[dither.id].enabled && dither.isGPUSupported && dither.isGPUSupported(this.state[dither.id]));

        if (!useHalftone && !useDither) {
            // All CPU or standard pipeline
            // Just run the rest on CPU
            // Dither might be enabled but not GPU supported (e.g. Floyd)
            if (dither && this.state[dither.id].enabled) {
                dither.process(this.ctx, this.canvas.width, this.canvas.height, this.state[dither.id], scaleFactor);
            }
            // Halftone is always GPU candidate but if we are here it's disabled.

            if (glitch && this.state[glitch.id].enabled) {
                glitch.process(this.ctx, this.canvas.width, this.canvas.height, this.state[glitch.id], scaleFactor);
            }
            return true; // We handled it
        }

        // --- GPU PASS ---
        this.gpuCanvas.width = this.canvas.width;
        this.gpuCanvas.height = this.canvas.height;
        this.glManager.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // Upload current state (with PreProcess applied)
        this.glManager.uploadTexture(this.canvas); // Texture0

        // Apply Halftone
        if (useHalftone) {
            const prog = 'halftone';
            if (!this.glManager.programs[prog]) {
                this.glManager.createProgram(prog, halftone.shaderSource);
            }
            this.glManager.useProgram(prog);
            const uniforms = halftone.getUniforms(this.state[halftone.id], this.canvas.width, this.canvas.height, scaleFactor);
            for (let k in uniforms) {
                const type = Array.isArray(uniforms[k]) ? (uniforms[k].length + 'f') : '1f';
                if (k === 'u_mode' || k === 'u_algo') this.glManager.setUniform(k, '1i', uniforms[k]);
                else this.glManager.setUniform(k, type, uniforms[k]);
            }

            // Draw to screen? Or to temp buffer?
            // Since we have multiple passes, we need Framebuffers (FBO).
            // For V1, if support multiple GPU effects, we need ping-pong.
            // If we limit to ONE heavy effect or chaining, we need FBO.

            // Quick hack for V1: 
            // If ONLY Halftone: Draw to Screen.
            // If ONLY Dither: Draw to Screen.
            // If Both: We need FBO.

            if (useHalftone && !useDither) {
                this.glManager.draw();
            } else if (useHalftone && useDither) {
                // Render Halftone to Texture (via FBO - unimplemented in manager for conciseness)
                // Implementing simple Copy:
                this.glManager.draw();
                // Read back? No, copy to texture.
                const gl = this.glManager.gl;
                gl.activeTexture(gl.TEXTURE0);
                gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, this.canvas.width, this.canvas.height, 0);
            }
        }

        if (useDither) {
            const prog = 'dither';
            if (!this.glManager.programs[prog]) {
                this.glManager.createProgram(prog, dither.shaderSource);
            }
            this.glManager.useProgram(prog);
            const uniforms = dither.getUniforms(this.state[dither.id], this.canvas.width, this.canvas.height, scaleFactor);
            for (let k in uniforms) {
                const type = Array.isArray(uniforms[k]) ? (uniforms[k].length + 'f') : '1f';
                if (k === 'u_mode' || k === 'u_algo') this.glManager.setUniform(k, '1i', uniforms[k]);
                else this.glManager.setUniform(k, type, uniforms[k]);
            }
            this.glManager.draw();
        }

        // Draw GPU Result back to Main Canvas
        this.ctx.drawImage(this.gpuCanvas, 0, 0);

        // CPU Post-Process (Glitch)
        if (glitch && this.state[glitch.id].enabled) {
            glitch.process(this.ctx, this.canvas.width, this.canvas.height, this.state[glitch.id], scaleFactor);
        }

        return true;
    }

    renderVideo() {
        if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) return;

        // Try GPU
        if (this.useGPU && this.glManager) {
            // GPU Path
            // Draw Video Frame to Context (Need simple blit)
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

            // Reuse the tryGPURender logic but we need to ensure it uses the context we just drew to
            // tryGPURender(source) uses source to draw to ctx initially.
            // We can pass videoElement as source.
            this.tryGPURender(this.videoElement, 1.0);

        } else {
            // CPU Legacy Path
            this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
            this.pipeline.forEach(effect => {
                effect.process(this.ctx, this.canvas.width, this.canvas.height, this.state[effect.id], 1.0);
            });
        }

        // Loop
        if (this.sourceType === 'video') {
            // Use requestVideoFrameCallback if available for smoother playback
            if ('requestVideoFrameCallback' in this.videoElement) {
                this.videoElement.requestVideoFrameCallback(() => this.renderVideo());
            } else {
                requestAnimationFrame(() => this.renderVideo());
            }
        }
    }

    applyPreset(p) {
        let w = 1920, h = 1080;
        switch (p) {
            case '144p': w = 256; h = 144; break;
            case '240p': w = 426; h = 240; break;
            case '480p': w = 854; h = 480; break;
            case '720p': w = 1280; h = 720; break;
            case '1080p': w = 1920; h = 1080; break;
            case '1440p': w = 2560; h = 1440; break;
            case '2k': w = 2048; h = 1080; break;
            case '4k': w = 3840; h = 2160; break;
            case '8k': w = 7680; h = 4320; break;
        }
        // If "Lock Aspect" is on, we might need to adjust H to match W using original aspect?
        // Or Preselects override "Lock Aspect" temporarily? 
        // Presets are explicit WxH usually. 
        // But 4K is 3840x2160 (16:9). If image is 4:3, forcing 16:9 stretches it.
        // Better: Set Largest Dimension, scale other?
        // User asked for "144p...". Usually implies height.
        // Let's implement: "Set Height to X, calc Width" logic for 'p' definitions.

        if (p.endsWith('p')) {
            h = parseInt(p); // 144, 240...
            // Calc W based on original aspect
            if (this.originalImage) {
                const r = this.originalImage.width / this.originalImage.height;
                w = Math.round(h * r);
            } else {
                w = Math.round(h * (16 / 9)); // Fallback
            }
        } else {
            // 2k, 4k... usually Width based?
            // 4K DCI is 4096, UHD is 3840.
            if (p === '2k') w = 2048;
            if (p === '4k') w = 3840;
            if (p === '8k') w = 7680;

            if (this.originalImage) {
                const r = this.originalImage.height / this.originalImage.width;
                h = Math.round(w * r);
            }
        }

        this.exportSettings.customWidth = w;
        this.exportSettings.customHeight = h;
        this.generateUI();
    }

    applyRatio(r) {
        if (!this.originalImage) return;
        let targetRatio = 1;
        if (r === 'original') targetRatio = this.originalImage.width / this.originalImage.height;
        else if (r === '1:1') targetRatio = 1;
        else if (r === '4:3') targetRatio = 4 / 3;
        else if (r === '16:9') targetRatio = 16 / 9;
        else if (r === '9:16') targetRatio = 9 / 16;
        else if (r === '21:9') targetRatio = 21 / 9;

        // Adjust Height to match Width
        // Or Adjust Width? 
        // Let's adjust Height to match current Width * (1/Ratio)

        this.exportSettings.customHeight = Math.round(this.exportSettings.customWidth / targetRatio);
        this.generateUI();
    }


    async exportResult() {
        const settings = this.exportSettings;
        const resolutions = [];

        // Collect requested resolutions
        for (const [res, enabled] of Object.entries(settings.resolutions)) {
            if (enabled) resolutions.push(parseInt(res));
        }
        if (settings.original) resolutions.push('original');

        if (resolutions.length === 0) {
            alert("Please select at least one output resolution.");
            return;
        }

        this.toggleLoading(true);

        try {
            if (!window.JSZip) throw new Error("JSZip library not loaded.");
            const zip = new JSZip();
            const folder = zip.folder("textures");

            for (const res of resolutions) {
                let w, h;
                if (res === 'original') {
                    // Use Source Canvas dimensions
                    w = this.sourceCanvas.width;
                    h = this.sourceCanvas.height;
                } else {
                    w = res;
                    h = res;
                    // Maintain aspect ratio if source is not square
                    if (this.sourceCanvas.width !== this.sourceCanvas.height) {
                        const ratio = this.sourceCanvas.height / this.sourceCanvas.width;
                        h = Math.round(w * ratio);
                    }
                }

                const cvs = document.createElement('canvas');
                cvs.width = w;
                cvs.height = h;
                const ctx = cvs.getContext('2d');
                ctx.imageSmoothingEnabled = false;

                // Draw Source (Scaled)
                ctx.drawImage(this.sourceCanvas, 0, 0, w, h);

                // Apply Effects (Scaled)
                // Note: We use 1.0 scale relative to the new canvas size
                this.pipeline.forEach(effect => {
                    // Check if effect is enabled
                    if (this.state[effect.id] && this.state[effect.id].enabled) {
                        effect.process(ctx, w, h, this.state[effect.id], 1.0);
                    }
                });

                // Add to Zip
                const blob = await new Promise(r => cvs.toBlob(r, 'image/png'));
                const filename = res === 'original' ? `original_${w}x${h}.png` : `texture_${w}x${h}.png`;
                folder.file(filename, blob);
            }

            const content = await zip.generateAsync({ type: "blob" });

            // Download
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `MC_TEXTURES_${Date.now()}.zip`;
            a.click();
            URL.revokeObjectURL(url);

        } catch (e) {
            alert("Export Failed: " + e.message);
            console.error(e);
        } finally {
            this.toggleLoading(false);
        }
    }

    async saveToPack() {
        if (!this.onSaveToPack) {
            alert("Pack Builder not connected!");
            return;
        }
        if (!this.originalImage) return;

        // Force RGBA PNG export (standard for MC textures)
        const format = 'image/png';
        const quality = 1.0;

        // Create Temp Canvas
        const tempCanvas = document.createElement('canvas');
        // Use Custom Width/Height from settings if set, OR Original Image Size
        let w = this.originalImage.width;
        let h = this.originalImage.height;

        // If 'RESIZE' is set to custom, use it.
        if (this.exportSettings.resizeMode === 'custom') {
            w = this.exportSettings.customWidth;
            h = this.exportSettings.customHeight;
        }

        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Draw Original
        ctx.drawImage(this.originalImage, 0, 0, w, h);

        // Apply Effects
        this.pipeline.forEach(effect => {
            effect.process(ctx, w, h, this.state[effect.id], 1.0); // 1.0 scale
        });

        // To Blob
        const blob = await new Promise(r => tempCanvas.toBlob(r, format, quality));

        // Determine Path
        let path = this.currentFilePath || `mask/texture_${Date.now()}.png`;
        // Note: MC usually expects assets/minecraft/textures/...
        // If loaded from extractor, path is clean (e.g. block/dirt.png).
        // PackBuilder accepts relative paths within assets/minecraft/textures?
        // Let's assume PackBuilder handles prefixing or we do it here.
        // PackBuilder.addFile docs: "path should be relative to root (e.g. 'assets/minecraft/textures/block/dirt.png')"
        // So we need full path.
        // If extractor provided `block/dirt.png`, we need to prepend `assets/minecraft/textures/`.
        // But extractor stripped it!
        // So we need to reconstruct it.

        // Logic: if path doesn't start with assets/, prepend based on type.
        // For ImageProcessor, it's usually textures.
        if (!path.startsWith('assets/')) {
            path = `assets/minecraft/textures/${path}`;
        }
        // Ensure .png
        if (!path.endsWith('.png')) path += '.png';

        if (this.onSaveToPack) {
            this.onSaveToPack(blob, path);

            // Visual Feedback
            const btn = document.getElementById('save-pack-btn');
            if (btn) {
                const oldText = btn.textContent;
                btn.textContent = "SAVED!";
                setTimeout(() => btn.textContent = oldText, 1000);
            }
        }
    }
    stop() {
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = "";
            this.videoElement.remove();
            this.videoElement = null;
        }
        if (this.animator) {
            this.animator = null; // or stop()
        }
        if (this.batchManager) {
            this.batchManager.destroy();
            this.batchManager = null;
        }
        // Cleanup WebGL
        if (this.glManager) {
            // this.glManager.destroy(); // if exists
            this.glManager = null;
        }
    }
}

