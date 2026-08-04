/**
 * @oneact/cli — pptx 导入（策划书 v3：.pptx → deck，80% 还原）
 *
 * 解压 .pptx，按 slide 顺序提取：文本（<a:t>）+ 图片（<p:pic>/<a:blip r:embed> 经 rels → media → base64）。
 * 文本 → heading/paragraph；图片 → image(base64)。位置映射为后续增强。
 */
import type { AnyElement, Deck, Page } from "@oneact/schema";
import { unzipSync } from "fflate";

function decode(u8: Uint8Array): string {
  return new TextDecoder().decode(u8);
}

export function importPptx(pptxData: Uint8Array): Deck {
  const files = unzipSync(pptxData);
  const slideKeys = Object.keys(files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => parseInt(/slide(\d+)/i.exec(a)![1]) - parseInt(/slide(\d+)/i.exec(b)![1]));

  const pages: Page[] = slideKeys.map((key, i) => {
    const xml = decode(files[key]);
    // 该 slide 的 rels：rId → media 相对路径（仅图片类型）
    const relsKey = key.replace("slides/", "slides/_rels/") + ".rels";
    const relsXml = files[relsKey] ? decode(files[relsKey]) : "";
    const relMap: Record<string, string> = {};
    for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Type="[^"]*\/image"[^>]*Target="([^"]+)"/g)) {
      relMap[m[1]] = m[2];
    }

    const elements: AnyElement[] = [];
    let y = 64;
    let idx = 0;
    // 按出现顺序匹配 文本(<a:t>) 或 图片(blip embed)
    const re = /<a:t>([^<]*)<\/a:t>|<a:blip\s+[^>]*r:embed="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      if (m[1] !== undefined && m[1].trim()) {
        const isTitle = elements.length === 0;
        elements.push({
          id: `p${i + 1}-e${idx++}`,
          type: isTitle ? "heading" : "paragraph",
          rect: [64, y, 1152, isTitle ? 60 : 80],
          props: isTitle ? { text: m[1], tone: "primary" } : { text: m[1] },
        } as unknown as AnyElement);
        y += isTitle ? 90 : 100;
      } else if (m[2]) {
        const target = relMap[m[2]];
        if (!target) continue;
        const mediaKey = "ppt/media/" + target.replace(/^\.\.\/media\//, "").replace(/^\.\.\\\media\\/, "");
        const media = files[mediaKey];
        if (!media) continue;
        const ext = (target.split(".").pop() || "png").toLowerCase();
        const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
        const b64 = Buffer.from(media).toString("base64");
        elements.push({
          id: `p${i + 1}-e${idx++}`,
          type: "image",
          rect: [200, y, 880, 360],
          props: { src: `data:${mime};base64,${b64}`, alt: "导入图片" },
        } as unknown as AnyElement);
        y += 380;
      }
    }
    return { id: `p${i + 1}`, layout: "two-column", elements };
  });

  return { formatVersion: 1, meta: { theme: "yuanshan-blue", title: "PPTX 导入" }, pages };
}
