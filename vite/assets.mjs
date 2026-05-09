export const assetsConfig = {
  source_path: "assets",                                     // directory containing YAML manifests and source PNGs
  destination_path: "public/packed_assets",                  // build output directory (gitignored; served at runtime)
  fonts: [{ source: "fonts.yaml" }],                        // bitmap-font manifests to pack
  atlases: [{ source: "ui.yaml", target: "mana_soul" }],    // sprite atlas manifests; target sets the output filename stem
};
