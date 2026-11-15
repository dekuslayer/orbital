# Earth and Moon imagery (assets/earth/)

| File | Used for |
|---|---|
| `earth_color_2048.jpg` | Original source surface texture |
| `earth_color_2048_vivid.jpg` | Brightened, colour-enhanced surface texture used in the flight view |
| `earth_clouds_1024.png` | Translucent cloud layer rendered above Earth in the flight view |
| `moon_1024.jpg` | Moon surface in the flight view |
| `earth_landmask_1024.png` | Land/sea mask of the Jukebox hologram. Derived by thresholding the specular map that ships with the three.js examples (r160) |

## Provenance and licence: NOT VERIFIED

These images were copied from the three.js r160 repository (`examples/textures/planets/`, MIT-licensed repository).
That repository does not document who produced them or under which licence they were released. They resemble NASA Blue Marble-style imagery,
**but this has not been verified**, so no NASA credit is claimed here.

Before publishing or submitting, replace them with imagery whose licence you have checked, for example
NASA Visible Earth "Blue Marble" (https://visibleearth.nasa.gov/), which NASA generally releases for reuse with credit.
Keep the same file names and pixel ratios (2:1 equirectangular, longitude -180 at the left edge) and nothing else needs to change.
`src/landmask.js` (a coarse 2-degree land grid generated from the mask) is used for data validation and as the offline fallback; regenerate it from the new mask if you replace it.
