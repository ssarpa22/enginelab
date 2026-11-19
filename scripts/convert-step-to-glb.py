#!/usr/bin/env python3
"""Convert the supplied STEP cutaway into a browser-ready GLB with separate solids.

Usage:
  python -m pip install cadquery trimesh numpy
  python scripts/convert-step-to-glb.py assets/source/four-cylinder-inline-piston-engine-cutaway.step public/models/engine-cutaway.glb

The mesh tolerance is deliberately configurable: smaller values create more detail and
larger files; larger values are faster and lighter for browser rendering.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np
import cadquery as cq
import trimesh


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("step_file", type=Path)
    parser.add_argument("output_glb", type=Path)
    parser.add_argument("--linear-tolerance", type=float, default=1.2, help="STEP units; default 1.2 mm")
    parser.add_argument("--angular-tolerance", type=float, default=0.35, help="radians")
    args = parser.parse_args()
    if not args.step_file.is_file():
        raise SystemExit(f"STEP file not found: {args.step_file}")
    assembly = cq.importers.importStep(str(args.step_file))
    solids = assembly.solids().vals()
    scene = trimesh.Scene()
    for index, solid in enumerate(solids):
        vertices, faces = solid.tessellate(args.linear_tolerance, args.angular_tolerance)
        if not faces:
            continue
        mesh = trimesh.Trimesh(
            vertices=np.asarray([[p.x, p.y, p.z] for p in vertices], dtype=np.float32),
            faces=np.asarray(faces, dtype=np.int64),
            process=False,
        )
        bounds = solid.BoundingBox()
        name = f"cad-part-{index:03d}-z{int(round(bounds.zmin))}"
        scene.add_geometry(mesh, geom_name=name, node_name=name)
    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    scene.export(str(args.output_glb))
    triangles = sum(len(mesh.faces) for mesh in scene.geometry.values())
    print(f"Exported {len(scene.geometry)} separate solids / {triangles:,} triangles -> {args.output_glb}")


if __name__ == "__main__":
    main()
