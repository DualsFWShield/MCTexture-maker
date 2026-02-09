export const PackFormats = {
    // Newer versions
    "1.21.2": 42,
    "1.21": 34,
    "1.20.5": 32,
    "1.20.4": 22,
    "1.20.2": 18,
    "1.20.1": 15,
    "1.20": 15,
    "1.19.4": 13,
    "1.19.3": 12,
    "1.19": 9,
    "1.18": 8,
    "1.17": 7,
    "1.16": 6,
    "1.15": 5,
    "1.13": 4,
    "1.11": 3,
    "1.9": 2,
    "1.6": 1
};

export const FormatToVersion = Object.entries(PackFormats).reduce((acc, [ver, fmt]) => {
    acc[fmt] = ver;
    return acc;
}, {});

export function getFormatForVersion(version) {
    return PackFormats[version] || 34; // Default to 1.21
}
