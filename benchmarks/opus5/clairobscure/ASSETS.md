# Asset credits

Every file under `assets/` was downloaded by `tools/fetch-assets.mjs`, which resolves
each URL from an official JSON API (Poly Haven `api.polyhaven.com`) or a version-pinned
repository path — no URL in this project was hand-written or guessed. Each download is
verified for HTTP 200, a non-zero body and a correct format magic number before it is
written to disk.

Regenerate with:

```
node tools/fetch-assets.mjs
node tools/write-assets-md.mjs
```

**69 files, 94.2 MB total.**

## Environment (HDRI)

| File | Source URL | License | Author |
|---|---|---|---|
| `assets/hdri/table_mountain_2_puresky_4k.hdr` | https://polyhaven.com/a/table_mountain_2_puresky | CC0 1.0 | Greg Zaal, Jarod Guest |

## PBR textures

| File | Source URL | License | Author |
|---|---|---|---|
| `assets/textures/cobblestone_floor_08/arm.jpg` | https://polyhaven.com/a/cobblestone_floor_08 | CC0 1.0 | Rob Tuytel |
| `assets/textures/cobblestone_floor_08/diff.jpg` | https://polyhaven.com/a/cobblestone_floor_08 | CC0 1.0 | Rob Tuytel |
| `assets/textures/cobblestone_floor_08/nor.jpg` | https://polyhaven.com/a/cobblestone_floor_08 | CC0 1.0 | Rob Tuytel |
| `assets/textures/forest_ground_04/arm.jpg` | https://polyhaven.com/a/forest_ground_04 | CC0 1.0 | Rob Tuytel, Rico Cilliers |
| `assets/textures/forest_ground_04/diff.jpg` | https://polyhaven.com/a/forest_ground_04 | CC0 1.0 | Rob Tuytel, Rico Cilliers |
| `assets/textures/forest_ground_04/nor.jpg` | https://polyhaven.com/a/forest_ground_04 | CC0 1.0 | Rob Tuytel, Rico Cilliers |
| `assets/textures/medieval_blocks_05/arm.jpg` | https://polyhaven.com/a/medieval_blocks_05 | CC0 1.0 | Rob Tuytel |
| `assets/textures/medieval_blocks_05/diff.jpg` | https://polyhaven.com/a/medieval_blocks_05 | CC0 1.0 | Rob Tuytel |
| `assets/textures/medieval_blocks_05/nor.jpg` | https://polyhaven.com/a/medieval_blocks_05 | CC0 1.0 | Rob Tuytel |
| `assets/textures/rock_wall_09/arm.jpg` | https://polyhaven.com/a/rock_wall_09 | CC0 1.0 | Dimitrios Savva |
| `assets/textures/rock_wall_09/diff.jpg` | https://polyhaven.com/a/rock_wall_09 | CC0 1.0 | Dimitrios Savva |
| `assets/textures/rock_wall_09/nor.jpg` | https://polyhaven.com/a/rock_wall_09 | CC0 1.0 | Dimitrios Savva |

## Models (glTF / GLB)

