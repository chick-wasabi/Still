import {
  DataTexture,
  RGBAFormat,
  SRGBColorSpace,
  RepeatWrapping,
  LinearMipmapLinearFilter,
} from 'three';

// Bundled procedural fur: deterministic, reusable, and usable without a DOM or remote asset server.
export function createFurTextures(size = 256) {
  const color = new Uint8Array(size * size * 4),
    normal = new Uint8Array(color.length);
  const noise = (x, y) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size,
        n = noise(x, y);
      const wave = Math.sin(u * Math.PI * 16 + Math.sin(v * 12) * 1.7 + Math.sin(v * 31) * 0.24);
      const stripe = Math.pow(Math.max(0, wave), 5) * (0.7 + 0.3 * Math.sin(v * 5 + 1));
      const strand = Math.sin(x * 2.6 + Math.sin(y * 0.17) * 0.7) * 0.023 + n * 0.045;
      const value = 0.8 - stripe * 0.38 + strand;
      const i = (y * size + x) * 4;
      color[i] = Math.round(183 * value);
      color[i + 1] = Math.round(166 * value);
      color[i + 2] = Math.round(147 * value);
      color[i + 3] = 255;
      normal[i] = 128 + Math.round(Math.cos(x * 2.6 + Math.sin(y * 0.17)) * 14);
      normal[i + 1] = 128 + Math.round((n - 0.5) * 8);
      normal[i + 2] = 253;
      normal[i + 3] = 255;
    }
  function texture(data) {
    const map = new DataTexture(data, size, size, RGBAFormat);
    map.wrapS = map.wrapT = RepeatWrapping;
    map.generateMipmaps = true;
    map.minFilter = LinearMipmapLinearFilter;
    map.needsUpdate = true;
    return map;
  }
  const map = texture(color),
    normalMap = texture(normal);
  map.colorSpace = SRGBColorSpace;
  return {
    map,
    normalMap,
    dispose() {
      map.dispose();
      normalMap.dispose();
    },
  };
}
