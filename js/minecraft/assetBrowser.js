/**
 * assetBrowser.js
 * Visual browser for extracted Minecraft assets (Textures & Sounds).
 */

export class AssetBrowser {
    constructor(containerId, extractor, onSelect) {
        this.container = document.getElementById(containerId);
        this.extractor = extractor;
        this.onSelect = onSelect; // (file, type) => {}
        this.currentPath = [];
        this.folderStructure = {};
    }

    buildStructure() {
        this.folderStructure = {};

        // Textures
        if (this.extractor.assets.textures) {
            Object.keys(this.extractor.assets.textures).forEach(path => {
                this.addToStructure(path, 'texture');
            });
        }

        // Sounds
        if (this.extractor.assets.sounds) {
            Object.keys(this.extractor.assets.sounds).forEach(path => {
                if (path.endsWith('.ogg')) this.addToStructure(path, 'sound');
            });
        }

        this.render();
    }

    addToStructure(path, type) {
        const parts = path.split('/');
        let current = this.folderStructure;

        parts.forEach((part, index) => {
            if (index === parts.length - 1) {
                // File
                current[part] = type;
            } else {
                // Directory
                if (!current[part]) current[part] = {};
                // If it was marked as a file (collision?), overwrite or ignore?
                // Minecraft assets usually clean, but 'item' folder vs 'item.png' could conflict if not careful.
                // Usually folders and files are distinct.
                if (typeof current[part] === 'string') {
                    // It was a file, but now acts as folder? 
                    // This happens if we have 'foo' file and 'foo/bar' file.
                    // In MC assets, 'textures/entity/steve.png' vs 'textures/entity/steve/...'
                    // We'll prioritize folder and maybe lose the file or rename it?
                    // Let's assume distinct.
                    current[part] = {};
                }
                current = current[part];
            }
        });
    }

    render() {
        this.container.innerHTML = '';

        // Navigation
        const nav = document.createElement('div');
        nav.className = 'asset-nav';

        const homeBtn = document.createElement('button');
        homeBtn.textContent = '🏠 assets';
        homeBtn.className = 'nav-btn';
        homeBtn.onclick = () => { this.currentPath = []; this.render(); };
        nav.appendChild(homeBtn);

        this.currentPath.forEach((folder, index) => {
            const span = document.createElement('span');
            span.textContent = ' > ';
            nav.appendChild(span);

            const btn = document.createElement('button');
            btn.textContent = folder;
            btn.className = 'nav-btn';
            btn.onclick = () => {
                this.currentPath = this.currentPath.slice(0, index + 1);
                this.render();
            };
            nav.appendChild(btn);
        });

        this.container.appendChild(nav);

        // Grid
        const grid = document.createElement('div');
        grid.className = 'asset-grid';

        let currentDir = this.folderStructure;
        this.currentPath.forEach(p => {
            if (currentDir && currentDir[p]) currentDir = currentDir[p];
            else currentDir = {};
        });

        // Entries
        const entries = Object.entries(currentDir).sort((a, b) => {
            const aIsFile = typeof a[1] === 'string';
            const bIsFile = typeof b[1] === 'string';
            if (!aIsFile && bIsFile) return -1;
            if (aIsFile && !bIsFile) return 1;
            return a[0].localeCompare(b[0]);
        });

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-msg';
            empty.textContent = "Empty Folder";
            grid.appendChild(empty);
        }

        entries.forEach(([name, type]) => {
            const item = document.createElement('div');
            item.className = 'asset-item';

            if (typeof type !== 'string') {
                // Folder
                item.classList.add('folder');
                item.innerHTML = `
                    <div class="icon">📁</div>
                    <div class="name">${name}</div>
                `;
                item.onclick = () => {
                    this.currentPath.push(name);
                    this.render();
                };
            } else {
                // File
                const fullPath = [...this.currentPath, name].join('/');
                item.classList.add('file');

                if (type === 'texture') {
                    const blob = this.extractor.getTexture(fullPath);
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        item.innerHTML = `
                            <div class="thumb" style="background-image: url('${url}')"></div>
                            <div class="name">${name}</div>
                        `;
                    }
                    item.onclick = () => {
                        const blob = this.extractor.getTexture(fullPath);
                        if (blob) {
                            const file = new File([blob], name, { type: 'image/png' });
                            if (this.onSelect) this.onSelect(file, 'image');
                        }
                    };
                } else if (type === 'sound') {
                    item.classList.add('sound-file');
                    item.innerHTML = `
                        <div class="icon">🔊</div>
                        <div class="name">${name}</div>
                    `;
                    item.onclick = () => {
                        const blob = this.extractor.getSound(fullPath);
                        if (blob) {
                            const file = new File([blob], name, { type: 'audio/ogg' });
                            if (this.onSelect) this.onSelect(file, 'audio');
                        }
                    };
                }
            }
            grid.appendChild(item);
        });

        this.container.appendChild(grid);

        // Add styles for new elements if not present
        const styleId = 'asset-browser-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .asset-nav { padding: 10px; background: #222; border-bottom: 1px solid #333; overflow-x: auto; white-space: nowrap; }
                .nav-btn { background: none; border: none; color: #aaa; cursor: pointer; font-family: monospace; }
                .nav-btn:hover { color: #fff; text-decoration: underline; }
                .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; padding: 10px; }
                .asset-item { background: #333; border: 1px solid #444; border-radius: 4px; padding: 5px; cursor: pointer; text-align: center; }
                .asset-item:hover { background: #444; border-color: #666; }
                .asset-item .icon { font-size: 24px; margin-bottom: 5px; }
                .asset-item .thumb { width: 100%; height: 60px; background-size: contain; background-repeat: no-repeat; background-position: center; margin-bottom: 5px; image-rendering: pixelated; }
                .asset-item .name { font-size: 10px; color: #ccc; word-break: break-all; overflow: hidden; max-height: 24px; }
                .asset-item.sound-file .icon { color: #a965ff; }
            `;
            document.head.appendChild(style);
        }
    }
}
