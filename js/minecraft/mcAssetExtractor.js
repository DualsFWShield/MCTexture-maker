export class MCAssetExtractor {
    constructor() {
        this.zip = null;
        this.files = {}; // path -> zipEntry
        this.isLoaded = false;
        this.version = null;
    }

    async loadJar(file) {
        if (!window.JSZip) throw new Error("JSZip not loaded");

        try {
            console.log("Loading JAR:", file.name);
            this.zip = await JSZip.loadAsync(file);
            this.files = {};
            this.version = this.extractVersionFromName(file.name);

            // Index files
            this.zip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir) {
                    // We primarily care about assets and data
                    if (relativePath.startsWith('assets/') || relativePath.startsWith('data/')) {
                        this.files[relativePath] = zipEntry;
                    }
                    if (relativePath === 'pack.mcmeta') {
                        this.files[relativePath] = zipEntry;
                    }
                }
            });

            this.isLoaded = true;
            console.log(`Loaded ${Object.keys(this.files).length} assets.`);
            return true;

        } catch (e) {
            console.error("Failed to load JAR:", e);
            throw e;
        }
    }

    extractVersionFromName(name) {
        // e.g. "1.20.4.jar" -> "1.20.4"
        const match = name.match(/(\d+\.\d+(\.\d+)?)/);
        return match ? match[0] : "unknown";
    }

    getAssetList(type = 'texture') {
        // type: texture, model, sound, blockstate, data
        const list = [];
        const prefix = 'assets/minecraft/';

        for (const path of Object.keys(this.files)) {
            if (type === 'texture' && path.startsWith(prefix + 'textures/') && path.endsWith('.png')) {
                list.push(path);
            } else if (type === 'sound') {
                // Sounds are usually in assets/minecraft/sounds/ or similar.
                // The default structure is assets/minecraft/sounds.json for definitions,
                // but actual files are in assets/minecraft/sounds/...
                if (path.startsWith(prefix + 'sounds/') && path.endsWith('.ogg')) {
                    list.push(path);
                } else {
                    // console.log("Ignored sound:", path);
                }
            } else if (type === 'model' && path.startsWith(prefix + 'models/') && path.endsWith('.json')) {
                list.push(path);
            } else if (type === 'data' && path.startsWith('data/')) {
                list.push(path);
            }
        }
        return list.sort();
    }

    async getFile(path) {
        if (!this.files[path]) {
            console.error("MCAssetExtractor: File not found", path);
            return null;
        }

        const ext = path.split('.').pop().toLowerCase();

        // MIME type mapping for binary files
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav',
            'mp3': 'audio/mpeg'
        };

        const isBinary = ext in mimeTypes;

        try {
            if (isBinary) {
                // Extract as ArrayBuffer first, then create Blob with correct MIME type
                const arrayBuffer = await this.files[path].async('arraybuffer');
                const blob = new Blob([arrayBuffer], { type: mimeTypes[ext] });
                console.log(`MCAssetExtractor: Loaded binary ${path} (${blob.size} bytes, type: ${blob.type})`);
                return blob;
            } else {
                return await this.files[path].async('string');
            }
        } catch (e) {
            console.error("MCAssetExtractor: Failed to read file", path, e);
            return null;
        }
    }

    /**
     * Get file as Data URL (base64) - bypasses Tracking Prevention issues
     * @param {string} path 
     * @returns {Promise<string|null>} Data URL string
     */
    async getFileAsDataURL(path) {
        if (!this.files[path]) {
            console.error("MCAssetExtractor: File not found", path);
            return null;
        }

        const ext = path.split('.').pop().toLowerCase();
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'ogg': 'audio/ogg',
            'wav': 'audio/wav',
            'mp3': 'audio/mpeg'
        };

        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        try {
            // Get as base64 directly from JSZip - this avoids blob URL issues
            const base64 = await this.files[path].async('base64');
            const dataURL = `data:${mimeType};base64,${base64}`;
            console.log(`MCAssetExtractor: Created Data URL for ${path} (type: ${mimeType})`);
            return dataURL;
        } catch (e) {
            console.error("MCAssetExtractor: Failed to create Data URL for", path, e);
            return null;
        }
    }

    async getTextureAsImage(path) {
        try {
            // Use Data URL instead of blob URL to bypass Tracking Prevention
            const dataURL = await this.getFileAsDataURL(path);
            if (!dataURL) return null;

            const img = new Image();

            return new Promise((resolve, reject) => {
                img.onload = () => resolve(img);
                img.onerror = (e) => {
                    console.error("MCAssetExtractor: Image load failed for", path, e);
                    reject(e);
                };
                img.src = dataURL;
            });
        } catch (e) {
            console.error("MCAssetExtractor: getTextureAsImage failed for", path, e);
            return null;
        }
    }
}
