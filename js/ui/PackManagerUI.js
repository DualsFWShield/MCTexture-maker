import { PackFormats } from '../minecraft/PackFormats.js';

export class PackManagerUI {
    constructor(packBuilder) {
        this.packBuilder = packBuilder;
        this.container = document.getElementById('tab-pack');
    }

    init() {
        // Elements
        this.nameInput = document.getElementById('pack-name');
        this.descInput = document.getElementById('pack-desc');
        this.formatSelect = document.getElementById('pack-format');
        this.typeDisplay = document.getElementById('pack-type-display');

        this.iconDrop = document.getElementById('pack-icon-drop');
        this.iconInput = document.getElementById('pack-icon-input');

        this.listBody = document.getElementById('pack-file-list');
        this.countSpan = document.getElementById('pack-file-count');
        this.buildBtn = document.getElementById('build-pack-btn');

        this.populateFormats();
        this.bindEvents();
        this.render();
    }

    populateFormats() {
        if (!this.formatSelect) return;
        this.formatSelect.innerHTML = '';

        // Sort versions descending
        const versions = Object.keys(PackFormats).sort((a, b) => {
            // Very basic version compare (splitting by .)
            const pa = a.split('.').map(Number);
            const pb = b.split('.').map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const na = pa[i] || 0;
                const nb = pb[i] || 0;
                if (na > nb) return -1;
                if (na < nb) return 1;
            }
            return 0;
        });

        versions.forEach(ver => {
            const fmt = PackFormats[ver];
            const opt = document.createElement('option');
            opt.value = fmt;
            opt.textContent = `${ver} (Format ${fmt})`;
            if (ver === '1.21') opt.selected = true; // Default
            this.formatSelect.appendChild(opt);
        });
    }

    bindEvents() {
        if (this.buildBtn) {
            this.buildBtn.onclick = () => {
                const name = this.nameInput ? this.nameInput.value : "My Pack";
                const desc = this.descInput ? this.descInput.value : "";
                const fmt = this.formatSelect ? parseInt(this.formatSelect.value) : 34;

                this.packBuilder.setMetadata(name, desc, fmt);
                this.packBuilder.exportPack();
            };
        }

        if (this.iconDrop && this.iconInput) {
            this.iconDrop.onclick = () => this.iconInput.click();
            this.iconInput.onchange = (e) => {
                if (e.target.files.length) this.handleIcon(e.target.files[0]);
            };

            this.iconDrop.ondragover = (e) => { e.preventDefault(); this.iconDrop.classList.add('drag-over'); };
            this.iconDrop.ondragleave = (e) => { e.preventDefault(); this.iconDrop.classList.remove('drag-over'); };
            this.iconDrop.ondrop = (e) => {
                e.preventDefault();
                this.iconDrop.classList.remove('drag-over');
                if (e.dataTransfer.files.length) this.handleIcon(e.dataTransfer.files[0]);
            };
        }
    }

    handleIcon(file) {
        if (!file.type.startsWith('image/')) return alert("Not an image!");
        this.packBuilder.setIcon(file);
        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            this.iconDrop.style.backgroundImage = `url(${e.target.result})`;
            this.iconDrop.style.backgroundSize = 'cover';
            this.iconDrop.textContent = ''; // Hide text
        };
        reader.readAsDataURL(file);
    }

    analyzePack() {
        const files = Object.keys(this.packBuilder.files);
        let hasAssets = false;
        let hasData = false;
        let hasShaders = false;

        files.forEach(path => {
            if (path.startsWith('assets/')) hasAssets = true;
            if (path.startsWith('data/')) hasData = true;
            if (path.includes('shaders/')) hasShaders = true;
            // Note: Shaders usually live in assets/minecraft/shaders OR shaders/ (root) for optifine
            if (path.startsWith('shaders/')) hasShaders = true;
        });

        let types = [];
        if (hasAssets) types.push("Resource");
        if (hasData) types.push("Data");
        if (hasShaders) types.push("Shader");

        let label = types.length > 0 ? types.join(" + ") + " Pack" : "Empty";

        if (this.typeDisplay) {
            this.typeDisplay.textContent = label;
            // Color coding
            if (types.length > 1) this.typeDisplay.style.color = '#ffcc00'; // Mixed
            else if (hasShaders) this.typeDisplay.style.color = '#00ffff';
            else if (hasData) this.typeDisplay.style.color = '#ff5555';
            else if (hasAssets) this.typeDisplay.style.color = '#55ff55';
            else this.typeDisplay.style.color = 'var(--text-muted)';
        }
    }

    render() {
        if (!this.listBody) return;

        this.listBody.innerHTML = '';
        const files = this.packBuilder.files;
        const paths = Object.keys(files).sort();

        if (this.countSpan) this.countSpan.textContent = paths.length;

        // Perform analysis
        this.analyzePack();

        paths.forEach(path => {
            const blob = files[path];
            const sizeKB = (blob.size / 1024).toFixed(1);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-path" title="${path}">${path}</td>
                <td>${blob.type.split('/')[1] || 'unknown'}</td>
                <td>${sizeKB} KB</td>
                <td class="col-action">
                    <button class="btn-icon-danger" title="Remove">🗑️</button>
                    <button class="btn-icon-download" title="Download Single">⬇️</button>
                </td>
            `;

            // Remove Action
            tr.querySelector('.btn-icon-danger').onclick = () => {
                if (confirm(`Remove ${path}?`)) {
                    this.packBuilder.removeFile(path);
                    this.render();
                }
            };

            // Download Action
            tr.querySelector('.btn-icon-download').onclick = () => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = path.split('/').pop();
                a.click();
                URL.revokeObjectURL(url);
            };

            this.listBody.appendChild(tr);
        });

        if (paths.length === 0) {
            this.listBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted)">Pack is empty. Save assets from editors to add them here.</td></tr>';
        }
    }

    refresh() {
        this.render();
    }
}
