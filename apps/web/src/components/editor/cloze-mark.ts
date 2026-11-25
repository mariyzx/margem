import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    cloze: {
      toggleCloze: () => ReturnType;
      unsetCloze: () => ReturnType;
    };
  }
}

export const Cloze = Mark.create({
  name: "cloze",

  parseHTML() {
    return [{ tag: 'mark[data-cloze="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, {
        "data-cloze": "true",
        class: "rounded-xs bg-marker-soft px-0.5 text-ink border-b border-marker",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleCloze:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
      unsetCloze:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