| File | Source URL | License | Author |
|---|---|---|---|
| `assets/models/bronze_whale_statue/bronze_whale_statue_1k.gltf` | https://polyhaven.com/a/bronze_whale_statue | CC0 1.0 | Tina |
| `assets/models/bronze_whale_statue/bronze_whale_statue.bin` | https://polyhaven.com/a/bronze_whale_statue | CC0 1.0 | Tina |
| `assets/models/bronze_whale_statue/textures/bronze_whale_statue_arm_1k.jpg` | https://polyhaven.com/a/bronze_whale_statue | CC0 1.0 | Tina |
| `assets/models/bronze_whale_statue/textures/bronze_whale_statue_diff_1k.jpg` | https://polyhaven.com/a/bronze_whale_statue | CC0 1.0 | Tina |
| `assets/models/bronze_whale_statue/textures/bronze_whale_statue_nor_gl_1k.jpg` | https://polyhaven.com/a/bronze_whale_statue | CC0 1.0 | Tina |
| `assets/models/Chandelier_01/Chandelier_01_1k.gltf` | https://polyhaven.com/a/Chandelier_01 | CC0 1.0 | Kirill Sannikov |
| `assets/models/Chandelier_01/Chandelier_01.bin` | https://polyhaven.com/a/Chandelier_01 | CC0 1.0 | Kirill Sannikov |
| `assets/models/Chandelier_01/textures/Chandelier_01_arm_1k.jpg` | https://polyhaven.com/a/Chandelier_01 | CC0 1.0 | Kirill Sannikov |
| `assets/models/Chandelier_01/textures/Chandelier_01_diff_1k.jpg` | https://polyhaven.com/a/Chandelier_01 | CC0 1.0 | Kirill Sannikov |
| `assets/models/Chandelier_01/textures/Chandelier_01_nor_gl_1k.jpg` | https://polyhaven.com/a/Chandelier_01 | CC0 1.0 | Kirill Sannikov |
| `assets/models/dead_tree_trunk_02/dead_tree_trunk_02_1k.gltf` | https://polyhaven.com/a/dead_tree_trunk_02 | CC0 1.0 | Jenelle van Heerden, Rico Cilliers |
| `assets/models/dead_tree_trunk_02/dead_tree_trunk_02.bin` | https://polyhaven.com/a/dead_tree_trunk_02 | CC0 1.0 | Jenelle van Heerden, Rico Cilliers |
| `assets/models/dead_tree_trunk_02/textures/dead_tree_trunk_02_arm_1k.jpg` | https://polyhaven.com/a/dead_tree_trunk_02 | CC0 1.0 | Jenelle van Heerden, Rico Cilliers |
| `assets/models/dead_tree_trunk_02/textures/dead_tree_trunk_02_diff_1k.jpg` | https://polyhaven.com/a/dead_tree_trunk_02 | CC0 1.0 | Jenelle van Heerden, Rico Cilliers |
| `assets/models/dead_tree_trunk_02/textures/dead_tree_trunk_02_nor_gl_1k.jpg` | https://polyhaven.com/a/dead_tree_trunk_02 | CC0 1.0 | Jenelle van Heerden, Rico Cilliers |
| `assets/models/large_iron_gate/large_iron_gate_1k.gltf` | https://polyhaven.com/a/large_iron_gate | CC0 1.0 | Josh Dean |
| `assets/models/large_iron_gate/large_iron_gate.bin` | https://polyhaven.com/a/large_iron_gate | CC0 1.0 | Josh Dean |
| `assets/models/large_iron_gate/textures/large_iron_gate_arm_1k.jpg` | https://polyhaven.com/a/large_iron_gate | CC0 1.0 | Josh Dean |
| `assets/models/large_iron_gate/textures/large_iron_gate_diff_1k.jpg` | https://polyhaven.com/a/large_iron_gate | CC0 1.0 | Josh Dean |
| `assets/models/large_iron_gate/textures/large_iron_gate_nor_gl_1k.jpg` | https://polyhaven.com/a/large_iron_gate | CC0 1.0 | Josh Dean |
| `assets/models/namaqualand_boulder_02/namaqualand_boulder_02_1k.gltf` | https://polyhaven.com/a/namaqualand_boulder_02 | CC0 1.0 | Greg Zaal, Rico Cilliers |
| `assets/models/namaqualand_boulder_02/namaqualand_boulder_02.bin` | https://polyhaven.com/a/namaqualand_boulder_02 | CC0 1.0 | Greg Zaal, Rico Cilliers |
| `assets/models/namaqualand_boulder_02/textures/namaqualand_boulder_02_arm_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_02 | CC0 1.0 | Greg Zaal, Rico Cilliers |
| `assets/models/namaqualand_boulder_02/textures/namaqualand_boulder_02_diff_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_02 | CC0 1.0 | Greg Zaal, Rico Cilliers |
| `assets/models/namaqualand_boulder_02/textures/namaqualand_boulder_02_nor_gl_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_02 | CC0 1.0 | Greg Zaal, Rico Cilliers |
| `assets/models/namaqualand_boulder_03/namaqualand_boulder_03_1k.gltf` | https://polyhaven.com/a/namaqualand_boulder_03 | CC0 1.0 | Jenelle van Heerden, Dario Barresi |
| `assets/models/namaqualand_boulder_03/namaqualand_boulder_03.bin` | https://polyhaven.com/a/namaqualand_boulder_03 | CC0 1.0 | Jenelle van Heerden, Dario Barresi |
| `assets/models/namaqualand_boulder_03/textures/namaqualand_boulder_03_arm_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_03 | CC0 1.0 | Jenelle van Heerden, Dario Barresi |
| `assets/models/namaqualand_boulder_03/textures/namaqualand_boulder_03_diff_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_03 | CC0 1.0 | Jenelle van Heerden, Dario Barresi |
| `assets/models/namaqualand_boulder_03/textures/namaqualand_boulder_03_nor_gl_1k.jpg` | https://polyhaven.com/a/namaqualand_boulder_03 | CC0 1.0 | Jenelle van Heerden, Dario Barresi |
| `assets/models/stone_fire_pit/stone_fire_pit_1k.gltf` | https://polyhaven.com/a/stone_fire_pit | CC0 1.0 | Sebastian Platen |
| `assets/models/stone_fire_pit/stone_fire_pit.bin` | https://polyhaven.com/a/stone_fire_pit | CC0 1.0 | Sebastian Platen |
| `assets/models/stone_fire_pit/textures/stone_fire_pit_arm_1k.jpg` | https://polyhaven.com/a/stone_fire_pit | CC0 1.0 | Sebastian Platen |
| `assets/models/stone_fire_pit/textures/stone_fire_pit_diff_1k.jpg` | https://polyhaven.com/a/stone_fire_pit | CC0 1.0 | Sebastian Platen |
| `assets/models/stone_fire_pit/textures/stone_fire_pit_nor_gl_1k.jpg` | https://polyhaven.com/a/stone_fire_pit | CC0 1.0 | Sebastian Platen |
| `assets/models/street_lamp_01/street_lamp_01_1k.gltf` | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Josh Dean |
| `assets/models/street_lamp_01/street_lamp_01.bin` | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Josh Dean |
| `assets/models/street_lamp_01/textures/street_lamp_01_arm_1k.jpg` | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Josh Dean |
| `assets/models/street_lamp_01/textures/street_lamp_01_diff_1k.jpg` | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Josh Dean |
| `assets/models/street_lamp_01/textures/street_lamp_01_nor_gl_1k.jpg` | https://polyhaven.com/a/street_lamp_01 | CC0 1.0 | Josh Dean |
| `assets/models/tree_stump_01/textures/tree_stump_01_arm_1k.jpg` | https://polyhaven.com/a/tree_stump_01 | CC0 1.0 | Rob Tuytel |
| `assets/models/tree_stump_01/textures/tree_stump_01_diff_1k.jpg` | https://polyhaven.com/a/tree_stump_01 | CC0 1.0 | Rob Tuytel |
| `assets/models/tree_stump_01/textures/tree_stump_01_nor_gl_1k.jpg` | https://polyhaven.com/a/tree_stump_01 | CC0 1.0 | Rob Tuytel |
| `assets/models/tree_stump_01/tree_stump_01_1k.gltf` | https://polyhaven.com/a/tree_stump_01 | CC0 1.0 | Rob Tuytel |
| `assets/models/tree_stump_01/tree_stump_01.bin` | https://polyhaven.com/a/tree_stump_01 | CC0 1.0 | Rob Tuytel |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_bottom_arm_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_bottom_diff_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_bottom_nor_gl_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_top_arm_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_top_diff_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/textures/wooden_picnic_table_top_nor_gl_1k.jpg` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/wooden_picnic_table_1k.gltf` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |
| `assets/models/wooden_picnic_table/wooden_picnic_table.bin` | https://polyhaven.com/a/wooden_picnic_table | CC0 1.0 | Ulan Cabanilla |

## character

| File | Source URL | License | Author |
|---|---|---|---|
| `assets/characters/Michelle.glb` | https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/Michelle.glb | three.js repository (MIT); character by Adobe Mixamo | Adobe Mixamo, via the three.js examples |
| `assets/characters/Soldier.glb` | https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/Soldier.glb | three.js repository (MIT); character by Adobe Mixamo | Adobe Mixamo, via the three.js examples |
| `assets/characters/Xbot.glb` | https://github.com/mrdoob/three.js/blob/r160/examples/models/gltf/Xbot.glb | three.js repository (MIT); character by Adobe Mixamo | Adobe Mixamo, via the three.js examples |

## Licence notes

- **CC0 1.0** (Poly Haven): public domain dedication — no attribution legally required.
  Credited here anyway, because the people who scanned these deserve it.
- **CC BY 4.0** (three.js example model): attribution required, given in the table above.

## Failed downloads

None — every requested asset downloaded and verified.
