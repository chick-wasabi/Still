"""Build Still's tabby/animation-rig derivative with Blender 4.3+.
Run: blender -b -t 2 --python scripts/build-tabby-asset.py -- TABBY.glb RIG.glb OUTPUT.glb
Source assets are user supplied; see THIRD_PARTY_NOTICES.md for their separate licenses.
"""

import bpy, math, sys, os, json, struct, hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

bpy.ops.wm.read_factory_settings(use_empty=True)
args = sys.argv[sys.argv.index("--") + 1 :]
if len(args) != 3:
    raise SystemExit("Expected TABBY.glb RIG.glb OUTPUT.glb")
tabby_path, rig_path, output_path = map(os.path.abspath, args)
bpy.ops.import_scene.gltf(filepath=rig_path)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
refs = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.vertex_groups]
# Map the supplied animation skeleton into the tabby's rest proportions.
knots = [
    (-0.51, -0.325),
    (-0.43, -0.297),
    (-0.27, -0.153),
    (0.07, 0.095),
    (0.205, 0.125),
    (0.475, 0.498),
]


def map_y(y):
    for i in range(len(knots) - 1):
        a, b = knots[i], knots[i + 1]
        if y <= b[0] or i == len(knots) - 2:
            return a[1] + (y - a[0]) / (b[0] - a[0]) * (b[1] - a[1])


def warp(p):
    return Vector((p.x * 0.52, map_y(p.y), p.z * 0.58 - 0.005))


vs = []
tris = []
weights = []
for o in refs:
    offset = len(vs)
    vs.extend(warp(o.matrix_world @ v.co) for v in o.data.vertices)
    for v in o.data.vertices:
        weights.append({o.vertex_groups[g.group].name: g.weight for g in v.groups})
    o.data.calc_loop_triangles()
    tris.extend(tuple(offset + i for i in t.vertices) for t in o.data.loop_triangles)
bvh = BVHTree.FromPolygons(vs, tris, all_triangles=True)
# The old local animation deltas remain on the fitted bones. Rest positions follow the new proportions.
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
inv = arm.matrix_world.inverted()
for b in arm.data.edit_bones:
    head = inv @ warp(arm.matrix_world @ b.head)
    tail = inv @ warp(arm.matrix_world @ b.tail)
    b.head = head
    b.tail = tail
bpy.ops.object.mode_set(mode="OBJECT")
for o in list(bpy.context.scene.objects):
    if o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
old = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=tabby_path)
targets = [o for o in bpy.data.objects if o not in old and o.type == "MESH"]
for o in targets:
    world = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = world
    # Bake glTF parent transforms into geometry in armature object space.
    matrix = inv @ world
    o.data.transform(matrix)
    o.matrix_world = arm.matrix_world.copy()
    groups = {b.name: o.vertex_groups.new(name=b.name) for b in arm.data.bones}
    material_name = o.data.materials[0].name
    head_name = next(b.name for b in arm.data.bones if b.name.startswith("head_"))
    jaw_name = next(b.name for b in arm.data.bones if b.name.startswith("jaw_"))
    for v in o.data.vertices:
        p = arm.matrix_world @ v.co
        hit, normal, idx, dist = bvh.find_nearest(p)
        tri = tris[idx]
        bary = poly_3d_calc([vs[i] for i in tri], hit)
        out = {}
        for i, w in zip(tri, bary):
            for name, value in weights[i].items():
                out[name] = out.get(name, 0) + max(0, w) * value
        # Preserve the nested eye shells and fine whiskers as a coherent head.
        # Independent nearest-surface weights can otherwise push the iris behind its sclera.
        if material_name in {
            "EyeRim",
            "EyeWhite",
            "Iris",
            "Cornea",
            "Pupil",
            "Nose",
            "Nostrils",
            "Whiskers",
        } or (p.y < -0.26 and 0.25 < p.z < 0.337):
            out = {head_name: 1.0}
        if material_name == "Tongue":
            out = {jaw_name: 1.0}
        top = sorted(out.items(), key=lambda x: -x[1])[:4]
        total = sum(w for name, w in top)
        for name, w in top:
            if w / total > 0.00001:
                groups[name].add([v.index], w / total, "REPLACE")
    o.parent = arm
    mod = o.modifiers.new("Transferred animation rig", "ARMATURE")
    mod.object = arm
