"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import * as React from "react";
import { BlockId } from "./block-id";
import { Callout } from "./callout-node";
import { Cloze } from "./cloze-mark";
import { SelectionToolbar } from "./selection-toolbar";
import { SlashMenu } from "./slash-menu";

const lowlight = createLowlight(common);

interface SlashState {
  open: boolean;
  query: string;
  range: { from: number; to: number } | null;
  position: { top: number; left: number };
}

interface NoteEditorProps {
  initialDoc: Record<string, unknown>;
  placeholder: string;
  onChangeDoc: (doc: Record<string, unknown>) => void;
  onCreateQuestion: (quote: string, blockId: string | null) => void;
}

export function NoteEditor({
  initialDoc,
  placeholder,
  onChangeDoc,
  onCreateQuestion,
}: NoteEditorProps) {
  const [slash, setSlash] = React.useState<SlashState>({
    open: false,
    query: "",
    range: null,
    position: { top: 0, left: 0 },
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Placeholder.configure({ placeholder }),
      Image.configure({
        HTMLAttributes: {
          class: "my-4 max-h-96 rounded-md border border-margin-rule object-contain",
        },
      }),
      Callout,
      Cloze,
      BlockId,
    ],
    content: initialDoc as JSONContent,
    editorProps: {
      attributes: {
        class:
          "min-h-[320px] font-serif text-[18px] leading-[1.75] text-ink focus:outline-none " +
          "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:font-semibold " +
          "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-xl [&_h3]:font-semibold " +
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 " +
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 " +
          "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-margin-rule [&_pre]:bg-margin [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-sm " +
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-ink-muted/50 [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeDoc(current.getJSON() as Record<string, unknown>);

      const { $from, empty } = current.state.selection;
      if (!empty || current.isActive("codeBlock")) {
        setSlash((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }

      const textBefore = $from.parent.textContent.slice(0, $from.parentOffset);
      const match = textBefore.match(/(?:^|\s)\/([^\s]*)$/);
      if (!match) {
        setSlash((prev) => (prev.open ? { ...prev, open: false } : prev));
        return;
      }

      const query = match[1] ?? "";
      const slashLength = query.length + 1;
      const coords = current.view.coordsAtPos($from.pos);

      setSlash({
        open: true,
        query,
        range: { from: $from.pos - slashLength, to: $from.pos },
        position: { top: coords.bottom + 6, left: coords.left },
      });
    },
  });

  if (!editor) return null;

  return (
    <div className="relative">
      <SelectionToolbar editor={editor} onCreateQuestion={onCreateQuestion} />
      <EditorContent editor={editor} />
      <SlashMenu
        editor={editor}
        open={slash.open}
        query={slash.query}
        position={slash.position}
        onClose={() => setSlash((prev) => ({ ...prev, open: false }))}
        onExecute={(run) => {
          if (slash.range) {
            editor.chain().focus().deleteRange(slash.range).run();
          }
          run(editor);
          setSlash((prev) => ({ ...prev, open: false, range: null }));
        }}
      />
    </div>
  );
}
