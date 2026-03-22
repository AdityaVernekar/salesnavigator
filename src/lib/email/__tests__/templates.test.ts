import { describe, it, expect, vi } from "vitest";

// Mock supabase server to avoid env var requirement at import time
vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: {},
}));

import {
  renderTemplate,
  extractPlaceholders,
  assertTemplatePlaceholders,
  htmlToPlainText,
  renderTemplateBodies,
} from "../templates";

// ── renderTemplate ─────────────────────────────────────────────────

describe("renderTemplate", () => {
  it("replaces a single placeholder", () => {
    expect(
      renderTemplate("Hello {{first_name}}", { first_name: "Alice" }),
    ).toBe("Hello Alice");
  });

  it("replaces multiple different placeholders", () => {
    const result = renderTemplate(
      "Hi {{first_name}} from {{company_name}}",
      { first_name: "Bob", company_name: "Acme" },
    );
    expect(result).toBe("Hi Bob from Acme");
  });

  it("replaces repeated occurrences of the same placeholder", () => {
    const result = renderTemplate(
      "{{name}} and {{name}} again",
      { name: "Eve" },
    );
    expect(result).toBe("Eve and Eve again");
  });

  it("replaces missing variable with empty string", () => {
    expect(renderTemplate("Hello {{first_name}}", {})).toBe("Hello ");
  });

  it("replaces null variable with empty string", () => {
    expect(
      renderTemplate("Hello {{first_name}}", { first_name: null }),
    ).toBe("Hello ");
  });

  it("replaces undefined variable with empty string", () => {
    expect(
      renderTemplate("Hello {{first_name}}", { first_name: undefined }),
    ).toBe("Hello ");
  });

  it("handles spaced placeholders like {{ key }}", () => {
    expect(
      renderTemplate("Hello {{ first_name }}", { first_name: "Carol" }),
    ).toBe("Hello Carol");
  });

  it("returns source unchanged when no placeholders", () => {
    expect(renderTemplate("No placeholders here", {})).toBe(
      "No placeholders here",
    );
  });

  it("handles empty source", () => {
    expect(renderTemplate("", { first_name: "Test" })).toBe("");
  });
});

// ── extractPlaceholders ────────────────────────────────────────────

describe("extractPlaceholders", () => {
  it("extracts from both subject and body", () => {
    const result = extractPlaceholders(
      "Hi {{first_name}}",
      "<p>At {{company_name}}</p>",
    );
    expect(result).toEqual(["company_name", "first_name"]);
  });

  it("deduplicates across subject and body", () => {
    const result = extractPlaceholders(
      "{{name}}",
      "Dear {{name}}, from {{company_name}}",
    );
    expect(result).toEqual(["company_name", "name"]);
  });

  it("returns sorted array", () => {
    const result = extractPlaceholders(
      "{{z_var}} {{a_var}}",
      "{{m_var}}",
    );
    expect(result).toEqual(["a_var", "m_var", "z_var"]);
  });

  it("returns empty array when no placeholders", () => {
    expect(extractPlaceholders("Hello", "World")).toEqual([]);
  });

  it("handles spaced placeholders", () => {
    const result = extractPlaceholders("{{ first_name }}", "");
    expect(result).toEqual(["first_name"]);
  });
});

// ── assertTemplatePlaceholders ─────────────────────────────────────

describe("assertTemplatePlaceholders", () => {
  it("returns sorted placeholders for valid input", () => {
    const result = assertTemplatePlaceholders(
      "{{first_name}}",
      "{{company_name}}",
    );
    expect(result).toEqual(["company_name", "first_name"]);
  });

  it("returns empty array when no placeholders", () => {
    expect(assertTemplatePlaceholders("Hello", "World")).toEqual([]);
  });
});

// ── htmlToPlainText ────────────────────────────────────────────────

describe("htmlToPlainText", () => {
  it("strips basic HTML tags", () => {
    expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("converts <br> to newline", () => {
    expect(htmlToPlainText("Line 1<br>Line 2")).toBe("Line 1\nLine 2");
  });

  it("converts <br /> to newline", () => {
    expect(htmlToPlainText("Line 1<br />Line 2")).toBe("Line 1\nLine 2");
  });

  it("converts closing block tags to newlines", () => {
    expect(htmlToPlainText("<p>Para 1</p><p>Para 2</p>")).toBe(
      "Para 1\nPara 2",
    );
  });

  it("converts <li> to dash prefix", () => {
    expect(htmlToPlainText("<ul><li>Item 1</li><li>Item 2</li></ul>")).toBe(
      "- Item 1\n- Item 2",
    );
  });

  it("decodes &amp;", () => {
    expect(htmlToPlainText("A &amp; B")).toBe("A & B");
  });

  it("decodes &lt; and &gt;", () => {
    expect(htmlToPlainText("&lt;tag&gt;")).toBe("<tag>");
  });

  it("decodes &quot;", () => {
    expect(htmlToPlainText("&quot;quoted&quot;")).toBe('"quoted"');
  });

  it("decodes &#39;", () => {
    expect(htmlToPlainText("it&#39;s")).toBe("it's");
  });

  it("decodes &nbsp; to space", () => {
    expect(htmlToPlainText("hello&nbsp;world")).toBe("hello world");
  });

  it("collapses triple+ newlines to double", () => {
    expect(htmlToPlainText("A<p></p><p></p><p></p>B")).toBe("A\n\nB");
  });

  it("trims whitespace", () => {
    expect(htmlToPlainText("  <p>Hello</p>  ")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(htmlToPlainText("")).toBe("");
  });
});

// ── renderTemplateBodies ───────────────────────────────────────────

describe("renderTemplateBodies", () => {
  it("returns rendered bodyHtml and bodyText", () => {
    const { bodyHtml, bodyText } = renderTemplateBodies(
      "<p>Hi {{first_name}}</p>",
      { first_name: "Alice" },
    );
    expect(bodyHtml).toBe("<p>Hi Alice</p>");
    expect(bodyText).toBe("Hi Alice");
  });

  it("handles missing variables", () => {
    const { bodyHtml, bodyText } = renderTemplateBodies(
      "<p>Hi {{first_name}}</p>",
      {},
    );
    expect(bodyHtml).toBe("<p>Hi </p>");
    expect(bodyText).toBe("Hi");
  });

  it("handles empty template", () => {
    const { bodyHtml, bodyText } = renderTemplateBodies("", {});
    expect(bodyHtml).toBe("");
    expect(bodyText).toBe("");
  });
});
