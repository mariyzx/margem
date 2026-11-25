"use client";
import "@tiptap/extension-image";
import "@tiptap/starter-kit";

import { cn } from "@margem/config/cn";
import type { Editor } from "@tiptap/react";
import {
  Code2,
  Heading2,
  Heading3,
  HelpCircle,
  Image as ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
} from "lucide-react";
import * as React from "react";
import { messages } from "../../messages/pt-br";

interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  run: (editor: Editor, helpers: { onRequestImage: () => void }) => void;
}

const SLASH_ITEMS: SlashCommandItem[] = [
  {
    id: "h2",
    label: messages.editor.blocks.h2.label,
    description: messages.editor.blocks.h2.description,
    icon: Heading2,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: messages.editor.blocks.h3.label,
    description: messages.editor.blocks.h3.description,
    icon: Heading3,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: messages.editor.blocks.bullet.label,
    description: messages.editor.blocks.bullet.description,
    icon: List,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "ordered",
    label: messages.editor.blocks.ordered.label,
    description: messages.editor.blocks.ordered.description,
    icon: ListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "blockquote",
    label: messages.editor.blocks.blockquote.label,
    description: messages.editor.blocks.blockquote.description,
    icon: Quote,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: messages.editor.blocks.code.label,
    description: messages.editor.blocks.code.description,
    icon: Code2,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "callout",
    label: messages.editor.blocks.callout.label,
    description: messages.editor.blocks.callout.description,
    icon: HelpCircle,
    run: (editor) => editor.chain().focus().setNode("callout").run(),
  },
  {
    id: "divider",
    label: messages.editor.blocks.divider.label,
    description: messages.editor.blocks.divider.description,
    icon: Minus,
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "image",
    label: messages.editor.blocks.image.label,
    description: messages.editor.blocks.image.description,
    icon: ImageIcon,
    run: (_editor, { onRequestImage }) => {
      onRequestImage();
    },
  },
];

interface SlashMenuProps {
  editor: Editor;
  open: boolean;
  query: string;
  position: { top: number; left: number };
  onClose: () => void;
  onRequestImage: () => void;
  onExecute: (run: (editor: Editor, helpers: { onRequestImage: () => void }) => void) => void;
}

export function SlashMenu({ open, query, position, onClose, onExecute }: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
    );
  }, [query]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (filtered.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const chosen = filtered[selectedIndex];
        if (chosen) onExecute(chosen.run);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, filtered, selectedIndex, onClose, onExecute]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label={messages.editor.slashMenuLabel}
      style={{ top: position.top, left: position.left }}
      className="fixed z-40 w-64 rounded-md border border-margin-rule bg-paper p-1.5 font-sans shadow-md"
    >
      {filtered.map((item, index) => {
        const Icon = item.icon;
        const active = index === selectedIndex;
        return (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault();
              onExecute(item.run);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm transition-colors duration-fast ease-margem-out",
              active ? "bg-margin text-ink" : "text-ink-muted hover:bg-margin/60 hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-bic" strokeWidth={1.5} />
            <div className="flex flex-col">
              <span className="font-medium text-ink">{item.label}</span>
              <span className="text-xs text-ink-muted">{item.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
