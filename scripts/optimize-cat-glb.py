"""Losslessly compact buffer views and constant animation tracks; no runtime decoder.
Run with Python 3: python scripts/optimize-cat-glb.py path/to/cat.glb
"""

import json
import struct
import sys


def optimize(path):
    raw = open(path, "rb").read()
    json_length = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20 : 20 + json_length])
    binary = bytearray(raw[28 + json_length :])
    views = doc["bufferViews"]
    accessors = doc["accessors"]

    def add_values(values, kind):
        start = len(binary)
        binary.extend(struct.pack("<" + "f" * len(values), *values))
        views.append({"buffer": 0, "byteOffset": start, "byteLength": len(values) * 4})
        accessors.append(
            {
                "bufferView": len(views) - 1,
                "componentType": 5126,
                "count": 1,
                "type": kind,
            }
        )
        if kind == "SCALAR":
            accessors[-1].update(min=values, max=values)
        return len(accessors) - 1

    zero = add_values([0.0], "SCALAR")
    reduced = 0
    for animation in doc["animations"]:
        for sampler in animation["samplers"]:
            output = accessors[sampler["output"]]
            if output.get("componentType") != 5126 or output.get("type") not in {
                "VEC3",
                "VEC4",
            }:
                continue
            count = output["count"]
            size = 3 if output["type"] == "VEC3" else 4
            view = views[output["bufferView"]]
            offset = view.get("byteOffset", 0) + output.get("byteOffset", 0)
            stride = view.get("byteStride", size * 4)
            values = [
                struct.unpack_from("<" + "f" * size, binary, offset + i * stride)
                for i in range(count)
            ]
            # Exact constants only; no tolerance or quaternion approximation.
            if count > 1 and all(v == values[0] for v in values):
                sampler["input"] = zero
                sampler["output"] = add_values(list(values[0]), output["type"])
                reduced += 1

    references = []
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            references.extend(
                (primitive["attributes"], k) for k in primitive["attributes"]
            )
            if "indices" in primitive:
                references.append((primitive, "indices"))
            for target in primitive.get("targets", []):
                references.extend((target, k) for k in target)
    for skin in doc["skins"]:
        if "inverseBindMatrices" in skin:
            references.append((skin, "inverseBindMatrices"))
    for animation in doc["animations"]:
        for sampler in animation["samplers"]:
            references.extend([(sampler, "input"), (sampler, "output")])
    used = sorted({obj[key] for obj, key in references})
    remap = {old: new for new, old in enumerate(used)}
    for obj, key in references:
        obj[key] = remap[obj[key]]
    doc["accessors"] = [accessors[i] for i in used]
    references = [(a, "bufferView") for a in doc["accessors"] if "bufferView" in a]
    references += [
        (image, "bufferView")
        for image in doc.get("images", [])
        if "bufferView" in image
    ]
    compact = bytearray()
    new_views = []
    dedup = {}
    for old in sorted({obj[key] for obj, key in references}):
        view = views[old]
        start = view.get("byteOffset", 0)
        data = bytes(binary[start : start + view["byteLength"]])
        key = (data, view.get("byteStride"), view.get("target"))
        if key not in dedup:
            compact.extend(b"\0" * (-len(compact) % 4))
            new_view = dict(view, byteOffset=len(compact), buffer=0)
            new_views.append(new_view)
            compact.extend(data)
            dedup[key] = len(new_views) - 1
        remap[old] = dedup[key]
    for obj, key in references:
        obj[key] = remap[obj[key]]
    doc["bufferViews"] = new_views
    doc["buffers"] = [{"byteLength": len(compact)}]
    compact.extend(b"\0" * (-len(compact) % 4))
    encoded = json.dumps(doc, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    header = struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(compact))
    with open(path, "wb") as output:
        output.write(header + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded)
        output.write(struct.pack("<II", len(compact), 0x004E4942) + compact)
    print(
        f"{reduced} constant tracks compacted; {len(raw):,} → {28 + len(encoded) + len(compact):,} bytes"
    )


if __name__ == "__main__":
    optimize(sys.argv[1])
