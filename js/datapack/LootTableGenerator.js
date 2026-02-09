export class LootTableGenerator {
    constructor(manager) {
        this.manager = manager;
        this.items = []; // Array of { item, min, max, weight }
    }

    render(container) {
        container.innerHTML = `
            <div class="loot-generator">
                <h2>LOOT TABLE GENERATOR</h2>
                
                <div class="loot-meta">
                    <div class="form-group">
                        <label>Table Type</label>
                        <select id="loot-type">
                            <option value="minecraft:block">Block Drop</option>
                            <option value="minecraft:entity">Entity Drop</option>
                            <option value="minecraft:chest">Chest Loot</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>File Name (e.g. zombies)</label>
                        <input type="text" id="loot-name" placeholder="my_loot_table">
                    </div>
                </div>

                <div class="loot-pools-container">
                    <h3>Pool 1 (Items)</h3>
                    <div class="pool-settings">
                        <label>Rolls: <input type="number" id="pool-rolls" value="1" min="1" max="10" style="width:50px"></label>
                        <button class="btn btn-secondary btn-small" id="add-loot-item-btn">+ ADD ITEM</button>
                    </div>
                    
                    <div class="loot-items-list" id="loot-items-list">
                        <!-- Items injected here -->
                    </div>
                </div>

                <div class="loot-preview">
                    <h3>JSON Output</h3>
                    <textarea id="loot-output" readonly></textarea>
                    <button class="btn btn-primary" id="save-loot-btn">SAVE LOOT TABLE</button>
                </div>
            </div>
        `;

        this.bindEvents();
        this.updatePreview();
    }

    bindEvents() {
        document.getElementById('add-loot-item-btn').onclick = () => this.addItem();
        document.getElementById('save-loot-btn').onclick = () => {
            const name = document.getElementById('loot-name').value || `loot_${Date.now()}`;
            const content = document.getElementById('loot-output').value;
            const path = `data/custom/loot_tables/${name}.json`;
            this.manager.saveFile(path, content);
        };

        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(i => i.onchange = () => this.updatePreview());

        // Update preview on input for text fields
        document.getElementById('loot-name').oninput = () => this.updatePreview();
    }

    addItem() {
        this.items.push({ item: 'minecraft:diamond', min: 1, max: 1, weight: 1 });
        this.renderItems();
        this.updatePreview();
    }

    removeItem(index) {
        this.items.splice(index, 1);
        this.renderItems();
        this.updatePreview();
    }

    renderItems() {
        const list = document.getElementById('loot-items-list');
        list.innerHTML = '';

        this.items.forEach((entry, i) => {
            const div = document.createElement('div');
            div.className = 'loot-item-row';
            div.innerHTML = `
                <input type="text" class="item-id-input" value="${entry.item}" placeholder="item id">
                <div class="item-counts">
                    <label>Min <input type="number" class="item-min-input" value="${entry.min}" min="1"></label>
                    <label>Max <input type="number" class="item-max-input" value="${entry.max}" min="1"></label>
                </div>
                <label>Weight <input type="number" class="item-weight-input" value="${entry.weight}" min="1"></label>
                <button class="btn-icon-danger loot-remove-btn" title="Remove Item">🗑️</button>
            `;

            // Bind inputs using index closure
            div.querySelector('.item-id-input').onchange = (e) => { this.items[i].item = e.target.value; this.updatePreview(); };
            div.querySelector('.item-min-input').onchange = (e) => { this.items[i].min = parseInt(e.target.value); this.updatePreview(); };
            div.querySelector('.item-max-input').onchange = (e) => { this.items[i].max = parseInt(e.target.value); this.updatePreview(); };
            div.querySelector('.item-weight-input').onchange = (e) => { this.items[i].weight = parseInt(e.target.value); this.updatePreview(); };
            div.querySelector('.loot-remove-btn').onclick = () => this.removeItem(i);

            list.appendChild(div);
        });
    }

    updatePreview() {
        // Safe check if element exists (might be called during render/removal)
        const typeSelect = document.getElementById('loot-type');
        if (!typeSelect) return;

        const type = typeSelect.value;
        const rolls = parseInt(document.getElementById('pool-rolls').value) || 1;

        const entries = this.items.map(entry => ({
            type: "minecraft:item",
            name: entry.item,
            weight: entry.weight,
            functions: [
                {
                    function: "minecraft:set_count",
                    count: {
                        min: entry.min,
                        max: entry.max
                    }
                }
            ]
        }));

        const lootTable = {
            type: type,
            pools: [
                {
                    rolls: rolls,
                    entries: entries
                }
            ]
        };

        const json = JSON.stringify(lootTable, null, 4);
        document.getElementById('loot-output').value = json;
    }
}
