/**
 * @oneact/exporter-deck — 一幕 OneAct .act 打包与自包含单 HTML 导出
 *
 * import 本包即把 .act 导出器注册到 core 的导出器注册表（五类注册点之一）。
 */
import { registerExporter } from "@oneact/core";
import { packActpack } from "./pack.js";

export * from "./pack.js";
export * from "./standalone.js";

registerExporter({
  name: "act",
  label: ".act（JSON + assets 目录）",
  ext: ".act",
  mime: "application/json",
  export: (deck) => ({
    data: JSON.stringify(deck, null, 2),
    filename: (deck.meta.title || "deck") + ".act",
    mime: "application/json",
  }),
});

registerExporter({
  name: "actpack",
  label: ".actpack（zip：content.json + assets/）",
  ext: ".actpack",
  mime: "application/zip",
  export: (deck) => ({
    data: new Blob([packActpack(deck) as unknown as BlobPart]),
    filename: (deck.meta.title || "deck") + ".actpack",
    mime: "application/zip",
  }),
});
