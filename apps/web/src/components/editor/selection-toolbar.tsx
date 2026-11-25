"use client";

import "@tiptap/extension-color";
import "@tiptap/extension-link";
import "@tiptap/extension-text-style";
import "@tiptap/extension-underline";
import { cn } from "@margem/config/cn";
import { Button, Field, Popover, PopoverContent, PopoverTrigger } from "@margem/ui";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  MessageSquarePlus,
  Palette,
  Strikethrough,
  Underline,
} from "lucide-react";
import * as React from "react";
import { messages } from "../../messages/pt-br";

export interface QuestionAnchorDraft {
  blockId: string;
  quote: string;
  prefix: string;
  suffix: string;
}

interface SelectionToolbarProps {
  editor: Editor;
  onCreateQuestion: (draft: QuestionAnchorDraft) => void;
}

const TEXT_COLORS = [
  { id: "default", value: null, dotClass: "bg-ink", label: "Padrão" },
  { id: "bic", value: "var(--color-bic)", dotClass: "bg-bic", label: "Azul" },
  { id: "correct", value: "var(--color-correct)", dotClass: "bg-correct", label: "Verde" },
  { id: "turma", value: "var(--color-turma)", dotClass: "bg-turma", label: "Roxo" },
  { id: "muted", value: "var(--color-ink-muted)", dotClass: "bg-ink-muted", label: "Grafite" },
  { id: "danger", value: "var(--color-danger)", dotClass: "bg-danger", label: "Destaque" },
] as const;

export function SelectionToolbar({ editor, onCreateQuestion }: SelectionToolbarProps) {
  const isCloze = editor.isActive("cloze");
  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const isUnderline = editor.isActive("underline");
  const isStrike = editor.isActive("strike");
  const isCode = editor.isActive("code");
  const isLink = editor.isActive("link");
  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? null;

  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkUrl, setLinkUrl] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | undefined>();

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

  function handleOpenLinkPopover(nextOpen: boolean) {
    setLinkOpen(nextOpen);
    if (nextOpen) {
      const existing = editor.getAttributes("link").href;
      setLinkUrl(typeof existing === "string" ? existing : "");
      setLinkError(undefined);
    }
  }

  function handleApplyLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }

    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setLinkError(messages.editor.linkUrlInvalid);
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: parsed.toString() }).run();
      setLinkOpen(false);
    } catch {
      setLinkError(messages.editor.linkUrlInvalid);
    }
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
        className="flex flex-wrap items-center gap-0.5 rounded-md border border-margin-rule bg-paper p-1 font-sans text-xs shadow-md"
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
          aria-label={messages.editor.underline}
          aria-pressed={isUnderline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn(
            "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isUnderline
              ? "bg-margin font-medium text-ink"
              : "text-ink-muted hover:bg-margin hover:text-ink",
          )}
        >
          <Underline className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>

        <button
          type="button"
          aria-label={messages.editor.strike}
          aria-pressed={isStrike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={cn(
            "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
            isStrike
              ? "bg-margin font-medium text-ink"
              : "text-ink-muted hover:bg-margin hover:text-ink",
          )}
        >
          <Strikethrough className="h-3.5 w-3.5" strokeWidth={1.5} />
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

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={messages.editor.textColor}
              className={cn(
                "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
                currentColor
                  ? "bg-margin font-medium text-ink"
                  : "text-ink-muted hover:bg-margin hover:text-ink",
              )}
            >
              <Palette className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div
              role="group"
              aria-label={messages.editor.textColor}
              className="flex items-center gap-1.5"
            >
              {TEXT_COLORS.map((color) => {
                const active = currentColor === color.value;
                return (
                  <button
                    key={color.id}
                    type="button"
                    aria-label={color.label}
                    aria-pressed={active}
                    title={color.label}
                    onClick={() => {
                      if (color.value === null) {
                        editor.chain().focus().unsetColor().run();
                      } else {
                        editor.chain().focus().setColor(color.value).run();
                      }
                    }}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full border transition-transform duration-fast hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
                      active ? "border-bic ring-2 ring-bic/30" : "border-margin-rule",
                    )}
                  >
                    <span className={cn("h-3.5 w-3.5 rounded-full", color.dotClass)} />
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={linkOpen} onOpenChange={handleOpenLinkPopover}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={messages.editor.link}
              aria-pressed={isLink}
              className={cn(
                "rounded-sm p-1.5 transition-colors duration-fast ease-margem-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-bic",
                isLink
                  ? "bg-margin font-medium text-bic"
                  : "text-ink-muted hover:bg-margin hover:text-ink",
              )}
            >
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <form onSubmit={handleApplyLink} className="flex flex-col gap-3" noValidate>
              <Field
                label={messages.editor.linkUrlLabel}
                placeholder={messages.editor.linkUrlPlaceholder}
                value={linkUrl}
                onChange={(e) => {
                  setLinkUrl(e.target.value);
                  if (linkError) setLinkError(undefined);
                }}
                error={linkError}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm">
                  {messages.editor.applyLink}
                </Button>
                {isLink ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      editor.chain().focus().unsetLink().run();
                      setLinkOpen(false);
                    }}
                  >
                    {messages.editor.removeLink}
                  </Button>
                ) : null}
              </div>
            </form>
          </PopoverContent>
        </Popover>

        <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-margin-rule" />

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
