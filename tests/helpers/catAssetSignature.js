import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const digest = (value) => createHash('sha256').update(value).digest('hex');

// Hash decoded track payloads, not GLB offsets, which change when clips are packed.
export async function catAssetSignature(path) {
  const bytes = await readFile(path),
    length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length);
  const accessor = (id) => {
    const { bufferView, ...definition } = json.accessors[id],
      view = json.bufferViews[bufferView];
    return [
      definition,
      digest(binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)),
    ];
  };
  const geometry = json.meshes.map((m) =>
    m.primitives.map((p) => ({
      ...p,
      attributes: Object.fromEntries(
        Object.entries(p.attributes).map(([key, id]) => [key, accessor(id)]),
      ),
      indices: p.indices == null ? null : accessor(p.indices),
    })),
  );
  const animations = Object.fromEntries(
    json.animations.map((a) => [
      a.name,
      digest(
        JSON.stringify(
          a.channels.map((c) => {
            const s = a.samplers[c.sampler];
            return [c.target, s.interpolation, accessor(s.input), accessor(s.output)];
          }),
        ),
      ),
    ]),
  );
  return {
    staticAsset: digest(
      JSON.stringify([
        json.nodes,
        geometry,
        json.materials,
        json.textures,
        json.images.map(({ bufferView, ...image }) => [
          image,
          digest(
            binary.subarray(
              json.bufferViews[bufferView].byteOffset,
              json.bufferViews[bufferView].byteOffset + json.bufferViews[bufferView].byteLength,
            ),
          ),
        ]),
        json.skins.map(({ inverseBindMatrices, ...skin }) => [skin, accessor(inverseBindMatrices)]),
        json.asset.extras.sources,
      ]),
    ),
    animations,
    profiles: Object.fromEntries(
      Object.entries(json.asset.extras.stillMotion.profiles).map(([name, profile]) => [
        name,
        digest(JSON.stringify(profile)),
      ]),
    ),
  };
}
