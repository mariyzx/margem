import { mergeAttributes, Node } from "@tiptap/core";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "inline*",

  parseHTML() {
    return [{ tag: 'div[data-callout="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "true",
        class: "my-3 rounded-md border-l-2 border-bic bg-margin px-4 py-2.5 text-ink",
      }),
      0,
    ];
  },
});
