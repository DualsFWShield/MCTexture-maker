/**
 * MC Creator - Main Controller
 * Minecraft Texture Pack / Datapack / Shader Creation Tool
 */

import { ImageProcessor } from './imageProcessor.js';
import { AudioProcessor } from './audioProcessor.js';
import { MCAssetExtractor } from './minecraft/mcAssetExtractor.js';
import { AssetBrowser } from './minecraft/assetBrowser.js';
import { PackBuilder } from './minecraft/packBuilder.js';
import { PackManagerUI } from './ui/PackManagerUI.js';
import { DatapackManager } from './datapack/DatapackManager.js';
import { ShaderManager } from './shaders/ShaderManager.js';

// App State
const STATE = {
    file: null,
    type: null, // 'image' | 'audio'
    activeProcessor: null,
    currentTab: 'textures',
    minecraftPath: null,
    assetExtractor: new MCAssetExtractor(),
    assetBrowser: null,
    packBuilder: new PackBuilder(),
    packManagerUI: null,
    datapackManager: null,
    shaderManager: null,
    project: {
        name: 'My Resource Pack',
        description: 'Created with MC Creator',
        targetVersions: ['1.21'],
        assets: {
            textures: [],
            sounds: [],
            models: []
        }
    }
};

// Detect .minecraft folder automatically
function detectMinecraftPath() {
    // On Windows: %APPDATA%\.minecraft
    // This is a browser app, so we can't auto-detect.
    // We'll prompt user to select folder via File System Access API
    const defaultPaths = [
        'C:\\Users\\' + (window.navigator.userAgent.includes('Windows') ? '' : '') + '\\AppData\\Roaming\\.minecraft',
        '%APPDATA%\\.minecraft'
    ];
    STATE.minecraftPath = null; // Will be set when user selects

    // Listen for Batch Add
    document.addEventListener('batch-add-file', (e) => {
        if (STATE.activeProcessor && STATE.activeProcessor.batchManager && e.detail.file) {
            STATE.activeProcessor.batchManager.addFile(e.detail.file);
        }
    });

    return defaultPaths[0];
}

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const exportBtn = document.getElementById('export-btn');
const activeToolStatus = document.getElementById('active-tool-status');
const fileInfoDisplay = document.getElementById('file-info');

// Tab Navigation
function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            STATE.currentTab = tab.dataset.tab;
            updateTabContent();

            if (STATE.currentTab === 'pack' && STATE.packManagerUI) {
                STATE.packManagerUI.refresh();
            }
            if (STATE.currentTab === 'shaders' && STATE.shaderManager) {
                STATE.shaderManager.refresh();
            }
        });
    });
}

function updateTabContent() {
    const containers = document.querySelectorAll('.tab-content');
    containers.forEach(c => c.hidden = true);
    const activeContainer = document.getElementById(`tab-${STATE.currentTab}`);
    if (activeContainer) activeContainer.hidden = false;
}

// Samples Logic (for testing)
function loadSample(filename) {
    const path = `samples/${filename}`;
    console.log("Loading sample:", path);

    fetch(path)
        .then(res => res.blob())
        .then(blob => {
            const file = new File([blob], filename, { type: blob.type });
            handleFile(file);
        })
        .catch(err => console.error("Sample not found:", err));
}

// === Event Listeners ===

// Drag & Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Export
exportBtn.addEventListener('click', () => {
    if (STATE.activeProcessor && STATE.activeProcessor.exportResult) {
        STATE.activeProcessor.exportResult();
    }
});

// File Input
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

/**
 * Main File Handler
 * @param {File} file 
 */
function handleFile(file) {
    console.log("Loading file:", file.name, file.type);

    STATE.file = file;
    fileInfoDisplay.textContent = `${file.name} (${formatBytes(file.size)})`;

    // Determine type
    if (file.type.startsWith('image/')) {
        initImageMode(file);
    } else if (file.type.startsWith('audio/')) {
        initAudioMode(file);
    } else {
        alert("Unsupported file type. Supported: PNG, JPG, OGG, WAV, MP3");
    }
}

function initImageMode(file) {
    STATE.type = 'image';
    activeToolStatus.textContent = "TEXTURE_EDITOR";

    // Hide upload prompt
    document.querySelector('.upload-prompt').hidden = true;
    document.getElementById('main-canvas').hidden = false;
    document.getElementById('audio-visualizer').hidden = true;

    console.log("Initializing Texture Editor...");

    // Cleanup previous processor if exists
    if (STATE.activeProcessor && STATE.activeProcessor.stop) {
        STATE.activeProcessor.stop();
    }

    STATE.activeProcessor = new ImageProcessor(document.getElementById('main-canvas'));
    STATE.activeProcessor.loadImage(file);
    STATE.activeProcessor.onSaveToPack = (blob, path) => {
        STATE.packBuilder.addFile(path, blob);
        console.log("Saved to pack:", path);
    };
    document.getElementById('export-btn').style.display = 'inline-block';
}

