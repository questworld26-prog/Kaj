// [verifies: UI-015]
import { describe, expect, it } from "vitest";
import { parseFormattedNotes } from "../../src/client/components/task-modal/format-renderer.js";

describe("UI-015: Safe Task Details Formatting Parser", () => {
  // [verifies: UI-015/AC-UI-015.3]
  it("neutralizes untrusted HTML tags into literal text while preserving safe formatting tokens", () => {
    const raw = [
      'Unsafe <script>alert("xss")</script> and <img src=x onerror=alert(1)> here',
      "Safe **bold** *italic* ***both*** and <u>underlined</u>",
      "- Bullet <a href=\"javascript:alert(1)\">link</a>",
      "1. Step <svg onload=alert(1)>",
    ].join("\n");

    const blocks = parseFormattedNotes(raw);
    const serialized = JSON.stringify(blocks);

    expect(blocks[0]).toEqual({
      type: "paragraph",
      lines: [
        [
          {
            type: "text",
            text: 'Unsafe <script>alert("xss")</script> and <img src=x onerror=alert(1)> here',
          },
        ],
        [
          { type: "text", text: "Safe " },
          { type: "bold", children: [{ type: "text", text: "bold" }] },
          { type: "text", text: " " },
          { type: "italic", children: [{ type: "text", text: "italic" }] },
          { type: "text", text: " " },
          {
            type: "bold",
            children: [{ type: "italic", children: [{ type: "text", text: "both" }] }],
          },
          { type: "text", text: " and " },
          { type: "underline", children: [{ type: "text", text: "underlined" }] },
        ],
      ],
    });

    expect(blocks[1]).toEqual({
      type: "ul",
      items: [
        [{ type: "text", text: 'Bullet <a href="javascript:alert(1)">link</a>' }],
      ],
    });

    expect(blocks[2]).toEqual({
      type: "ol",
      items: [
        [{ type: "text", text: "Step <svg onload=alert(1)>" }],
      ],
    });

    expect(serialized).not.toContain('"type":"script"');
    expect(serialized).not.toContain('"type":"img"');
    expect(serialized).not.toContain('"type":"a"');
    expect(serialized).not.toContain('"type":"svg"');
  });
});
