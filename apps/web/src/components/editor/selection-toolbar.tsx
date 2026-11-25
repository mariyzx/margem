"use client";

import { cn } from "@margem/config/cn";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Highlighter, Italic, MessageSquarePlus } from "lucide-react";
import { messages } from "../../messages/pt-br";

interface SelectionToolbarProps {
  editor: Editor;
  onCreateQuestion: (draft: QuestionAnchorDraft) => void;
}

export interface QuestionAnchorDraft {
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
}

export function SelectionToolbar({ editor, onCreateQuestion }: SelectionToolbarProps) {
  const isCloze = editor.isActive("cloze");
  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const isCode = editor.isActive("code");

  function handleQuestionClick() {
    const { from, to, $from } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    if (!quote) return;

    const blockId =
      typeof $from.parent.attrs.blockId === "string" ? $from.parent.attrs.blockId : "";
    if (!blockId) return;

    const blockStart = $from.start();
    const blockEnd = $from.end();
    const prefix = editor.state.doc
      .textBetween(Math.max(blockStart, from - 40), from, " ")
      .slice(-40);
    const suffix = editor.state.doc.textBetween(to, Math.min(blockEnd, to + 40), " ").slice(0, 40);

    onCreateQuestion({ blockId, quote, prefix, suffix });
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
        aria-label={messages.editor.toolbarLabel}
        className="flex items-center gap-1 rounded-md border border-margin-rule bg-paper p-1 font-sans text-xs shadow-md"
      >
        <button
          type="button"
          aria-label={messages.editor.bold}
          aria-pressed={isBold}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn(
            "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isBold
              ? "bg-margin font-medium text-ink"
              : "text-ink-muted hover:bg-margin hover:text-ink",
          )}
        >
          <Bold className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>

        <button
          type="button"
          aria-label={messages.editor.italic}
          aria-pressed={isItalic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn(
            "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isItalic
              ? "bg-margin font-medium text-ink"
              : "text-ink-muted hover:bg-margin hover:text-ink",
          )}
        >
          <Italic className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>

        <button
          type="button"
          aria-label={messages.editor.inlineCode}
          aria-pressed={isCode}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={cn(
            "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isCode
              ? "bg-margin font-medium text-ink"
              : "text-ink-muted hover:bg-margin hover:text-ink",
          )}
        >
          <Code className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>

        <span aria-hidden="true" className="h-4 w-px bg-margin-rule" />

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCloze().run()}
          className={cn(
            "flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isCloze ? "bg-marker-soft font-medium text-ink" : "text-ink hover:bg-margin",
          )}
        >
          <Highlighter className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{isCloze ? messages.editor.removeCloze : messages.editor.hideAsCloze}</span>
        </button>

        <span aria-hidden="true" className="h-4 w-px bg-margin-rule" />

        <button
          type="button"
          onClick={handleQuestionClick}
          className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-bic transition-colors duration-fast ease-margem-out hover:bg-margin focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>{messages.editor.turnIntoQuestion}</span>
        </button>
      </div>
    </BubbleMenu>
  );
}
