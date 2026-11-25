"use client";

import type { NoteOrigin } from "@margem/shared";
import { Button, Field, Popover, PopoverAnchor, PopoverContent } from "@margem/ui";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import * as React from "react";
import { messages } from "../../messages/pt-br";
import { BlockId } from "./block-id";
import { BlockOrigin } from "./block-origin";
import { Callout } from "./callout-node";
import { Cloze } from "./cloze-mark";
import { QuestionAnchorDraft, SelectionToolbar } from "./selection-toolbar";
import { SlashMenu } from "./slash-menu";

const lowlight = createLowlight(common);

interface SlashState {
  open: boolean;
  query: string;
  range: { from: number; to: number } | null;
  position: { top: number; left: number };
}

interface ImagePromptState {
  open: boolean;
  url: string;
  error?: string;
  position: { top: number; left: number };
}

interface NoteEditorProps {
  initialDoc: Record<string, unknown>;
  placeholder: string;
  onChangeDoc: (doc: Record<string, unknown>) => void;
  onCreateQuestion: (draft: QuestionAnchorDraft) => void;
  mode?: "write" | "study";
  currentOrigin?: NoteOrigin;
  showOriginBars?: boolean;
  onClozeStatsChange?: (stats: { revealed: number; total: number }) => void;
}

export function NoteEditor({
  initialDoc,
  placeholder,
  mode = "write",
  currentOrigin = "memory",
  showOriginBars = false,
  onChangeDoc,
  onCreateQuestion,
  onClozeStatsChange,
}: NoteEditorProps) {
  const originRef = React.useRef<NoteOrigin>(currentOrigin);
  originRef.current = currentOrigin;
  const onChangeDocRef = React.useRef(onChangeDoc);
  onChangeDocRef.current = onChangeDoc;
  const [slash, setSlash] = React.useState<SlashState>({
    open: false,
    query: "",
    range: null,
    position: { top: 0, left: 0 },
  });
  const [imagePrompt, setImagePrompt] = React.useState<ImagePromptState>({
    open: false,
    url: "",
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
      BlockOrigin.configure({ originRef }),
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
      onChangeDocRef.current(current.getJSON() as Record<string, unknown>);

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

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const onClozeStatsRef = React.useRef(onClozeStatsChange);
  onClozeStatsRef.current = onClozeStatsChange;

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(mode === "write");

    const all = containerRef.current?.querySelectorAll('mark[data-cloze="true"]') ?? [];
    all.forEach((el) => el.removeAttribute("data-revealed"));
    if (mode === "study") {
      onClozeStatsRef.current?.({ revealed: 0, total: all.length });
    }
  }, [editor, mode]);

  function handleRequestImage() {
    if (!editor) return;
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    setImagePrompt({
      open: true,
      url: "",
      error: undefined,
      position: { top: coords.bottom + 6, left: coords.left },
    });
  }

  function handleInsertImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;

    try {
      const parsed = new URL(imagePrompt.url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setImagePrompt((prev) => ({ ...prev, error: messages.editor.imageUrlInvalid }));
        return;
      }
      editor.chain().focus().setImage({ src: parsed.toString() }).run();
      setImagePrompt((prev) => ({ ...prev, open: false, url: "", error: undefined }));
    } catch {
      setImagePrompt((prev) => ({ ...prev, error: messages.editor.imageUrlInvalid }));
    }
  }

  if (!editor) return null;

  return (
    <div
      ref={containerRef}
      data-study-mode={mode === "study" ? "true" : "false"}
      onClick={(event) => {
        if (mode !== "study") return;
        const target = (event.target as HTMLElement).closest('mark[data-cloze="true"]');
        if (!target || target.getAttribute("data-revealed") === "true") return;

        target.setAttribute("data-revealed", "true");
        const all = containerRef.current?.querySelectorAll('mark[data-cloze="true"]') ?? [];
        const revealed =
          containerRef.current?.querySelectorAll('mark[data-cloze="true"][data-revealed="true"]') ??
          [];
        onClozeStatsRef.current?.({ revealed: revealed.length, total: all.length });
      }}
      className={showOriginBars ? "margem-origin-bars relative" : "relative"}
    >
      {mode === "write" ? (
        <SelectionToolbar editor={editor} onCreateQuestion={onCreateQuestion} />
      ) : null}
      <EditorContent editor={editor} />
      {mode === "write" ? (
        <SlashMenu
          editor={editor}
          open={slash.open}
          query={slash.query}
          position={slash.position}
          onClose={() => setSlash((prev) => ({ ...prev, open: false }))}
          onRequestImage={handleRequestImage}
          onExecute={(run) => {
            if (slash.range) {
              editor.chain().focus().deleteRange(slash.range).run();
            }
            run(editor, { onRequestImage: handleRequestImage });
            setSlash((prev) => ({ ...prev, open: false, range: null }));
          }}
        />
      ) : null}

      <Popover
        open={imagePrompt.open}
        onOpenChange={(open) => setImagePrompt((prev) => ({ ...prev, open }))}
      >
        <PopoverAnchor asChild>
          <span
            aria-hidden="true"
            style={{ top: imagePrompt.position.top, left: imagePrompt.position.left }}
            className="pointer-events-none fixed h-px w-px"
          />
        </PopoverAnchor>
        <PopoverContent>
          <form onSubmit={handleInsertImage} className="flex flex-col gap-3" noValidate>
            <Field
              label={messages.editor.imageUrlLabel}
              placeholder={messages.editor.imageUrlPlaceholder}
              value={imagePrompt.url}
              onChange={(e) =>
                setImagePrompt((prev) => ({ ...prev, url: e.target.value, error: undefined }))
              }
              error={imagePrompt.error}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm">
                {messages.editor.insertImage}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setImagePrompt((prev) => ({ ...prev, open: false }))}
              >
                {messages.editor.cancel}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
