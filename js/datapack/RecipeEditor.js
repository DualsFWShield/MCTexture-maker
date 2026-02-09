export class RecipeEditor {
    constructor(manager) {
        this.manager = manager;
    }

    render(container) {
        container.innerHTML = `
            <div class="recipe-editor">
                <h2>CRAFTING RECIPE GENERATOR</h2>
                
                <div class="recipe-meta">
                    <label>Recipe Type:</label>
                    <select id="recipe-type">
                        <option value="minecraft:crafting_shaped">Shaped Crafting</option>
                        <option value="minecraft:crafting_shapeless">Shapeless Crafting</option>
                        <option value="minecraft:smelting">Smelting (Furnace)</option>
                    </select>

                    <label>File Name (e.g. diamond_sword):</label>
                    <input type="text" id="recipe-name" placeholder="my_item">
                </div>

                <div class="recipe-workspace">
                    <!-- 3x3 Grid -->
                    <div class="crafting-grid" id="crafting-grid">
                        <input type="text" class="grid-slot" data-index="0" placeholder="">
                        <input type="text" class="grid-slot" data-index="1" placeholder="">
                        <input type="text" class="grid-slot" data-index="2" placeholder="">
                        <input type="text" class="grid-slot" data-index="3" placeholder="">
                        <input type="text" class="grid-slot" data-index="4" placeholder="">
                        <input type="text" class="grid-slot" data-index="5" placeholder="">
                        <input type="text" class="grid-slot" data-index="6" placeholder="">
                        <input type="text" class="grid-slot" data-index="7" placeholder="">
                        <input type="text" class="grid-slot" data-index="8" placeholder="">
                    </div>

                    <div class="arrow-right">➡</div>

                    <!-- Result -->
                    <div class="crafting-result">
                        <input type="text" id="result-item" placeholder="minecraft:result">
                        <input type="number" id="result-count" value="1" min="1" max="64">
                    </div>
                </div>

                <button class="btn btn-primary btn-large" id="save-recipe-btn">SAVE RECIPE TO PACK</button>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('save-recipe-btn').onclick = () => this.saveRecipe();

        // Type Change Handler (Hide grid slots for Smelting?)
        document.getElementById('recipe-type').onchange = (e) => {
            const type = e.target.value;
            const grid = document.getElementById('crafting-grid');
            if (type === 'minecraft:smelting') {
                // Convert to 1 slot?
                // For MVP, just use first slot.
                // Visual feedback needed.
                // Let's keep grid but highlight center slot?
                // Or actually change markup.
                grid.innerHTML = '<input type="text" class="grid-slot large" data-index="4" placeholder="Input">';
                grid.style.gridTemplateColumns = '1fr';
                grid.style.placeItems = 'center';
            } else {
                // Restore 3x3
                if (grid.children.length !== 9) {
                    // Re-render full grid
                    let html = '';
                    for (let i = 0; i < 9; i++) html += `<input type="text" class="grid-slot" data-index="${i}" placeholder="">`;
                    grid.innerHTML = html;
                    grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
                }
            }
        };
    }

    saveRecipe() {
        const type = document.getElementById('recipe-type').value;
        const name = document.getElementById('recipe-name').value;
        if (!name) return alert("Please enter a file name.");

        let recipe = {
            type: type
        };

        const resultItem = document.getElementById('result-item').value;
        const resultCount = parseInt(document.getElementById('result-count').value) || 1;

        if (!resultItem) return alert("Please specify a result item.");

        recipe.result = {
            item: resultItem,
            count: resultCount
        };

        if (type === 'minecraft:crafting_shaped') {
            const slots = document.querySelectorAll('.grid-slot');
            const pattern = ["   ", "   ", "   "];
            const key = {};
            let charCode = 65; // A

            // Map inputs to A, B, C...
            // Simple logic:
            // 1. Identify unique inputs.
            // 2. Assign keys.
            // 3. Build pattern.

            let keyMap = {}; // item -> char
            let gridChars = [];

            slots.forEach((slot, i) => {
                const item = slot.value.trim();
                if (!item) {
                    gridChars.push(' ');
                } else {
                    if (!keyMap[item]) {
                        keyMap[item] = String.fromCharCode(charCode++);
                        key[keyMap[item]] = { item: item };
                    }
                    gridChars.push(keyMap[item]);
                }
            });

            pattern[0] = gridChars.slice(0, 3).join('');
            pattern[1] = gridChars.slice(3, 6).join('');
            pattern[2] = gridChars.slice(6, 9).join('');

            recipe.pattern = pattern;
            recipe.key = key;

        } else if (type === 'minecraft:crafting_shapeless') {
            const slots = document.querySelectorAll('.grid-slot');
            const ingredients = [];
            slots.forEach(slot => {
                if (slot.value.trim()) ingredients.push({ item: slot.value.trim() });
            });
            if (ingredients.length === 0) return alert("Add at least one ingredient.");
            recipe.ingredients = ingredients;

        } else if (type === 'minecraft:smelting') {
            const input = document.querySelector('.grid-slot').value.trim();
            if (!input) return alert("Input item required.");
            recipe.ingredient = { item: input };
            recipe.experience = 0.1;
            recipe.cookingtime = 200;
        }

        const json = JSON.stringify(recipe, null, 4);
        const path = `data/minecraft/recipes/${name}.json`;
        // Namespace hardcoded to minecraft? Or user defined?
        // Usually datapacks use their own namespace. 
        // Let's use 'custom' namespace for now or ask user?
        // For simple MVP: `data/custom/recipes/${name}.json`.

        this.manager.saveFile(`data/custom/recipes/${name}.json`, json);
    }
}
