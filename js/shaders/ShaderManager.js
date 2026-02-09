import { ShaderTemplates } from './ShaderTemplates.js';

export class ShaderManager {
    constructor(packBuilder) {
        this.packBuilder = packBuilder;
        this.currentProgram = 'gbuffers_terrain';
        this.container = document.getElementById('tab-shaders');
    }

    init() {
        this.bindEvents();
        this.loadProgram(this.currentProgram);
    }

    bindEvents() {
        // Program Selectors
        const progBtns = document.querySelectorAll('.shader-prog-btn');
        progBtns.forEach(btn => {
            btn.onclick = () => {
                progBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentProgram = btn.dataset.prog;
                this.loadProgram(this.currentProgram);
            };
        });

        // Template Selector
        document.getElementById('apply-template-btn').onclick = () => {
            const template = document.getElementById('shader-template-select').value;
            this.applyTemplate(template);
        };

        // Save Button
        document.getElementById('save-shader-btn').onclick = () => this.saveToPack();
    }

    loadProgram(progName) {
        // Here we could try to load from PackBuilder if it already exists?
        // For now, reset to default template if empty, or keep current text if switching?
        // Ideally: Maintain state per program in memory.

        // MVP: Just load 'basic' template for the program type.
        // Or if we want persistence, we need a 'programs' object in memory.

        if (!this.programs) this.programs = {};

        if (!this.programs[progName]) {
            // Init with Basic
            const tpl = ShaderTemplates[progName] ? ShaderTemplates[progName].basic : ShaderTemplates.default;
            this.programs[progName] = {
                vsh: tpl.vsh,
                fsh: tpl.fsh
            };
        }

        document.getElementById('vsh-editor').innerText = this.programs[progName].vsh;
        document.getElementById('fsh-editor').innerText = this.programs[progName].fsh;
    }

    applyTemplate(templateName) {
        const progName = this.currentProgram;
        let tpl = ShaderTemplates[progName] ? ShaderTemplates[progName][templateName] : null;

        if (!tpl) {
            // Fallback to basic generic if specific template not found
            tpl = ShaderTemplates.default;
            alert(`Template '${templateName}' not available for ${progName}. Using default.`);
        }

        if (confirm(`Overwrite current ${progName} with ${templateName} template?`)) {
            this.programs[progName] = { vsh: tpl.vsh, fsh: tpl.fsh };

            document.getElementById('vsh-editor').innerText = tpl.vsh;
            document.getElementById('fsh-editor').innerText = tpl.fsh;
        }
    }

    saveCurrentState() {
        // Save editor content to memory object
        if (!this.programs) this.programs = {};
        this.programs[this.currentProgram] = {
            vsh: document.getElementById('vsh-editor').innerText,
            fsh: document.getElementById('fsh-editor').innerText
        };
    }

    saveToPack() {
        this.saveCurrentState();

        const progName = this.currentProgram;
        const data = this.programs[progName];

        // Shaders structure: assets/minecraft/shaders/program/ (usually for post) 
        // OR assets/minecraft/shaders/core/ (vanilla core shaders)
        // OR Optifine: shaders/ (root of zip)

        // Let's support Optifine/Iris standard: Root `shaders/` folder.

        const vshPath = `shaders/${progName}.vsh`;
        const fshPath = `shaders/${progName}.fsh`;

        this.packBuilder.addFile(vshPath, new Blob([data.vsh], { type: 'text/plain' }));
        this.packBuilder.addFile(fshPath, new Blob([data.fsh], { type: 'text/plain' }));

        alert(`Saved ${progName} (.vsh & .fsh) to pack!`);
    }

    refresh() {
        // Re-render if needed
    }
}
