export class MobGenerator {
    constructor(manager) {
        this.manager = manager;
    }

    render(container) {
        container.innerHTML = `
            <div class="mob-generator">
                <h2>MOB SUMMON GENERATOR</h2>
                
                <div class="mob-form-grid">
                    <div class="form-group">
                        <label>Entity Type</label>
                        <select id="mob-type">
                            <option value="minecraft:zombie">Zombie</option>
                            <option value="minecraft:skeleton">Skeleton</option>
                            <option value="minecraft:creeper">Creeper</option>
                            <option value="minecraft:spider">Spider</option>
                            <option value="minecraft:villager">Villager</option>
                            <option value="minecraft:pig">Pig</option>
                            <option value="minecraft:cow">Cow</option>
                            <option value="minecraft:sheep">Sheep</option>
                            <option value="minecraft:chicken">Chicken</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Custom Name</label>
                        <input type="text" id="mob-name" placeholder="Bob the Builder">
                    </div>

                    <div class="form-group">
                        <label>Health (HP)</label>
                        <input type="number" id="mob-health" value="20">
                    </div>

                    <div class="form-group">
                        <label>Movement Speed</label>
                        <input type="number" id="mob-speed" value="0.23" step="0.01">
                    </div>

                    <div class="form-group checkbox-group">
                        <label><input type="checkbox" id="mob-glowing"> Glowing</label>
                        <label><input type="checkbox" id="mob-ai" checked> AI Enabled</label>
                        <label><input type="checkbox" id="mob-persistence"> Persistent</label>
                        <label><input type="checkbox" id="mob-silent"> Silent</label>
                    </div>

                    <div class="form-group">
                        <label>Main Hand Item</label>
                        <input type="text" id="mob-hand" placeholder="minecraft:iron_sword">
                    </div>
                    
                    <div class="form-group">
                        <label>Off Hand Item</label>
                        <input type="text" id="mob-offhand" placeholder="minecraft:shield">
                    </div>
                </div>

                <div class="mob-preview">
                    <h3>Command Output</h3>
                    <textarea id="mob-output" readonly></textarea>
                    <button class="btn btn-secondary" id="copy-mob-btn">COPY TO CLIPBOARD</button>
                    <button class="btn btn-primary" id="save-mob-btn">SAVE AS FUNCTION</button>
                    <input type="text" id="mob-file-name" placeholder="summon_bob" style="margin-top:10px; width:100%;">
                </div>
            </div>
        `;

        this.bindEvents();
        // Initial Generate
        this.generateCommand();
    }

    bindEvents() {
        // Auto-update output on change
        const inputs = document.querySelectorAll('input, select');
        inputs.forEach(input => {
            input.oninput = () => this.generateCommand();
            input.onchange = () => this.generateCommand();
        });

        document.getElementById('copy-mob-btn').onclick = () => {
            const txt = document.getElementById('mob-output');
            txt.select();
            document.execCommand('copy');
            alert("Copied to clipboard!");
        };

        document.getElementById('save-mob-btn').onclick = () => {
            const content = document.getElementById('mob-output').value;
            let name = document.getElementById('mob-file-name').value || `summon_${Date.now()}`;

            const path = `data/custom/functions/${name}.mcfunction`;
            this.manager.saveFile(path, content);
        };
    }

    generateCommand() {
        const type = document.getElementById('mob-type').value;
        const name = document.getElementById('mob-name').value;
        const hp = document.getElementById('mob-health').value;
        const speed = document.getElementById('mob-speed').value;

        const glowing = document.getElementById('mob-glowing').checked;
        const noAI = !document.getElementById('mob-ai').checked;
        const persistent = document.getElementById('mob-persistence').checked;
        const silent = document.getElementById('mob-silent').checked;

        const mainHand = document.getElementById('mob-hand').value;
        const offHand = document.getElementById('mob-offhand').value;

        let nbt = {};

        if (name) {
            nbt.CustomName = JSON.stringify(name); // JSON text component
            nbt.CustomNameVisible = 1;
        }
        if (glowing) nbt.Glowing = 1;
        if (noAI) nbt.NoAI = 1;
        if (persistent) nbt.PersistenceRequired = 1;
        if (silent) nbt.Silent = 1;

        // Attributes
        let attributes = [];
        if (hp !== "20") {
            attributes.push({ Name: "generic.max_health", Base: parseFloat(hp) });
            nbt.Health = parseFloat(hp); // Set current health too
        }
        if (speed !== "0.23") {
            attributes.push({ Name: "generic.movement_speed", Base: parseFloat(speed) });
        }
        if (attributes.length > 0) nbt.Attributes = attributes;

        // Equipment: [MainHand, OffHand, Feet, Legs, Chest, Head]
        if (mainHand || offHand) {
            nbt.HandItems = [
                { id: mainHand || "minecraft:air", Count: 1 },
                { id: offHand || "minecraft:air", Count: 1 }
            ];
        }

        // Convert NBT object to SNBT string (recursive)
        const snbt = this.toSNBT(nbt);

        const cmd = `summon ${type} ~ ~ ~ ${snbt}`;
        document.getElementById('mob-output').value = cmd;
    }

    toSNBT(obj) {
        if (Object.keys(obj).length === 0) return "";
        let str = "{";
        let pairs = [];
        for (let k in obj) {
            let v = obj[k];
            if (typeof v === 'string' && !v.startsWith('"') && !v.startsWith('{') && !v.startsWith('[')) {
                // Simple string vs JSON string...
                // If it's an ID, quote it if needed. 
                // For safety always output quoted strings unless numbers.
                // But wait, NBT parser is lenient.
                // JSON.stringify adds quotes. 
                // BUT CustomName needs escaped JSON string: '{"text":"Bob"}' inside "" -> "\"{\"text\":\"Bob\"}\""
                // Here `v` is already JSON stringified for CustomName. 
                // For regular strings (IDs), just use value.
            }

            let valStr = "";
            if (typeof v === 'number') valStr = v.toString();
            else if (typeof v === 'string') valStr = `"${v.replace(/"/g, '\\"')}"`; // simplistic escape
            else if (Array.isArray(v)) {
                valStr = "[" + v.map(i => {
                    if (typeof i === 'object') return this.toSNBT(i);
                    return i;
                }).join(",") + "]";
            } else if (typeof v === 'object') {
                valStr = this.toSNBT(v);
            }

            // Special case cleanups
            if (k === 'CustomName') valStr = `'${v}'`; // Single quotes for JSON text inside command usually safer? Or escaped double quotes?
            // If v was JSON.stringify("Bob"), result is "\"Bob\"".

            pairs.push(`${k}:${valStr}`);
        }
        str += pairs.join(",") + "}";
        return str;
    }
}
