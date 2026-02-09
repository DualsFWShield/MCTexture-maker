/**
 * packBuilder.js
 * Manages the creation of the Resource Pack (ZIP file structure).
 */

export class PackBuilder {
    constructor() {
        this.reset();
    }

    reset() {
        this.packName = "My Resource Pack";
        this.description = "Created with MC Creator";
        this.formatVersion = 15; // 1.20.x
        this.files = {}; // path -> Blob
        this.packIcon = null; // Blob
    }

    setMetadata(name, description, format) {
        this.packName = name || this.packName;
        this.description = description || this.description;
        this.formatVersion = format || this.formatVersion;
    }

    addFile(path, blob) {
        // path should be relative to root (e.g. 'assets/minecraft/textures/block/dirt.png')
        // OR relative to assets/ if we prepend it? 
        // Let's assume full path from root of zip.
        this.files[path] = blob;
        console.log(`Added file to pack: ${path}`);
    }

    removeFile(path) {
        if (this.files[path]) {
            delete this.files[path];
            console.log(`Removed file from pack: ${path}`);
            return true;
        }
        return false;
    }

    setIcon(blob) {
        this.packIcon = blob;
    }

    async exportPack() {
        if (!window.JSZip) throw new Error("JSZip is not loaded.");

        const zip = new JSZip();

        // 1. pack.mcmeta
        const mcmeta = {
            pack: {
                pack_format: parseInt(this.formatVersion),
                description: this.description
            }
        };
        zip.file("pack.mcmeta", JSON.stringify(mcmeta, null, 4));

        // 2. pack.png
        if (this.packIcon) {
            zip.file("pack.png", this.packIcon);
        }

        // 3. Files
        for (const [path, blob] of Object.entries(this.files)) {
            zip.file(path, blob);
        }

        // 4. Generate
        const content = await zip.generateAsync({ type: "blob" });

        // 5. Download
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.packName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.zip`;
        a.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    get fileCount() {
        return Object.keys(this.files).length;
    }
}
