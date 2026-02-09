export const ShaderTemplates = {
    gbuffers_terrain: {
        basic: {
            vsh: `#version 120

attribute vec4 mc_Entity;

varying vec4 texcoord;
varying vec4 color;

void main() {
    texcoord = gl_MultiTexCoord0;
    color = gl_Color;
    gl_Position = ftransform();
}`,
            fsh: `#version 120

uniform sampler2D texture;

varying vec4 texcoord;
varying vec4 color;

void main() {
    gl_FragColor = texture2D(texture, texcoord.st) * color;
}`
        },
        waving: {
            vsh: `#version 120

attribute vec4 mc_Entity;
uniform float frameTimeCounter;

varying vec4 texcoord;
varying vec4 color;

void main() {
    texcoord = gl_MultiTexCoord0;
    color = gl_Color;
    
    vec4 position = gl_Vertex;
    
    // Simple Waving Logic (Check if top of block)
    if (texcoord.t < 0.2 && mc_Entity.x == 31.0) { // Grass ID check (example)
        position.x += sin(frameTimeCounter * 2.0 + position.z) * 0.1;
    }
    
    gl_Position = gl_ModelViewProjectionMatrix * position;
}`,
            fsh: `#version 120

uniform sampler2D texture;

varying vec4 texcoord;
varying vec4 color;

void main() {
    gl_FragColor = texture2D(texture, texcoord.st) * color;
}`
        },
        cel: {
            vsh: `#version 120

varying vec4 texcoord;
varying vec4 color;
varying vec3 normal;

void main() {
    texcoord = gl_MultiTexCoord0;
    color = gl_Color;
    normal = gl_NormalMatrix * gl_Normal;
    gl_Position = ftransform();
}`,
            fsh: `#version 120

uniform sampler2D texture;

varying vec4 texcoord;
varying vec4 color;
varying vec3 normal;

void main() {
    vec4 tex = texture2D(texture, texcoord.st);
    
    // Cel Shading Logic (Step lighting)
    float intensity = dot(normalize(normal), vec3(0.5, 1.0, 0.5));
    if (intensity > 0.95) intensity = 1.0;
    else if (intensity > 0.5) intensity = 0.7;
    else if (intensity > 0.25) intensity = 0.4;
    else intensity = 0.2;
    
    gl_FragColor = tex * color * vec4(vec3(intensity), 1.0);
}`
        },
        grayscale: {
            vsh: `#version 120
varying vec4 texcoord;
varying vec4 color;
void main() {
    texcoord = gl_MultiTexCoord0;
    color = gl_Color;
    gl_Position = ftransform();
}`,
            fsh: `#version 120
uniform sampler2D texture;
varying vec4 texcoord;
varying vec4 color;
void main() {
    vec4 col = texture2D(texture, texcoord.st) * color;
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));
    gl_FragColor = vec4(vec3(gray), col.a);
}`
        }
    },
    // Fallback for others
    default: {
        vsh: `#version 120
void main() {
    gl_Position = ftransform();
}`,
        fsh: `#version 120
void main() {
    gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); // Error Pink
}`
    }
};
