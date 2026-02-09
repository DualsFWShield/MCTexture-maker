export class ToolsManager {
    constructor() {
        this.tools = [
            {
                category: "Generic / Generator",
                items: [
                    { name: "MCStacker (Commands)", url: "https://mcstacker.net/", desc: "Best generic command generator" },
                    { name: "GamerGeeks (Commands)", url: "https://gamergeeks.net/", desc: "Alternative command generators" },
                    { name: "Colorize (Text)", url: "https://rgb.birdflop.com/", desc: "Text Gradients & formatting" }
                ]
            },
            {
                category: "NBT & Data",
                items: [
                    { name: "NBT Editor (Web)", url: "https://github.com/irath96/webNBT", desc: "Edit NBT files in browser" },
                    { name: "Misode's Generators", url: "https://misode.github.io/", desc: "Loot Tables, Worldgen, etc." },
                    { name: "Datapack Assembler", url: "http://far.ddns.me/", desc: "Generate datapack from commands" }
                ]
            },
            {
                category: "Reference",
                items: [
                    { name: "Minecraft Wiki: Commands", url: "https://minecraft.wiki/w/Commands" },
                    { name: "Minecraft Wiki: NBT", url: "https://minecraft.wiki/w/NBT_format" }
                ]
            }
        ];

        this.container = document.createElement('div');
        this.container.className = 'tools-modal modal-overlay';
        this.container.hidden = true;
        this.render();
        document.body.appendChild(this.container);

        this.bindTrigger();
    }

    render() {
        let html = `
        <div class="modal large-modal">
            <div class="modal-header">
                <h2>External Tools & Utilities</h2>
                <button class="btn-close" id="tools-close">X</button>
            </div>
            <div class="modal-body tools-grid">
        `;

        this.tools.forEach(cat => {
            html += `<div class="tool-category"><h3>${cat.category}</h3><ul>`;
            cat.items.forEach(tool => {
                html += `
                <li>
                    <a href="${tool.url}" target="_blank" class="tool-link">
                        <span class="tool-name">${tool.name}</span>
                        ${tool.desc ? `<span class="tool-desc">${tool.desc}</span>` : ''}
                    </a>
                </li>`;
            });
            html += `</ul></div>`;
        });

        html += `
            </div>
        </div>`;

        this.container.innerHTML = html;
        this.container.querySelector('#tools-close').onclick = () => this.toggle(false);
    }

    bindTrigger() {
        // Find or create a trigger button in the main UI
        // Maybe in the Header?
        const header = document.querySelector('.header-controls');
        if (header) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.innerHTML = '🛠️ Tools';
            btn.onclick = () => this.toggle(true);
            header.insertBefore(btn, header.firstChild);
        }
    }

    toggle(show) {
        this.container.hidden = !show;
    }
}