# Pose translations must follow the smaller rest skeleton, especially the toe helpers.
for action in bpy.data.actions:
    for curve in action.fcurves:
        if curve.data_path.endswith(".location"):
            for key in curve.keyframe_points:
                key.co.y *= 0.58
                key.handle_left.y *= 0.58
                key.handle_right.y *= 0.58
# All opaque parts share one UV atlas. Consolidate them into a fur and eye material.
fur = bpy.data.materials["material"]
eye = bpy.data.materials["Iris"]
# Keep a plain transparent eye shell. Original cornea emission/packed maps are
# unnecessary at pet scale and duplicate the atlas in several texture channels.
cornea = bpy.data.materials.new("Still eye shell")
cornea.use_nodes = True
cornea.surface_render_method = "DITHERED"
bsdf = next(n for n in cornea.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
bsdf.inputs["Alpha"].default_value = 0.025
bsdf.inputs["Roughness"].default_value = 0.18
bsdf.inputs["Coat Weight"].default_value = 0.3
for mat, roughness in [(fur, 0.86), (eye, 0.24)]:
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0
for o in targets:
    oldmat = o.data.materials[0]
    replacement = (
        cornea
        if oldmat.name == "Cornea"
        else eye if oldmat.name in {"EyeWhite", "Iris", "Pupil"} else fur
    )
    o.data.materials.clear()
    o.data.materials.append(replacement)
# One joined skinned mesh, with three material primitives. Preserve its atlas and detail.
bpy.ops.object.select_all(action="DESELECT")
for o in targets:
    o.select_set(True)
bpy.context.view_layer.objects.active = targets[0]
bpy.ops.object.join()
targets = [bpy.context.object]
targets[0].name = "Still_Tabby"
# A 1024px atlas is ample for a 45px pet; no external texture or decoder requests.
for image in bpy.data.images:
    if image.size[0] > 1024 or image.size[1] > 1024:
        scale = 1024 / max(image.size)
        image.scale(round(image.size[0] * scale), round(image.size[1] * scale))
# Keep only actual cat objects and rig hierarchy; importers create helper shapes.
for o in list(bpy.context.scene.objects):
    if o.type not in {"ARMATURE", "MESH"}:
        continue
    if o.type == "MESH" and o not in targets:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
for o in targets:
    o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_image_format="JPEG",
    export_jpeg_quality=90,
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_anim_slide_to_zero=True,
    export_skins=True,
    export_def_bones=False,
    export_force_sampling=True,
    export_yup=True,
)
# Preserve provenance in the distributable, not just the repository documentation.
raw = open(output_path, "rb").read()
length = struct.unpack_from("<I", raw, 12)[0]
doc = json.loads(raw[20 : 20 + length])
doc["asset"]["extras"] = {
    "title": "Still Tabby Companion",
    "sources": [
        {
            "title": "Realistic cat - Pets for your project",
            "author": "Micael Martins",
            "license": "Sketchfab Standard",
            "url": "https://sketchfab.com/3d-models/realistic-cat-pets-for-your-project-ec407d89f7304194bc04f2b4710eab8c",
            "sha256": hashlib.sha256(open(tabby_path, "rb").read()).hexdigest(),
        },
        {
            "title": "Sphynx Cat – Rigged & Animated (10 Anims)",
            "author": "Animal Animator",
            "license": "CC-BY-4.0",
            "url": "https://sketchfab.com/3d-models/sphynx-cat-rigged-animated-10-anims-0b86bde7a8b64fd7a459035b339a790f",
            "sha256": hashlib.sha256(open(rig_path, "rb").read()).hexdigest(),
        },
    ],
    "modifications": "Tabby geometry fitted to adapted 108-joint skeleton; barycentric nearest-surface skin-weight transfer; scaled animation translations; material consolidation and atlas resizing.",
}
j = json.dumps(doc, separators=(",", ":")).encode()
j += b" " * ((-len(j)) % 4)
tail = raw[20 + length :]
with open(output_path, "wb") as f:
    f.write(
        struct.pack("<III", 0x46546C67, 2, 20 + len(j) + len(tail))
        + struct.pack("<II", len(j), 0x4E4F534A)
        + j
        + tail
    )
print("EXPORTED", output_path, os.path.getsize(output_path), "bytes")

# Exact compaction preserves keyframe values and needs no browser decoder.
import runpy

runpy.run_path(os.path.join(os.path.dirname(__file__), "optimize-cat-glb.py"))[
    "optimize"
](output_path)
