"use client";

import { cn } from "@margem/config/cn";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Highlighter, MessageSquarePlus } from "lucide-react";

interface SelectionToolbarProps {
  editor: Editor;
  onCreateQuestion: (quote: string, blockId: string | null) => void;
}

export function SelectionToolbar({ editor, onCreateQuestion }: SelectionToolbarProps) {
  const isCloze = editor.isActive("cloze");

  function handleQuestionClick() {
    const { from, to, $from } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    if (!quote) return;

    const blockId =
      typeof $from.parent.attrs.blockId === "string" ? $from.parent.attrs.blockId : null;
    onCreateQuestion(quote, blockId);
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: current, state }) => {
        if (state.selection.empty) return false;
        if (current.isActive("codeBlock")) return false;
        return (
          state.doc.textBetween(state.selection.from, state.selection.to, " ").trim().length > 0
        );
      }}
    >
      <div
        role="toolbar"
        aria-label="Ações para o trecho selecionado"
        className="flex items-center gap-1 rounded-md border border-margin-rule bg-paper p-1 font-sans text-xs shadow-md"
      >
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCloze().run()}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isCloze ? "bg-marker-soft font-medium text-ink" : "text-ink hover:bg-margin",
          )}
        >
          <Highlighter className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{isCloze ? "Tirar lacuna" : "Esconder como lacuna"}</span>
        </button>

        <span aria-hidden="true" className="h-4 w-px bg-margin-rule" />

        <button
          type="button"
          onClick={handleQuestionClick}
          className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-bic transition-colors duration-fast ease-margem-out hover:bg-margin focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Virar pergunta</span>
        </button>
      </div>
    </BubbleMenu>
  );
}
