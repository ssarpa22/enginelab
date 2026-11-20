# HL-CEAD engine audio dataset

EngineLab references the public Humain-Lab Car Engine Audio Database (HL-CEAD) as a Git submodule at `data/hl-cead`.

## Get the recordings

For a fresh clone:

```powershell
git clone --recurse-submodules https://github.com/ssarpa22/enginelab.git
```

For an existing clone:

```powershell
git submodule update --init --recursive
```

The submodule pins the upstream repository to a specific commit so the dataset revision is reproducible. To update it deliberately:

```powershell
cd data/hl-cead
git fetch origin
git checkout origin/main
cd ../..
git add data/hl-cead
git commit -m "Update HL-CEAD dataset revision"
```

## What is in the dataset

The upstream README describes approximately 15-second WAV recordings of engines from multiple manufacturers and models, recorded at steady 1000, 1500 and 2000 RPM. Matching filenames across RPM folders refer to the same vehicle.

**Important limitation for EngineLab:** these are steady-state recordings, not synchronized accelerator/throttle recordings. They can help us build believable engine timbre and RPM layers, but they do not directly provide a measured throttle-release / overrun recording. We will need to create a controlled transition between samples (or source separate overrun recordings) rather than label these clips as real deceleration captures.

The recordings remain in the submodule and are not copied into the web application's production bundle. This keeps the app repository and deployment payload from ballooning. The browser audio lab can load selected files locally during development; production integration should use only curated, appropriately sized assets.

Upstream project: https://github.com/MachineLearningVisionRG/machine_biometrics
