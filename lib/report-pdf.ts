import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  formatReportStat,
  formatReportValue,
  type ReportBranding,
  type ReportColumn,
  type ReportData,
  type ReportSection,
} from "./reports";

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 36;
const FOOTER_SPACE = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TEXT = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.82, 0.84, 0.87);
const HEADER_FILL = rgb(0.12, 0.16, 0.22);
const ZEBRA = rgb(0.96, 0.97, 0.98);
const CARD_FILL = rgb(0.97, 0.98, 0.99);

const SMART_TEXT: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
  "\u00a0": " ",
  "\u2022": "-",
  "\u00d7": "x",
};

function pdfSafe(value: string) {
  const replaced = Array.from(value)
    .map((character) => SMART_TEXT[character] ?? character)
    .join("");
  return replaced.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = 3
) {
  const safe = pdfSafe(text).replace(/\s+/g, " ").trim();
  if (!safe) return [""];

  const words = safe.split(" ");
  const lines: string[] = [];
  let current = "";

  function pushWord(word: string) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) {
      lines.push(current);
      current = "";
    }
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
      return;
    }
    let remainder = word;
    while (remainder) {
      let cut = remainder.length;
      while (
        cut > 1 &&
        font.widthOfTextAtSize(remainder.slice(0, cut), size) > maxWidth
      ) {
        cut -= 1;
      }
      lines.push(remainder.slice(0, cut));
      remainder = remainder.slice(cut);
      if (lines.length >= maxLines) return;
    }
  }

  for (const word of words) {
    if (lines.length >= maxLines) break;
    pushWord(word);
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    const consumed = lines.join(" ").length;
    if (consumed < safe.length) {
      let last = lines[maxLines - 1];
      while (
        last.length > 1 &&
        font.widthOfTextAtSize(`${last}...`, size) > maxWidth
      ) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.trimEnd()}...`;
    }
  }

  return lines.length > 0 ? lines : [""];
}

function truncate(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const safe = pdfSafe(text).replace(/\s+/g, " ").trim();
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let cut = safe;
  while (
    cut.length > 1 &&
    font.widthOfTextAtSize(`${cut}...`, size) > maxWidth
  ) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}...`;
}

type TableLayout = {
  column: ReportColumn;
  width: number;
};

function layoutColumns(columns: ReportColumn[]): TableLayout[] {
  const totalWeight = columns.reduce((sum, column) => sum + (column.width ?? 1), 0);
  return columns.map((column) => ({
    column,
    width: ((column.width ?? 1) / totalWeight) * CONTENT_WIDTH,
  }));
}

function decodeDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value);
  if (!match) return null;
  return { type: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function renderReportPdf(
  data: ReportData,
  branding: ReportBranding
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`${branding.name} - ${data.title}`);
  document.setAuthor(branding.name);
  document.setSubject(data.description);
  document.setCreator(`${branding.name} Manager`);
  document.setProducer(`${branding.name} Manager`);
  document.setCreationDate(new Date(data.generatedAt));

  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);

  let logo: PDFImage | null = null;
  if (branding.logoDataUrl) {
    const decoded = decodeDataUrl(branding.logoDataUrl);
    try {
      if (decoded?.type === "image/png") {
        logo = await document.embedPng(decoded.bytes);
      } else if (decoded?.type === "image/jpeg") {
        logo = await document.embedJpg(decoded.bytes);
      }
    } catch {
      logo = null;
    }
  }

  let page: PDFPage = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  function addPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  }

  function ensureSpace(height: number) {
    if (y - height < MARGIN + FOOTER_SPACE) addPage();
  }

  function drawText(
    value: string,
    x: number,
    top: number,
    size: number,
    font: PDFFont = regular,
    color = TEXT
  ) {
    page.drawText(pdfSafe(value), { x, y: top - size, size, font, color });
  }

  function horizontalRule(top: number, color = LINE, thickness = 0.6) {
    page.drawLine({
      start: { x: MARGIN, y: top },
      end: { x: PAGE_WIDTH - MARGIN, y: top },
      thickness,
      color,
    });
  }

  // Report header
  if (logo) {
    let logoWidth = (logo.width / logo.height) * 22;
    let logoHeight = 22;
    if (logoWidth > 110) {
      logoHeight = (110 / logoWidth) * 22;
      logoWidth = 110;
    }
    page.drawImage(logo, {
      x: MARGIN,
      y: y - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    drawText(branding.name.toUpperCase(), MARGIN + logoWidth + 8, y, 9, bold, MUTED);
  } else {
    drawText(branding.name.toUpperCase(), MARGIN, y, 9, bold, MUTED);
  }
  y -= 14;
  drawText(data.title, MARGIN, y, 19, bold, TEXT);
  y -= 20;
  drawText(
    `Generated ${data.generatedLabel}`,
    MARGIN,
    y,
    8.5,
    regular,
    MUTED
  );
  y -= 13;
  drawText(data.filterSummary.join("  ·  "), MARGIN, y, 8.5, regular, MUTED);
  y -= 16;
  horizontalRule(y);
  y -= 16;

  // Summary cards
  const cardGap = 8;
  const cardColumns = 3;
  const cardWidth =
    (CONTENT_WIDTH - cardGap * (cardColumns - 1)) / cardColumns;
  const cardHeight = 44;

  for (let index = 0; index < data.stats.length; index += cardColumns) {
    const rowStats = data.stats.slice(index, index + cardColumns);
    ensureSpace(cardHeight + 8);
    rowStats.forEach((stat, columnIndex) => {
      const x = MARGIN + columnIndex * (cardWidth + cardGap);
      const top = y;
      page.drawRectangle({
        x,
        y: top - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: CARD_FILL,
        borderColor: LINE,
        borderWidth: 0.5,
      });
      drawText(
        truncate(stat.label.toUpperCase(), regular, 7, cardWidth - 12),
        x + 6,
        top - 6,
        7,
        regular,
        MUTED
      );
      drawText(
        truncate(
          formatReportStat(stat, data.currencySymbol),
          bold,
          11.5,
          cardWidth - 12
        ),
        x + 6,
        top - 17,
        11.5,
        bold,
        TEXT
      );
      if (stat.hint) {
        drawText(
          truncate(stat.hint, regular, 7, cardWidth - 12),
          x + 6,
          top - 32,
          7,
          regular,
          MUTED
        );
      }
    });
    y -= cardHeight + 8;
  }

  y -= 4;

  function drawSectionTitle(section: ReportSection, continued = false) {
    ensureSpace(34);
    drawText(
      continued ? `${section.title} (continued)` : section.title,
      MARGIN,
      y,
      11.5,
      bold,
      TEXT
    );
    y -= 14;
    if (section.description && !continued) {
      drawText(section.description, MARGIN, y, 7.8, regular, MUTED);
      y -= 12;
    }
    if (continued) y -= 4;
  }

  function drawTableHeader(layout: TableLayout[]) {
    const headerHeight = 19;
    ensureSpace(headerHeight + 4);
    page.drawRectangle({
      x: MARGIN,
      y: y - headerHeight,
      width: CONTENT_WIDTH,
      height: headerHeight,
      color: HEADER_FILL,
    });
    let x = MARGIN;
    for (const item of layout) {
      const padding = 4;
      drawText(
        truncate(item.column.label, bold, 7.3, item.width - padding * 2),
        x + padding,
        y - 5,
        7.3,
        bold,
        rgb(1, 1, 1)
      );
      x += item.width;
    }
    y -= headerHeight;
  }

  function drawEmptyState(message: string) {
    ensureSpace(34);
    page.drawRectangle({
      x: MARGIN,
      y: y - 30,
      width: CONTENT_WIDTH,
      height: 30,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    drawText(message, MARGIN + 8, y - 9, 8.5, regular, MUTED);
    y -= 38;
  }

  function drawTable(section: ReportSection) {
    drawSectionTitle(section);
    if (section.rows.length === 0) {
      drawEmptyState(section.emptyMessage);
      return;
    }

    const layout = layoutColumns(section.columns);
    drawTableHeader(layout);

    const fontSize = 7.2;
    const lineHeight = 9.2;
    const verticalPadding = 3.2;

    section.rows.forEach((row, rowIndex) => {
      const cellLines = layout.map((item) =>
        wrapText(
          formatReportValue(
            row[item.column.key],
            item.column.format,
            data.currencySymbol
          ),
          regular,
          fontSize,
          item.width - 8,
          3
        )
      );
      const lineCount = Math.max(1, ...cellLines.map((lines) => lines.length));
      const rowHeight = lineCount * lineHeight + verticalPadding * 2;

      if (y - rowHeight < MARGIN + FOOTER_SPACE) {
        addPage();
        drawSectionTitle(section, true);
        drawTableHeader(layout);
      }

      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - rowHeight,
          width: CONTENT_WIDTH,
          height: rowHeight,
          color: ZEBRA,
        });
      }

      let x = MARGIN;
      layout.forEach((item, columnIndex) => {
        const alignRight =
          item.column.format === "number" || item.column.format === "money";
        cellLines[columnIndex].forEach((line, lineIndex) => {
          const textWidth = regular.widthOfTextAtSize(line, fontSize);
          const textX = alignRight
            ? x + item.width - 4 - textWidth
            : x + 4;
          page.drawText(pdfSafe(line), {
            x: textX,
            y: y - verticalPadding - fontSize - lineIndex * lineHeight,
            size: fontSize,
            font: regular,
            color: TEXT,
          });
        });
        x += item.width;
      });

      page.drawLine({
        start: { x: MARGIN, y: y - rowHeight },
        end: { x: PAGE_WIDTH - MARGIN, y: y - rowHeight },
        thickness: 0.35,
        color: LINE,
      });
      y -= rowHeight;
    });

    y -= 16;
  }

  for (const section of data.sections) drawTable(section);

  const pages = document.getPages();
  pages.forEach((currentPage, index) => {
    const footer = `${branding.name} · ${data.title} · Page ${index + 1} of ${pages.length}`;
    const width = regular.widthOfTextAtSize(pdfSafe(footer), 7);
    currentPage.drawLine({
      start: { x: MARGIN, y: 30 },
      end: { x: PAGE_WIDTH - MARGIN, y: 30 },
      thickness: 0.5,
      color: LINE,
    });
    currentPage.drawText(pdfSafe(footer), {
      x: (PAGE_WIDTH - width) / 2,
      y: 18,
      size: 7,
      font: regular,
      color: MUTED,
    });
  });

  return document.save();
}
