import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface QuoteRange {
  from: number;
  to: number;
}

export function findQuoteRange(
  doc: ProseMirrorNode,
  blockId: string,
  quote: string,
): QuoteRange | null {
  const target = quote.trim();
  if (!target) return null;

  let range: QuoteRange | null = null;
  doc.forEach((block, offset) => {
    if (range || block.attrs.blockId !== blockId) return;

    let text = "";
    const positions: number[] = [];
    block.descendants((child, pos) => {
      if (!child.isText || !child.text) return;
      const start = offset + 1 + pos;
      for (let i = 0; i < child.text.length; i++) positions.push(start + i);
      text += child.text;
    });

    const index = text.indexOf(target);
    if (index < 0) return;
    range = { from: positions[index]!, to: positions[index + target.length - 1]! + 1 };
  });
  return range;
}
