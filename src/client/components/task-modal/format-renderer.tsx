// [spec: UI-015]
import { Fragment, h, type ComponentChildren } from "preact";

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineToken[] }
  | { type: "italic"; children: InlineToken[] }
  | { type: "underline"; children: InlineToken[] };

export type NotesBlock =
  | { type: "paragraph"; lines: InlineToken[][] }
  | { type: "ul"; items: InlineToken[][] }
  | { type: "ol"; items: InlineToken[][] };

const MAX_INLINE_DEPTH = 4;

function pushTextToken(tokens: InlineToken[], text: string): void {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === "text") {
    last.text += text;
  } else {
    tokens.push({ type: "text", text });
  }
}

export function parseInlineTokens(
  input: string,
  depth: number = 0,
): InlineToken[] {
  if (!input) return [];
  if (depth >= MAX_INLINE_DEPTH) return [{ type: "text", text: input }];

  const tokens: InlineToken[] = [];
  let i = 0;

  while (i < input.length) {
    if (input.startsWith("***", i)) {
      const closeIdx = input.indexOf("***", i + 3);
      if (closeIdx > i + 3) {
        const inner = input.slice(i + 3, closeIdx);
        tokens.push({
          type: "bold",
          children: [
            { type: "italic", children: parseInlineTokens(inner, depth + 1) },
          ],
        });
        i = closeIdx + 3;
        continue;
      }
    }

    if (input.startsWith("**", i)) {
      const closeIdx = input.indexOf("**", i + 2);
      if (closeIdx > i + 2) {
        const inner = input.slice(i + 2, closeIdx);
        tokens.push({
          type: "bold",
          children: parseInlineTokens(inner, depth + 1),
        });
        i = closeIdx + 2;
        continue;
      }
    }

    if (input[i] === "*" && !input.startsWith("**", i)) {
      let closeIdx = i + 1;
      while (closeIdx < input.length) {
        const idx = input.indexOf("*", closeIdx);
        if (idx === -1) {
          closeIdx = -1;
          break;
        }
        if (input.startsWith("**", idx)) {
          closeIdx = idx + 2;
          continue;
        }
        closeIdx = idx;
        break;
      }
      if (closeIdx > i + 1) {
        const inner = input.slice(i + 1, closeIdx);
        tokens.push({
          type: "italic",
          children: parseInlineTokens(inner, depth + 1),
        });
        i = closeIdx + 1;
        continue;
      }
    }

    const lowerSlice = input.slice(i, i + 3).toLowerCase();
    if (lowerSlice === "<u>") {
      const restLower = input.slice(i + 3).toLowerCase();
      const relClose = restLower.indexOf("</u>");
      if (relClose > 0) {
        const closeIdx = i + 3 + relClose;
        const inner = input.slice(i + 3, closeIdx);
        tokens.push({
          type: "underline",
          children: parseInlineTokens(inner, depth + 1),
        });
        i = closeIdx + 4;
        continue;
      }
    }

    pushTextToken(tokens, input[i]);
    i += 1;
  }

  return tokens;
}

export function parseFormattedNotes(markdown: string): NotesBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: NotesBlock[] = [];

  for (const line of lines) {
    const bulletMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      const itemTokens = parseInlineTokens(bulletMatch[1]);
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ul") {
        last.items.push(itemTokens);
      } else {
        blocks.push({ type: "ul", items: [itemTokens] });
      }
      continue;
    }

    const numberMatch = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numberMatch) {
      const itemTokens = parseInlineTokens(numberMatch[1]);
      const last = blocks[blocks.length - 1];
      if (last && last.type === "ol") {
        last.items.push(itemTokens);
      } else {
        blocks.push({ type: "ol", items: [itemTokens] });
      }
      continue;
    }

    if (line.trim() === "") {
      blocks.push({ type: "paragraph", lines: [] });
      continue;
    }

    const parsedLine = parseInlineTokens(line);
    const last = blocks[blocks.length - 1];
    if (last && last.type === "paragraph" && last.lines.length > 0) {
      last.lines.push(parsedLine);
    } else {
      blocks.push({ type: "paragraph", lines: [parsedLine] });
    }
  }

  return blocks.filter(
    (block, idx) =>
      block.type !== "paragraph" ||
      block.lines.length > 0 ||
      (idx > 0 && idx < blocks.length - 1),
  );
}

function renderInlineNodes(tokens: InlineToken[]): ComponentChildren {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case "text":
        return <Fragment key={idx}>{token.text}</Fragment>;
      case "bold":
        return (
          <strong key={idx} className="font-bold text-white">
            {renderInlineNodes(token.children)}
          </strong>
        );
      case "italic":
        return (
          <em key={idx} className="italic text-gray-100">
            {renderInlineNodes(token.children)}
          </em>
        );
      case "underline":
        return (
          <u key={idx} className="underline decoration-emerald-400/70 underline-offset-2">
            {renderInlineNodes(token.children)}
          </u>
        );
    }
  });
}

export function renderFormattedNotes(markdown: string): ComponentChildren {
  const blocks = parseFormattedNotes(markdown);
  return blocks.map((block, blockIdx) => {
    if (block.type === "ul") {
      return (
        <ul key={blockIdx} className="list-disc pl-5 space-y-0.5 my-1 text-gray-100">
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineNodes(item)}</li>
          ))}
        </ul>
      );
    }

    if (block.type === "ol") {
      return (
        <ol key={blockIdx} className="list-decimal pl-5 space-y-0.5 my-1 text-gray-100">
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineNodes(item)}</li>
          ))}
        </ol>
      );
    }

    if (block.lines.length === 0) {
      return <div key={blockIdx} className="h-2" />;
    }

    return (
      <p key={blockIdx} className="leading-relaxed text-gray-100">
        {block.lines.map((lineTokens, lineIdx) => (
          <Fragment key={lineIdx}>
            {lineIdx > 0 && <br />}
            {renderInlineNodes(lineTokens)}
          </Fragment>
        ))}
      </p>
    );
  });
}
