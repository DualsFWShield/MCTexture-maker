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
        this.packType = 'resource'; // resource, data, shader
        this.files = {}; // path -> Blob
        this.packIcon = null; // Blob
    }

    setMetadata(name, description, format, type = 'resource') {
        this.packName = name || this.packName;
        this.description = description || this.description;
        this.formatVersion = format || this.formatVersion;
        this.packType = type;
    }

    addFile(path, blob) {
        // Normalize path: ensure it doesn't start with /
        let cleanPath = path.startsWith('/') ? path.slice(1) : path;

        // Auto-fix paths based on Pack Type if needed?
        // For now, trust the input path but ensure it's valid.

        this.files[cleanPath] = blob;
        console.log(`Added file to pack: ${cleanPath} (${this.packType})`);
        // Trigger UI update if bound
        if (this.onUpdate) this.onUpdate();
    }

    removeFile(path) {
        if (this.files[path]) {
            delete this.files[path];
            if (this.onUpdate) this.onUpdate();
            return true;
        }
        return false;
    }

    setIcon(blob) {
        this.packIcon = blob;
    }

    async exportPack(format = 'zip') { // zip or jar
        if (!window.JSZip) throw new Error("JSZip is not loaded.");

        const zip = new JSZip();

        // 1. Determine Pack Format Version & Description
        // Datapacks use different formats than Resource Packs
        // 1.20.4: Resource=22, Data=26

        let metaFormat = parseInt(this.formatVersion);

        // 2. pack.mcmeta
        const mcmeta = {
            pack: {
                pack_format: metaFormat,
                description: this.description
            }
        };

        // Filter elements for Datapacks if needed? 
        // For now, standard mcmeta.

        zip.file("pack.mcmeta", JSON.stringify(mcmeta, null, 4));

        // 3. pack.png
        if (this.packIcon) {
            zip.file("pack.png", this.packIcon);
        }

        // 4. Files
        for (const [path, blob] of Object.entries(this.files)) {
            zip.file(path, blob);
        }

        // 5. Generate
        const content = await zip.generateAsync({ type: "blob" });

        // 6. Download
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;

        // Extension
        const ext = format === 'jar' ? 'jar' : 'zip';
        let name = this.packName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        if (!name) name = "pack";

        a.download = `${name}.${ext}`;
        a.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    get fileCount() {
        return Object.keys(this.files).length;
    }
}
