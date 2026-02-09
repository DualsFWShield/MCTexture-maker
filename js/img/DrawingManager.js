export class DrawingManager {
    constructor(imageProcessor) {
        this.processor = imageProcessor;
        this.canvas = null; // Interactive Layer (preview size, e.g., 512x512)
        this.ctx = null;    // Interactive Layer CTX

        this.sourceCanvas = null; // Actual pixel data (source size, e.g., 16x16)
        this.sourceCtx = null;    // Source Context

        this.activeTool = 'pencil';
        this.brushSize = 1;
        this.color = '#ffffff';
        this.isDrawing = false;
    }

    setTarget(sourceCanvas, interactiveCanvas) {
        this.sourceCanvas = sourceCanvas;
        this.sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });

        this.canvas = interactiveCanvas;
        this.ctx = interactiveCanvas.getContext('2d');

        // DO NOT sync sizes - interactive canvas is larger (preview size)
        // Source is actual texture size (e.g., 16x16)
        // Interactive/Drawing canvas matches the preview size (e.g., 512x512)
        console.log("DrawingManager: setTarget called");
        console.log("  sourceCanvas:", sourceCanvas.width, "x", sourceCanvas.height);
        console.log("  interactiveCanvas:", interactiveCanvas.width, "x", interactiveCanvas.height);

        this.initEventListeners();
    }

    initEventListeners() {
        if (!this.canvas) return;

        // Remove old listeners if any (simple way: clone node, but we are in module)
        // Ideally we handle cleanup, but for now assuming one init per reload.

        this.canvas.onmousedown = (e) => this.startDrawing(e);
        this.canvas.onmousemove = (e) => this.draw(e);
        this.canvas.onmouseup = () => this.stopDrawing();
        this.canvas.onmouseleave = () => this.stopDrawing();

        // Touch
        this.canvas.ontouchstart = (e) => { e.preventDefault(); this.startDrawing(e.touches[0]); };
        this.canvas.ontouchmove = (e) => { e.preventDefault(); this.draw(e.touches[0]); };
        this.canvas.ontouchend = () => this.stopDrawing();

        console.log("DrawingManager: Event listeners attached to canvas");
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();

        // Get the position within the canvas element (0 to 1)
        const relativeX = (evt.clientX - rect.left) / rect.width;
        const relativeY = (evt.clientY - rect.top) / rect.height;

        // Map to source canvas coordinates (e.g., for 16x16 texture)
        const sourceX = Math.floor(relativeX * this.sourceCanvas.width);
        const sourceY = Math.floor(relativeY * this.sourceCanvas.height);

        // Clamp to valid range
        return {
            x: Math.max(0, Math.min(this.sourceCanvas.width - 1, sourceX)),
            y: Math.max(0, Math.min(this.sourceCanvas.height - 1, sourceY))
        };
    }

    startDrawing(e) {
        const pos = this.getMousePos(e);

        if (this.activeTool === 'text') {
            const text = prompt("Enter text:", "Sample");
            if (text) {
                this.sourceCtx.fillStyle = this.color;
                this.sourceCtx.font = "10px monospace";
                this.sourceCtx.textBaseline = "top";
                this.sourceCtx.fillText(text, pos.x, pos.y);
                this.processor.requestRender();
            }
            return;
        }

        this.isDrawing = true;
        this.dragStart = pos;

        if (this.activeTool === 'select') {
            this.selection = null;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.draw(e);
        }
    }

    stopDrawing() {
        this.isDrawing = false;
        this.dragStart = null;
        this.processor.requestRender();
    }

    draw(e) {
        if (!this.isDrawing && this.activeTool !== 'picker') return;
        if (this.activeTool === 'picker' && !this.isDrawing) return;

        const pos = this.getMousePos(e);
        const x = pos.x;
        const y = pos.y;

        if (!this.sourceCanvas) return;

        // DRAW DIRECTLY TO SOURCE
        // Because for pixel art, we want to see immediate effect on the "base layer"
        // and let ImageProcessor re-render the effects stack on top.

        const ctx = this.sourceCtx;

        if (this.activeTool === 'pencil') {
            ctx.fillStyle = this.color;
            ctx.fillRect(x, y, 1, 1);
        } else if (this.activeTool === 'eraser') {
            ctx.clearRect(x, y, 1, 1);
        } else if (this.activeTool === 'picker') {
            this.pickColor(x, y);
            this.isDrawing = false;
        } else if (this.activeTool === 'bucket') {
            this.floodFill(x, y, this.color);
            this.isDrawing = false;
        } else if (this.activeTool === 'select' && this.isDrawing && this.dragStart) {
            const w = x - this.dragStart.x;
            const h = y - this.dragStart.y;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.strokeStyle = '#fff';
            this.ctx.setLineDash([4, 2]);
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(this.dragStart.x + 0.5, this.dragStart.y + 0.5, w, h);
            this.ctx.setLineDash([]);

            this.selection = {
                x: w > 0 ? this.dragStart.x : x,
                y: h > 0 ? this.dragStart.y : y,
                w: Math.abs(w),
                h: Math.abs(h)
            };
        }

        if (this.activeTool !== 'select') {
            this.processor.requestRender();
        }

        // Trigger Pipeline Update
        this.processor.requestRender();
    }

    pickColor(x, y) {
        const p = this.sourceCtx.getImageData(x, y, 1, 1).data;
        const hex = "#" +
            ("000000" + this.rgbToHex(p[0], p[1], p[2])).slice(-6);
        this.color = hex;
        // Update UI
        if (this.processor.updateToolbarColor) {
            this.processor.updateToolbarColor(this.color);
        }
    }

    floodFill(startX, startY, fillColor) {
        const width = this.sourceCanvas.width;
        const height = this.sourceCanvas.height;
        const imageData = this.sourceCtx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const startPos = (startY * width + startX) * 4;
        const startR = data[startPos];
        const startG = data[startPos + 1];
        const startB = data[startPos + 2];
        const startA = data[startPos + 3];

        const targetColor = this.hexToRgb(fillColor);
        if (startR === targetColor.r && startG === targetColor.g && startB === targetColor.b && startA === 255) return;

        const matchStartColor = (pos) => {
            return data[pos] === startR && data[pos + 1] === startG && data[pos + 2] === startB && data[pos + 3] === startA;
        };

        const colorPixel = (pos) => {
            data[pos] = targetColor.r;
            data[pos + 1] = targetColor.g;
            data[pos + 2] = targetColor.b;
            data[pos + 3] = 255;
        };

        const stack = [[startX, startY]];

        while (stack.length) {
            const [x, y] = stack.pop();
            const pos = (y * width + x) * 4;

            if (matchStartColor(pos)) {
                colorPixel(pos);
                if (x > 0) stack.push([x - 1, y]);
                if (x < width - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < height - 1) stack.push([x, y + 1]);
            }
        }
        this.sourceCtx.putImageData(imageData, 0, 0);
    }

    rgbToHex(r, g, b) {
        if (r > 255 || g > 255 || b > 255)
            throw "Invalid color component";
        return ((r << 16) | (g << 8) | b).toString(16);
    }

    hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
}
