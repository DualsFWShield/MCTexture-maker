export class FunctionEditor {
    constructor(manager) {
        this.manager = manager;
    }

    render(container) {
        container.innerHTML = `
            <div class="function-editor">
                <h2>MCFUNCTION EDITOR</h2>
                
                <div class="function-meta">
                    <label>Function Name (e.g. init):</label>
                    <input type="text" id="func-name" placeholder="my_function">
                    <span class="file-ext">.mcfunction</span>
                </div>

                <div class="editor-toolbar">
                    <button class="btn-small" onclick="document.execCommand('insertText', false, 'say Hello World')">say</button>
                    <button class="btn-small" onclick="document.execCommand('insertText', false, 'give @s ')">give</button>
                    <button class="btn-small" onclick="document.execCommand('insertText', false, 'summon ')">summon</button>
                    <button class="btn-small" onclick="document.execCommand('insertText', false, 'execute as @a run ')">execute</button>
                    <button class="btn-small" onclick="document.execCommand('insertText', false, 'scoreboard objectives add ')">scoreboard</button>
                </div>

                <div class="code-area" id="code-input" contenteditable="true" spellcheck="false">
                    # Write your commands here...
                </div>

                <button class="btn btn-primary btn-large" id="save-func-btn">SAVE FUNCTION TO PACK</button>
            </div>
        `;

        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('save-func-btn').onclick = () => this.saveFunction();

        const editor = document.getElementById('code-input');

        // Simple Syntax Highlighting (on Input)
        // Note: contenteditable highlighting is tricky without a library.
        // For MVP, we might skip live highlighting or do very basic span wrapping.
        // Let's stick to plain text for stability first, maybe simple coloring.

        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                document.execCommand('insertText', false, '    ');
            }
        });
    }

    saveFunction() {
        const name = document.getElementById('func-name').value;
        if (!name) return alert("Please enter a function name.");

        const content = document.getElementById('code-input').innerText; // Use innerText to get newlines

        const path = `data/custom/functions/${name}.mcfunction`;
        this.manager.saveFile(path, content);
    }
}