function initAudioMode(file) {
    STATE.type = 'audio';
    activeToolStatus.textContent = "SOUND_EDITOR";

    // UI Update
    document.querySelector('.upload-prompt').hidden = true;
    document.getElementById('main-canvas').hidden = true;
    document.getElementById('audio-visualizer').hidden = false;

    document.getElementById('export-btn').style.display = 'none';

    console.log("Initializing Sound Editor...");

    // Cleanup
    if (STATE.activeProcessor && STATE.activeProcessor.stop) {
        STATE.activeProcessor.stop();
    }

    STATE.activeProcessor = new AudioProcessor();
    STATE.activeProcessor.loadAudio(file);
    STATE.activeProcessor.onSaveToPack = (blob, path) => {
        STATE.packBuilder.addFile(path, blob);
        console.log("Saved audio to pack:", path);
    };
}

// === Minecraft Path Selection ===
async function selectMinecraftFolder() {
    try {
        if ('showDirectoryPicker' in window) {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
            STATE.minecraftPath = dirHandle;

            // Init Extractor
            const btn = document.getElementById('import-mc-btn');
            const originalText = btn.textContent;
            btn.textContent = "Loading Versions...";
            btn.disabled = true;

            try {
                await STATE.assetExtractor.setRootHandle(dirHandle);
                const versions = STATE.assetExtractor.versions;
                if (versions.length === 0) {
                    alert("No Minecraft versions found in this folder! Make sure you selected the .minecraft folder.");
                    return;
                }

                // Ask user to pick version (simple prompt for now)
                // In real app, modal dialog. Here: prompt or default to latest.
                let useVersion = versions[0];
                if (versions.length > 1) {
                    const userPick = prompt(`Found ${versions.length} versions. Enter version to load:\n${versions.slice(0, 5).join('\n')}...`, versions[0]);
                    if (versions.includes(userPick)) useVersion = userPick;
                }

                // EXTRACT
                await STATE.assetExtractor.extractVersion(useVersion, (pct, msg) => {
                    btn.textContent = `[${Math.round(pct)}%] ${msg}`;
                });

                // Init Browser
                STATE.assetBrowser = new AssetBrowser('asset-browser', STATE.assetExtractor, (file, type) => {
                    handleFile(file);
                });
                STATE.assetBrowser.buildStructure();

                alert(`Loaded assets from Minecraft ${useVersion}!`);

            } catch (e) {
                console.error(e);
                alert("Error loading Minecraft assets: " + e.message);
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }

        } else {
            alert("Your browser doesn't support folder selection. Please use Chrome or Edge.");
        }
    } catch (err) {
        console.error("Folder selection cancelled:", err);
    }
}

// === Utilities ===

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Export for global access
window.MCCreator = {
    STATE,
    selectMinecraftFolder,
    loadSample,
    handleFile
};

import { ToolsManager } from './tools/ToolsManager.js';

// === Import .Minecraft Logic ===
function initImportControls() {
    const importBtn = document.getElementById('import-mc-btn');
    const modal = document.getElementById('import-modal');
    const closeBtn = document.getElementById('close-import-modal');
    const copyBtn = document.getElementById('copy-path-btn');
    const triggerFileBtn = document.getElementById('trigger-jar-import');
    const fileInput = document.getElementById('modal-jar-input');

    if (importBtn && modal) {
        // Open Modal
        importBtn.onclick = () => {
            modal.hidden = false;
        };

        // Close Modal
        closeBtn.onclick = () => {
            modal.hidden = true;
        };

        // Copy Path
        copyBtn.onclick = () => {
            const path = document.getElementById('mc-path').textContent;
            navigator.clipboard.writeText(path).then(() => {
                const original = copyBtn.textContent;
                copyBtn.textContent = "✅";
                setTimeout(() => copyBtn.textContent = original, 1500);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        };

        // Trigger File Select (Trusted Event)
        triggerFileBtn.onclick = () => {
            fileInput.click();
        };

        // Handle File Selection
        fileInput.onchange = async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                modal.hidden = true; // Close modal immediately

                try {
                    importBtn.textContent = "Loading JAR...";
                    importBtn.disabled = true;

                    // Initialize Extractor
                    const success = await STATE.assetExtractor.loadJar(file);

                    if (success) {
                        // Initialize Browser if needed
                        if (!STATE.assetBrowser) {
                            createGlobalAssetBrowser();
                        }
                        STATE.assetBrowser.open();
                    }
                } catch (err) {
                    alert("Error loading JAR: " + err.message);
                    console.error(err);
                } finally {
                    importBtn.textContent = "📁 Import .minecraft";
                    importBtn.disabled = false;
                    fileInput.value = ''; // Reset
                }
            }
        };
    }
}


