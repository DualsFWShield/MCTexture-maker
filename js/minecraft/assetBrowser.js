export class AssetBrowser {
    constructor(extractor, onSelect) {
        this.extractor = extractor;
        this.onSelect = onSelect;
        this.container = document.createElement('div');
        this.container.className = 'asset-browser-modal hidden';
        this.isOpen = false;

        this.render();
        document.body.appendChild(this.container);
    }

    render(isSidebar = false) {
        if (isSidebar) {
            this.container.innerHTML = `
                <div class="ab-sidebar-layout">
                    <div class="ab-header-compact">
                        <input type="text" id="ab-search" placeholder="Search...">
                        <div class="ab-cats-mini">
                            <button class="ab-cat-mini active" data-cat="texture" title="Textures">🖼️</button>
                            <button class="ab-cat-mini" data-cat="model" title="Models">📦</button>
                            <button class="ab-cat-mini" data-cat="sound" title="Sounds">🔊</button>
                        </div>
                    </div>
                    <div class="ab-list" id="ab-list">
                        <!-- Items injected here -->
                    </div>
                </div>
            `;
            // Remove modal classes if present
            this.container.classList.remove('asset-browser-modal', 'modal-overlay');
            this.container.classList.add('asset-browser-sidebar');
        } else {
            this.container.innerHTML = `
                <div class="asset-browser-content">
                    <div class="ab-header">
                        <h3>Minecraft Assets</h3>
                        <input type="text" id="ab-search" placeholder="Search assets...">
                        <button class="btn-close" id="ab-close">X</button>
                    </div>
                    <div class="ab-categories">
                        <button class="ab-cat active" data-cat="texture">Textures</button>
                        <button class="ab-cat" data-cat="model">Models</button>
                        <button class="ab-cat" data-cat="sound">Sounds</button>
                    </div>
                    <div class="ab-list" id="ab-list">
                        <!-- Items injected here -->
                    </div>
                </div>
            `;
        }

        this.bindEvents(isSidebar);
    }



    bindEvents(isSidebar) {
        const closeBtn = this.container.querySelector('#ab-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.close();
        }

        const searchInput = this.container.querySelector('#ab-search');
        if (searchInput) {
            searchInput.oninput = (e) => this.filter(e.target.value);
        }

        // Support both regular and mini category buttons
        const cats = this.container.querySelectorAll('.ab-cat, .ab-cat-mini');
        cats.forEach(btn => {
            btn.onclick = () => {
                cats.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadCategory(btn.dataset.cat);
            };
        });
    }

    open() {
        if (!this.extractor.isLoaded) {
            alert("No Minecraft JAR loaded!");
            return;
        }

        // Check if we are in sidebar mode
        const sidebarContainer = document.getElementById('asset-browser');
        if (sidebarContainer) {
            this.container = sidebarContainer;
            this.container.classList.remove('hidden');
            this.render(true); // true = sidebar mode
        } else {
            this.container.classList.remove('hidden');
        }

        this.isOpen = true;
        this.loadCategory('texture');
    }

    close() {
        this.container.classList.add('hidden');
        this.isOpen = false;
    }

    loadCategory(cat) {
        this.currentCat = cat;
        const list = this.extractor.getAssetList(cat);
        this.renderList(list);
    }

    renderList(items) {
        const listEl = this.container.querySelector('#ab-list');
        listEl.innerHTML = '';

        const limit = 200;
        let count = 0;

        for (const isAsset of items) {
            if (count > limit) break;

            const item = document.createElement('div');
            item.className = 'ab-item';

            // Clean path
            const name = isAsset.replace('assets/minecraft/', '');

            // Layout: [Name       ] [Batch+]
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            const span = document.createElement('span');
            span.textContent = name;
            span.style.overflow = 'hidden';
            span.style.textOverflow = 'ellipsis';
            span.style.flex = '1';

            // Click on Name -> Open
            span.onclick = async () => {
                console.log("AssetBrowser: Clicked", isAsset);
                // If not sidebar, close
                if (!this.container.classList.contains('asset-browser-sidebar')) {
                    this.close();
                }
                if (this.onSelect) {
                    console.log("AssetBrowser: Calling onSelect");
                    this.onSelect(isAsset);
                } else {
                    console.error("AssetBrowser: No onSelect callback defined!");
                }
            };

            // Add to Batch Button
            const batchBtn = document.createElement('button');
            batchBtn.innerHTML = '+';
            batchBtn.title = 'Add to Batch Queue';
            batchBtn.style.padding = '2px 6px';
            batchBtn.style.fontSize = '0.8rem';
            batchBtn.style.background = '#444';
            batchBtn.style.border = '1px solid #555';
            batchBtn.style.color = '#fff';
            batchBtn.style.borderRadius = '4px';
            batchBtn.style.marginLeft = '5px';
            batchBtn.style.cursor = 'pointer';

            batchBtn.onclick = async (e) => {
                e.stopPropagation(); // Don't trigger open
                // Fetch blob
                const blob = await this.extractor.getFile(isAsset);
                if (blob) {
                    const file = new File([blob], name.split('/').pop(), { type: 'image/png' });
                    // Access BatchManager?
                    // AssetBrowser doesn't know about ImageProcessor/BatchManager directly.
                    // We can dispatch event or use global STATE (which is in main.js scope).
                    // Or we can pass batchManager in constructor.
                    // For now, let's look for global STATE or dispatch CustomEvent.

                    const event = new CustomEvent('batch-add-file', { detail: { file } });
                    document.dispatchEvent(event);

                    // Visual feedback
                    batchBtn.textContent = '✓';
                    setTimeout(() => batchBtn.textContent = '+', 1000);
                }
            };

            item.appendChild(span);
            item.appendChild(batchBtn);
            listEl.appendChild(item);
            count++;
        }

        if (items.length > limit) {
            const more = document.createElement('div');
            more.className = 'ab-more';
            more.textContent = `...and ${items.length - limit} more. Use search.`;
            listEl.appendChild(more);
        }
    }

    filter(query) {
        if (!query) {
            this.loadCategory(this.currentCat);
            return;
        }
        const list = this.extractor.getAssetList(this.currentCat);
        const filtered = list.filter(p => p.toLowerCase().includes(query.toLowerCase()));
        this.renderList(filtered);
    }
}
