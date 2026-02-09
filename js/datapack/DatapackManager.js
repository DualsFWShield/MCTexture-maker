import { RecipeEditor } from './RecipeEditor.js';
import { FunctionEditor } from './FunctionEditor.js';
import { MobGenerator } from './MobGenerator.js';
import { LootTableGenerator } from './LootTableGenerator.js';

export class DatapackManager {
    constructor(packBuilder) {
        this.packBuilder = packBuilder;
        this.container = document.getElementById('datapack-editor-container');
        this.activeTool = null;

        // Editors
        this.editors = {
            recipe: new RecipeEditor(this),
            function: new FunctionEditor(this),
            mob: new MobGenerator(this),
            loot: new LootTableGenerator(this)
        };
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const buttons = document.querySelectorAll('.tool-btn');
        buttons.forEach(btn => {
            btn.onclick = () => {
                const tool = btn.dataset.tool;
                if (this.editors[tool]) {
                    // UI Update
                    buttons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    this.switchTool(tool);
                } else {
                    console.log("Tool not implemented yet:", tool);
                }
            };
        });
    }

    switchTool(toolName) {
        this.activeTool = this.editors[toolName];
        this.container.innerHTML = ''; // Clear
        this.activeTool.render(this.container);
    }

    // Helper to save file to pack
    saveFile(path, content) {
        // Validation?
        const blob = new Blob([content], { type: 'application/json' });
        this.packBuilder.addFile(path, blob);

        // Visual Feedback (Toast?)
        alert(`Saved ${path} to pack!`);
    }
}
