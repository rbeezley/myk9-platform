import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Save,
  Camera,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Extracted ToolbarButton component to module level
interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

const ToolbarButton = ({
  onClick,
  isActive = false,
  disabled = false,
  children,
}: ToolbarButtonProps) => (
  <Button
    type="button"
    variant={isActive ? 'default' : 'ghost'}
    size="sm"
    onMouseDown={e => e.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    className={cn('h-8 w-8 p-0', isActive && 'bg-primary text-primary-foreground')}
  >
    {children}
  </Button>
);

interface RichTextEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}

export function RichTextEditor({
  content = '',
  onChange,
  onSave,
  onImageUpload,
  placeholder = 'Start writing your training notes...',
  className,
  readOnly = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editable: !readOnly,
  });

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !onImageUpload || !editor) return;

      try {
        const imageUrl = await onImageUpload(file);
        // Note: setImage requires Image extension to be installed
        // editor.chain().focus().setImage({ src: imageUrl }).run();
        logger.debug('Image upload completed:', 'dogs', { data: imageUrl });
      } catch (error) {
        logger.error('Failed to upload image:', 'dogs', {}, error as Error);
      }
    },
    [editor, onImageUpload]
  );

  const handleSave = () => {
    if (editor && onSave) {
      onSave(editor.getHTML());
    }
  };

  if (!editor) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-muted rounded"></div>
            <div className="h-40 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="p-0">
        {!readOnly && (
          <div className="border-b p-3">
            <div className="flex items-center gap-1 flex-wrap">
              {/* Text Formatting */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBold().run()}
                isActive={editor.isActive('bold')}
              >
                <Bold className="h-4 w-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleItalic().run()}
                isActive={editor.isActive('italic')}
              >
                <Italic className="h-4 w-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleStrike().run()}
                isActive={editor.isActive('strike')}
              >
                <Strikethrough className="h-4 w-4" />
              </ToolbarButton>

              <Separator orientation="vertical" className="h-6 mx-2" />

              {/* Lists */}
              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                isActive={editor.isActive('bulletList')}
              >
                <List className="h-4 w-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                isActive={editor.isActive('orderedList')}
              >
                <ListOrdered className="h-4 w-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
                isActive={editor.isActive('blockquote')}
              >
                <Quote className="h-4 w-4" />
              </ToolbarButton>

              <Separator orientation="vertical" className="h-6 mx-2" />

              {/* Headings */}
              <select
                value={
                  editor.isActive('heading', { level: 1 })
                    ? '1'
                    : editor.isActive('heading', { level: 2 })
                      ? '2'
                      : editor.isActive('heading', { level: 3 })
                        ? '3'
                        : '0'
                }
                onChange={e => {
                  const level = parseInt(e.target.value);
                  if (level === 0) {
                    editor.chain().focus().setParagraph().run();
                  } else {
                    editor
                      .chain()
                      .focus()
                      .toggleHeading({ level: level as 1 | 2 | 3 })
                      .run();
                  }
                }}
                className="px-2 py-1 text-sm border rounded h-8"
              >
                <option value="0">Paragraph</option>
                <option value="1">Heading 1</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
              </select>

              <Separator orientation="vertical" className="h-6 mx-2" />

              {/* Media */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors">
                  <Camera className="h-4 w-4" />
                </div>
              </label>

              <Separator orientation="vertical" className="h-6 mx-2" />

              {/* Undo/Redo */}
              <ToolbarButton
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().chain().focus().undo().run()}
              >
                <Undo className="h-4 w-4" />
              </ToolbarButton>

              <ToolbarButton
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().chain().focus().redo().run()}
              >
                <Redo className="h-4 w-4" />
              </ToolbarButton>

              {/* Save Button */}
              {onSave && (
                <>
                  <Separator orientation="vertical" className="h-6 mx-2" />
                  <Button size="sm" onClick={handleSave} className="h-8">
                    <Save className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            'prose prose-sm max-w-none p-4 min-h-[200px] focus-within:outline-none',
            readOnly && 'prose-gray',
            'prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
            'prose-p:my-2 prose-li:my-1',
            'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground prose-blockquote:pl-4 prose-blockquote:italic',
            'dark:prose-invert',
            '[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6',
            '[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6',
            '[&_.ProseMirror_li]:my-0.5'
          )}
        >
          <EditorContent
            editor={editor}
            className="outline-none"
            style={{ whiteSpace: 'pre-wrap' }}
          />

          {editor.isEmpty && !readOnly && (
            <p className="text-muted-foreground absolute pointer-events-none">{placeholder}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
