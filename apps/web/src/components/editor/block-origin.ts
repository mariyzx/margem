import type { NoteOrigin } from "@margem/shared";
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

function assignMissingOrigins(
  doc: ProseMirrorNode,
  tr: Transaction,
  defaultOrigin: NoteOrigin,
): boolean {
  let modified = false;

  doc.descendants((node, pos) => {
    if (!BLOCK_TYPES.includes(node.type.name)) return;
    if (!node.attrs.origin) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        origin: defaultOrigin,
      });
      modified = true;
    }
  });

  return modified;
}

export interface BlockOriginOptions {
  originRef: { current: NoteOrigin };
}

export const BlockOrigin = Extension.create<BlockOriginOptions>({
  name: "blockOrigin",

  addOptions() {
    return {
      originRef: { current: "memory" },
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          origin: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-origin"),
            renderHTML: (attributes) =>
              attributes.origin ? { "data-origin": String(attributes.origin) } : {},
          },
        },
      },
    ];
  },

  onCreate() {
    const tr = this.editor.state.tr;
    if (assignMissingOrigins(this.editor.state.doc, tr, "memory")) {
      this.editor.view.dispatch(tr.setMeta("addToHistory", false));
    }
  },

  addProseMirrorPlugins() {
    const originRef = this.options.originRef;
    return [
      new Plugin({
        key: new PluginKey("blockOrigin"),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null;

          const tr = newState.tr;
          return assignMissingOrigins(newState.doc, tr, originRef.current) ? tr : null;
        },
      }),
    ];
  },
});
