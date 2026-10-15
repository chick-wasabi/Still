import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The real GLB and rig, without DOM-only image decoding. Browser tests exercise
// its actual textures. This does not replace or stub geometry/animation data.
export async function loadCatAsset() {
  const b = await readFile(new URL('../../public/models/still-tabby.v1.glb', import.meta.url)),
    l = b.readUInt32LE(12),
    d = JSON.parse(b.subarray(20, 20 + l));
  delete d.materials;
  delete d.images;
  delete d.textures;
  for (const m of d.meshes) for (const p of m.primitives) delete p.material;
  let j = Buffer.from(JSON.stringify(d));
  j = Buffer.concat([j, Buffer.alloc((4 - (j.length % 4)) % 4, 32)]);
  const tail = b.subarray(20 + l),
    out = Buffer.alloc(20 + j.length + tail.length);
  out.writeUInt32LE(0x46546c67);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(j.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  j.copy(out, 20);
  tail.copy(out, 20 + j.length);

  return new GLTFLoader().parseAsync(
    out.buffer.slice(out.byteOffset, out.byteOffset + out.length),
    '',
  );
}
