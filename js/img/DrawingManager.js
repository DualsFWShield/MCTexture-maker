export class DrawingManager {
    constructor(imageProcessor) {
        this.processor = imageProcessor;
        this.canvas = imageProcessor.canvas;
        this.ctx = imageProcessor.ctx;

        this.activeTool = 'pencil'; // pencil, eraser, picker, bucket
        this.brushSize = 1;
        this.color = '#ffffff';
        this.isDrawing = false;

        this.history = [];
        this.historyIndex = -1;

        this.initEventListeners();
    }

    initEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseleave', () => this.stopDrawing());

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrawing(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return {
            x: Math.floor((evt.clientX - rect.left) * scaleX),
            y: Math.floor((evt.clientY - rect.top) * scaleY)
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.saveState(); // Save for undo
        this.draw(e);
    }

    stopDrawing() {
        this.isDrawing = false;
        this.processor.requestRender(); // Ensure WebGL updates if needed
    }

    draw(e) {
        if (!this.isDrawing && this.activeTool !== 'picker') return;
        if (this.activeTool === 'picker' && !this.isDrawing) return; // Wait for click for picker? No, click is startDrawing

        const pos = this.getMousePos(e);
        const x = pos.x;
        const y = pos.y;

        if (x < 0 || x >= this.canvas.width || y < 0 || y >= this.canvas.height) return;

        if (this.activeTool === 'pencil') {
            this.ctx.fillStyle = this.color;
            this.ctx.fillRect(x, y, 1, 1);
        } else if (this.activeTool === 'eraser') {
            this.ctx.clearRect(x, y, 1, 1);
        } else if (this.activeTool === 'picker') {
            this.pickColor(x, y);
            this.isDrawing = false; // Single click action
        } else if (this.activeTool === 'bucket') {
            this.floodFill(x, y, this.color);
            this.isDrawing = false; // Single click action
        }

        // If not rendering via WebGL pipeline constantly, we might need to manually trigger updates?
        // But for now, we are waiting for requestRender() in stopDrawing vs continuous?
        // Let's do partial updates if needed, but ImageProcessor typically re-renders whole effects stack.
        // For pure pixel art, we might be editing the "Source" image usually.
        // Needs integration check: Is ImageProcessor.originalImage updated? 
        // Or are we drawing on top of the effects? 
        // Strategy: We draw on the canvas, but the effects pipeline clears it?
        // FIX: We should be drawing on a "drawing layer" or directly modifying the source image if possible.
        // For simplicity V1: We are drawing on the canvas. 
        // If the pipeline runs, it will likely wipe this unless we save it back to `originalImage`.

        // IMMEDIATE FIX: Update originalImage data
        // This is expensive for every pixel. 
        // Better: Draw to an offscreen canvas that IS the source?
        // Check ImageProcessor integration in next step.
    }

    pickColor(x, y) {
        const p = this.ctx.getImageData(x, y, 1, 1).data;
        const hex = "#" +
            ("000000" + this.rgbToHex(p[0], p[1], p[2])).slice(-6);
        this.color = hex;
        this.updateUI();
    }

    floodFill(startX, startY, fillColor) {
        // Basic Stack-based Flood Fill
        // Need to read entire canvas data
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const startPos = (startY * width + startX) * 4;
        const startR = data[startPos];
        const startG = data[startPos + 1];
        const startB = data[startPos + 2];
        const startA = data[startPos + 3];

        const targetColor = this.hexToRgb(fillColor);

        // If color matches, do nothing
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

        this.ctx.putImageData(imageData, 0, 0);
    }

    saveState() {
        // Implementation for Undo/Redo later
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

    updateUI() {
        // Update color picker input if exists
        const input = document.getElementById('tool-color-picker');
        if (input) input.value = this.color;

        const preview = document.getElementById('tool-color-preview');
        if (preview) preview.style.backgroundColor = this.color;
    }
}