function initPackButtons() {
    // Texture Add
    const addTexBtn = document.getElementById('add-texture-to-pack');
    if (addTexBtn) {
        addTexBtn.onclick = async () => {
            if (STATE.activeProcessor && STATE.activeProcessor.getCanvasBlob) {
                const blob = await STATE.activeProcessor.getCanvasBlob();
                let path = STATE.activeProcessor.currentFilePath;

                if (!path) {
                    path = `assets/minecraft/textures/custom_${Date.now()}.png`;
                    path = prompt("Enter path for this texture:", path) || path;
                } else {
                    // Ensure path is relative
                    if (path.includes('assets/')) path = path.substring(path.indexOf('assets/'));
                }

                STATE.packBuilder.addFile(path, blob);
                alert(`Added ${path} to Pack!`);
            } else {
                alert("No active texture to add.");
            }
        };
    }

    // Sound Add
    const addSoundBtn = document.getElementById('add-sound-to-pack');
    if (addSoundBtn) {
        addSoundBtn.onclick = () => {
            if (STATE.file && STATE.type === 'audio') {
                let path = `assets/minecraft/sounds/custom_${Date.now()}.ogg`;
                path = prompt("Enter path for this sound:", path) || path;
                STATE.packBuilder.addFile(path, STATE.file);
                alert("Added sound to pack!");
            } else {
                alert("No active sound.");
            }
        };
    }

    // Datapack Add
    const addDataBtn = document.getElementById('add-data-to-pack');
    if (addDataBtn) {
        addDataBtn.onclick = () => {
            alert("Datapack export not yet fully implemented. Use the individual Save buttons in the tools.");
        };
    }

    // Global Add to Pack Button (Header)
    const globalAddBtn = document.getElementById('global-add-pack-btn');
    if (globalAddBtn) {
        globalAddBtn.onclick = () => {
            // Determine context based on active tab
            const activeTabBtn = document.querySelector('.nav-tab.active');
            const tabId = activeTabBtn ? activeTabBtn.dataset.tab : null;

            if (tabId === 'textures') {
                if (addTexBtn) addTexBtn.click();
            } else if (tabId === 'sounds') {
                if (addSoundBtn) addSoundBtn.click();
            } else if (tabId === 'datapack') {
                if (addDataBtn) addDataBtn.click();
            } else if (tabId === 'shaders') {
                // Placeholder for shader add
                if (STATE.shaderManager) STATE.shaderManager.addToPack();
                else alert("Shader Manager not ready.");
            } else {
                alert("Go to an editor (Textures, Sounds, etc.) to add items to the pack.");
            }
        };
    }
}

function createGlobalAssetBrowser() {
    STATE.assetBrowser = new AssetBrowser(STATE.assetExtractor, async (path) => {
        console.log("Selected asset:", path);

        try {
            let file = null;
            let type = null;

            if (path.endsWith('.png')) {
                const blob = await STATE.assetExtractor.getFile(path);
                if (!blob) throw new Error("Failed to load image blob");

                const name = path.split('/').pop();
                file = new File([blob], name, { type: 'image/png' });
                type = 'image';

                // Switch tabs (UI)
                const tab = document.querySelector('[data-tab="textures"]');
                if (tab) tab.click();

            } else if (path.endsWith('.ogg')) {
                const blob = await STATE.assetExtractor.getFile(path);
                if (!blob) throw new Error("Failed to load sound blob");

                const name = path.split('/').pop();
                file = new File([blob], name, { type: 'audio/ogg' });
                type = 'audio';

                const tab = document.querySelector('[data-tab="sounds"]');
                if (tab) tab.click();
            }

            if (file) {
                console.log("Dispatching file to handleFile:", file.name);
                handleFile(file);

                // Inject path for save logic after processor init
                if (type === 'image' && STATE.activeProcessor) {
                    STATE.activeProcessor.currentFilePath = path;
                }
            } else {
                console.warn("Ignored asset (unknown type):", path);
            }

        } catch (e) {
            console.error("Asset Load Error:", e);
            alert("Could not load asset: " + e.message);
        }
    });
}

console.log("MC Creator System Loading...");

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    detectMinecraftPath();
    console.log("MC Creator Initialized.");

    // Init Pack Manager UI
    STATE.packManagerUI = new PackManagerUI(STATE.packBuilder);
    STATE.packManagerUI.init();

    // Init Tools Manager
    STATE.toolsManager = new ToolsManager();

    // Init Datapack Manager
    STATE.datapackManager = new DatapackManager(STATE.packBuilder);
    STATE.datapackManager.init();

    // Init Shader Manager
    STATE.shaderManager = new ShaderManager(STATE.packBuilder);
    STATE.shaderManager.init();
    initImportControls();
    initPackButtons();
});
