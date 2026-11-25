import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";

const BLOCK_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "codeBlock",
  "callout",
  "image",
];

function assignMissingBlockIds(doc: ProseMirrorNode, tr: Transaction): boolean {
  let modified = false;

  doc.descendants((node, pos) => {
    if (!BLOCK_TYPES.includes(node.type.name)) return;
    if (!node.attrs.blockId) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        blockId: crypto.randomUUID(),
      });
      modified = true;
    }
  });

  return modified;
}

export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-block-id"),
            renderHTML: (attributes) =>
              attributes.blockId ? { "data-block-id": String(attributes.blockId) } : {},
          },
        },
      },
    ];
  },

  onCreate() {
    const tr = this.editor.state.tr;
    if (assignMissingBlockIds(this.editor.state.doc, tr)) {
      this.editor.view.dispatch(tr.setMeta("addToHistory", false).setMeta("margem:init", true));
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockId"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          return assignMissingBlockIds(newState.doc, tr) ? tr : null;
        },
      }),
    ];
  },
});
