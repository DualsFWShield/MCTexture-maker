/**
 * mcAssetExtractor.js
 * Handles extracting assets (textures, sounds) from Minecraft JAR files.
 */

export class MCAssetExtractor {
    constructor() {
        this.rootHandle = null;
        this.versions = [];
        this.selectedVersion = null;
        this.assets = {
            textures: {}, // path -> Blob
            sounds: {},   // path -> Blob
            models: {},
            lang: {}
        };
        this.onProgress = null; // (percent, msg) => {}
    }

    async setRootHandle(handle) {
        this.rootHandle = handle;
        await this.scanVersions();
    }

    async scanVersions() {
        if (!this.rootHandle) return;

        try {
            const versionsDir = await this.rootHandle.getDirectoryHandle('versions');
            this.versions = [];

            for await (const entry of versionsDir.values()) {
                if (entry.kind === 'directory') {
                    // Check if it contains a jar
                    try {
                        await entry.getFileHandle(`${entry.name}.jar`);
                        this.versions.push(entry.name);
                    } catch (e) {
                        // No jar, ignore (maybe json only)
                    }
                }
            }

            // Sort versions (semver-ish)
            this.versions.sort().reverse();
            console.log("Found versions:", this.versions);

        } catch (err) {
            console.error("Could not find versions directory!", err);
            throw new Error("Invalid .minecraft folder selected. Could not find 'versions' directory.");
        }
    }

    async extractVersion(versionId, progressCallback) {
        this.onProgress = progressCallback;
        this.reportProgress(0, `Loading ${versionId}.jar...`);

        try {
            const versionsDir = await this.rootHandle.getDirectoryHandle('versions');
            const versionDir = await versionsDir.getDirectoryHandle(versionId);
            const jarHandle = await versionDir.getFileHandle(`${versionId}.jar`);
            const file = await jarHandle.getFile();

            this.reportProgress(10, "Unzipping JAR...");

            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            // Filter for assets
            const assets = [];
            zipContent.forEach((relativePath, zipEntry) => {
                if (relativePath.startsWith('assets/minecraft/')) {
                    assets.push(zipEntry);
                }
            });

            const total = assets.length;
            let processed = 0;

            console.log(`Found ${total} assets in JAR.`);

            // Process sequentially or in chunks to avoid freezing UI
            // We prioritize textures and sounds.json

            for (const entry of assets) {
                const path = entry.name;

                // TEXTURES
                if (path.startsWith('assets/minecraft/textures/') && (path.endsWith('.png') || path.endsWith('.mcmeta'))) {
                    const blob = await entry.async('blob');
                    // Store stripped path: 'block/dirt.png'
                    const cleanPath = path.replace('assets/minecraft/textures/', '');
                    this.assets.textures[cleanPath] = blob;
                }

                // SOUNDS
                else if (path.startsWith('assets/minecraft/sounds/') && path.endsWith('.ogg')) {
                    const blob = await entry.async('blob');
                    const cleanPath = path.replace('assets/minecraft/', '');
                    this.assets.sounds[cleanPath] = blob;
                }

                // SOUNDS.JSON
                else if (path === 'assets/minecraft/sounds.json') {
                    const text = await entry.async('string');
                    this.assets.sounds['sounds.json'] = text;
                }

                // LANG
                else if (path.startsWith('assets/minecraft/lang/') && path.endsWith('.json')) {
                    const text = await entry.async('string');
                    const cleanPath = path.replace('assets/minecraft/lang/', '');
                    this.assets.lang[cleanPath] = text;
                }

                processed++;
                if (processed % 50 === 0) {
                    this.reportProgress(10 + (processed / total) * 90, `Extracting ${path.split('/').pop()}...`);
                    // Yield to UI
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            this.reportProgress(100, "Extraction Complete!");
            return this.assets;

        } catch (err) {
            console.error("Extraction failed:", err);
            this.reportProgress(0, "Error: " + err.message);
            throw err;
        }
    }

    reportProgress(percent, msg) {
        if (this.onProgress) this.onProgress(percent, msg);
    }

    getTexture(path) {
        return this.assets.textures[path];
    }

    getSound(path) {
        return this.assets.sounds[path];
    }
}
