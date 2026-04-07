import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface LegalPageProps {
  title: string;
  markdownPath: string;
}

/**
 * Renders a legal document (Terms of Service or Privacy Policy) from a markdown file.
 * Converts markdown to styled HTML without requiring a markdown library — the legal
 * documents use a predictable subset of markdown (headings, paragraphs, lists, tables,
 * bold, links) that can be handled with straightforward regex transforms.
 */
const LegalPage: React.FC<LegalPageProps> = ({ title, markdownPath }) => {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(markdownPath)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load ${title}`);
        return res.text();
      })
      .then(md => {
        setHtml(markdownToHtml(md));
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [markdownPath, title]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            &larr; Back to myK9Show
          </Link>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
            <p className="text-destructive">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <article className="legal-content" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Minimal markdown-to-HTML converter for legal documents
// Handles: headings, paragraphs, bold, italic, links, lists, tables, hrs, blockquotes
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  // Remove the YAML frontmatter if present
  md = md.replace(/^---[\s\S]*?---\n*/m, '');

  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      const id = headingMatch[2]
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      out.push(`<h${level} id="${id}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(parseTable(tableLines));
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        let item = lines[i].replace(/^\s*[-*]\s+/, '');
        i++;
        // Continuation lines (indented but not a new list item)
        while (i < lines.length && /^\s{2,}/.test(lines[i]) && !/^\s*[-*]\s/.test(lines[i])) {
          item += ' ' + lines[i].trim();
          i++;
        }
        listItems.push(`<li>${inlineFormat(item)}</li>`);
      }
      out.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        listItems.push(`<li>${inlineFormat(item)}</li>`);
        i++;
      }
      out.push(`<ol>${listItems.join('')}</ol>`);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote>${bqLines.map(l => `<p>${inlineFormat(l)}</p>`).join('')}</blockquote>`
      );
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i].trim()) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith('>')
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${inlineFormat(paraLines.join(' '))}</p>`);
    }
  }

  return out.join('\n');
}

function inlineFormat(text: string): string {
  // Bold + italic
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return text;
}

function parseTable(lines: string[]): string {
  const parseRow = (line: string) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());

  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  const thead = `<thead><tr>${headers.map(h => `<th>${inlineFormat(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inlineFormat(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`;

  return `<div class="overflow-x-auto"><table>${thead}${tbody}</table></div>`;
}

export default LegalPage;
