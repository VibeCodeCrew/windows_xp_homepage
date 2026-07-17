# Third-party assets

## Icons

This extension uses scaled PNG icons derived from the **Windows XP High Resolution Icon Pack** by [marchmountain](https://github.com/marchmountain).

- Source repository: https://github.com/marchmountain/-Windows-XP-High-Resolution-Icon-Pack
- Original DeviantArt release: https://www.deviantart.com/marchmountain/art/Windows-XP-High-Resolution-Icon-Pack-916042853
- License: [CC0 1.0 Universal](https://github.com/marchmountain/-Windows-XP-High-Resolution-Icon-Pack/blob/main/LICENSE)

The Windows XP visual style and original icon designs are intellectual property of Microsoft Corporation. The icon pack above is a fan-made recreation/render released under CC0 by its author.

## DOOM (game engine & game data)

The built-in **DOOM** app (folder `doom/`) runs the original Doom through a WebAssembly module:

- Engine: `doom/assets/doom.wasm` — the [doom.wasm](https://github.com/jacobenget/doom.wasm) build (based on doomgeneric), licensed under [GPL-2.0](https://github.com/jacobenget/doom.wasm/blob/HEAD/LICENSE). Corresponding source code is available in the linked repository.
- Game data: the **DOOM1.WAD** shareware episode (© 1993 id Software, Inc.) embedded in the module. The shareware WAD may be redistributed unmodified. DOOM® is a registered trademark of ZeniMax Media Inc. in the US and/or other countries; this project is in no way affiliated with or approved by id Software or ZeniMax.
