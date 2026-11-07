import ExcelJS from "exceljs";
import {
  formatReportStat,
  type ReportBranding,
  type ReportColumn,
  type ReportData,
  type ReportSection,
} from "./reports";

const HEADER_FILL = "FF111827";
const SECTION_FILL = "FFE5E7EB";
const ZEBRA_FILL = "FFF9FAFB";
const BORDER_COLOR = "FFD1D5DB";

function safeSheetName(value: string, used: Set<string>) {
  const base =
    value
      .replace(/[\\/?*[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Report";
  let name = base;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${counter})`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function columnWidth(column: ReportColumn) {
  const weight = column.width ?? 1;
  return Math.min(42, Math.max(10, Math.round(weight * 11)));
}

function setCell(
  cell: ExcelJS.Cell,
  value: string | number | null,
  column: ReportColumn
) {
  if (value === null || value === undefined) {
    cell.value = "";
    return;
  }
  if (column.format === "money" || column.format === "number") {
    const numeric = Number(value);
    cell.value = Number.isFinite(numeric) ? numeric : 0;
    cell.numFmt = column.format === "money" ? "#,##0.00" : "#,##0";
    cell.alignment = { horizontal: "right", vertical: "top" };
  } else {
    cell.value = String(value);
    cell.alignment = { horizontal: "left", vertical: "top", wrapText: true };
  }
}

function addHeaderRows(
  worksheet: ExcelJS.Worksheet,
  data: ReportData,
  branding: ReportBranding,
  columns: ReportColumn[]
) {
  const lastColumn = Math.max(columns.length, 2);

  worksheet.mergeCells(1, 1, 1, lastColumn);
  const libraryCell = worksheet.getCell(1, 1);
  libraryCell.value = branding.name.toUpperCase();
  libraryCell.font = { bold: true, size: 16, color: { argb: "FF111827" } };
  libraryCell.alignment = { vertical: "middle" };
  worksheet.getRow(1).height = 26;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  const titleCell = worksheet.getCell(2, 1);
  titleCell.value = data.title;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { vertical: "middle" };
  worksheet.getRow(2).height = 20;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  const generatedCell = worksheet.getCell(3, 1);
  generatedCell.value = `Generated ${data.generatedLabel}`;
  generatedCell.font = { size: 9, color: { argb: "FF6B7280" } };

  worksheet.mergeCells(4, 1, 4, lastColumn);
  const filterCell = worksheet.getCell(4, 1);
  filterCell.value = `Filters: ${data.filterSummary.join("  ·  ")}`;
  filterCell.font = { size: 9, color: { argb: "FF6B7280" } };
  filterCell.alignment = { wrapText: true };

  return 5;
}

function addStats(
  worksheet: ExcelJS.Worksheet,
  data: ReportData,
  startRow: number,
  lastColumn: number
) {
  let row = startRow + 1;

  worksheet.mergeCells(row, 1, row, lastColumn);
  const heading = worksheet.getCell(row, 1);
  heading.value = "Summary statistics";
  heading.font = { bold: true, size: 10 };
  heading.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: SECTION_FILL },
  };
  row += 1;

  for (const stat of data.stats) {
    const label = worksheet.getCell(row, 1);
    label.value = stat.label;
    label.font = { size: 9, color: { argb: "FF4B5563" } };

    const value = worksheet.getCell(row, 2);
    const formatted = formatReportStat(stat, data.currencySymbol);
    if (stat.format === "money" || stat.format === "number") {
      const numeric = Number(stat.value);
      value.value = Number.isFinite(numeric) ? numeric : 0;
      value.numFmt = stat.format === "money" ? "#,##0.00" : "#,##0";
      value.alignment = { horizontal: "left" };
    } else {
      value.value = formatted;
    }
    value.font = { bold: true, size: 9 };

    if (lastColumn > 2) {
      worksheet.mergeCells(row, 3, row, lastColumn);
      const hint = worksheet.getCell(row, 3);
      hint.value = stat.hint ?? "";
      hint.font = { size: 8.5, color: { argb: "FF6B7280" } };
    }
    row += 1;
  }

  return row + 1;
}

function addSection(
  worksheet: ExcelJS.Worksheet,
  data: ReportData,
  section: ReportSection,
  startRow: number
) {
  const columns = section.columns;
  const lastColumn = Math.max(columns.length, 2);
  let row = startRow;

  worksheet.mergeCells(row, 1, row, lastColumn);
  const sectionCell = worksheet.getCell(row, 1);
  sectionCell.value = section.title;
  sectionCell.font = { bold: true, size: 11 };
  row += 1;

  if (section.description) {
    worksheet.mergeCells(row, 1, row, lastColumn);
    const descriptionCell = worksheet.getCell(row, 1);
    descriptionCell.value = section.description;
    descriptionCell.font = { size: 9, color: { argb: "FF6B7280" } };
    row += 1;
  }

  row += 1;

  const headerRow = row;
  columns.forEach((column, index) => {
    const cell = worksheet.getCell(headerRow, index + 1);
    cell.value = column.label;
    cell.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };
  });
  worksheet.getRow(headerRow).height = 22;
  row += 1;

  if (section.rows.length === 0) {
    worksheet.mergeCells(row, 1, row, lastColumn);
    const empty = worksheet.getCell(row, 1);
    empty.value = section.emptyMessage;
    empty.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    empty.border = {
      top: { style: "thin", color: { argb: BORDER_COLOR } },
      bottom: { style: "thin", color: { argb: BORDER_COLOR } },
      left: { style: "thin", color: { argb: BORDER_COLOR } },
      right: { style: "thin", color: { argb: BORDER_COLOR } },
    };
    row += 1;
  } else {
    section.rows.forEach((record, rowIndex) => {
      columns.forEach((column, columnIndex) => {
        const cell = worksheet.getCell(row, columnIndex + 1);
        setCell(cell, record[column.key] ?? null, column);
        cell.font = { size: 8.5 };
        cell.border = {
          top: { style: "thin", color: { argb: BORDER_COLOR } },
          bottom: { style: "thin", color: { argb: BORDER_COLOR } },
          left: { style: "thin", color: { argb: BORDER_COLOR } },
          right: { style: "thin", color: { argb: BORDER_COLOR } },
        };
        if (rowIndex % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: ZEBRA_FILL },
          };
        }
      });
      row += 1;
    });
  }

  worksheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + Math.max(section.rows.length, 1), column: columns.length },
  };

  worksheet.views = [{ state: "frozen", ySplit: headerRow }];

  return { nextRow: row + 1, headerRow };
}

export async function renderReportExcel(
  data: ReportData,
  branding: ReportBranding
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = `${branding.name} Manager`;
  workbook.lastModifiedBy = branding.name;
  workbook.created = new Date(data.generatedAt);
  workbook.modified = new Date(data.generatedAt);
  workbook.title = data.title;
  workbook.subject = data.description;

  const usedNames = new Set<string>();
  let firstSheet = true;

  for (const section of data.sections) {
    const worksheet = workbook.addWorksheet(
      safeSheetName(
        data.sections.length > 1 ? section.title : "Report",
        usedNames
      )
    );

    const columns = section.columns;
    const lastColumn = Math.max(columns.length, 2);
    const headerEnd = addHeaderRows(worksheet, data, branding, columns);
    let row = headerEnd;

    if (firstSheet) {
      row = addStats(worksheet, data, row, lastColumn);
      firstSheet = false;
    } else {
      row += 1;
    }

    const { headerRow } = addSection(worksheet, data, section, row);

    columns.forEach((column, index) => {
      worksheet.getColumn(index + 1).width = columnWidth(column);
    });
    if (columns.length < 2) worksheet.getColumn(2).width = 14;

    worksheet.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
      printTitlesRow: `${headerRow}:${headerRow}`,
    };

    worksheet.headerFooter.oddFooter =
      `&L${branding.name}&C${data.title}&RPage &P of &N`;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
