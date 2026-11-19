# EngineLab CAD assets

Place the two user-supplied source models here:

- `public/models/piston-with-rings-and-connecting-rod.glb`
- `public/models/engine-cutaway.glb`

The piston GLB is used by the dedicated component-inspection view. The STEP cutaway
must first be converted to GLB because browsers cannot render STEP directly.

From the repository root, run:

```powershell
py -m pip install cadquery trimesh numpy
py scripts/convert-step-to-glb.py assets/source/four-cylinder-inline-piston-engine-cutaway.step public/models/engine-cutaway.glb
```

Keep the original STEP in `assets/source/` (not in the public web bundle). The converter
preserves each STEP solid as a separate GLB node. Its default 1.2 mm tessellation tolerance
is tuned for interactive inspection; use `--linear-tolerance 0.6` for a heavier, more
detailed export or `--linear-tolerance 1.8` for a lighter one.

The binary source assets are intentionally not duplicated in Git history. Add them locally
to the paths above; the viewer reports a clear missing-asset state until they are present.
