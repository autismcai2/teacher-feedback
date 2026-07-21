const SHEET_NAME = "课堂反馈";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COL_WIDTHS = {
  A: 12,
  B: 12,
  C: 12,
  D: 12,
  E: 12,
  F: 12,
  G: 12,
  H: 12,
  I: 12,
  J: 13,
  K: 13,
  L: 13,
  M: 13,
  N: 13,
  O: 13,
  P: 13,
};

const MERGES = [
  "A1:C1",
  "D1:I1",
  "J1:P1",
  "C2:G2",
  "H2:I2",
  "J2:P2",
  "C3:G3",
  "H3:I3",
  "J3:P5",
  "A4:I4",
  "A5:I5",
  "A6:I6",
  "J6:P6",
  "A7:I7",
  "J7:P10",
  "A8:I8",
  "A9:I9",
  "A10:I10",
];

const STYLE = {
  normal: 0,
  top: 1,
  label: 2,
  smallCenter: 3,
  orangeTitle: 4,
  blueTitle: 5,
  greenTitle: 6,
  cyanTitle: 7,
  text: 8,
  subTitle: 9,
  homework: 10,
};

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cellText(value) {
  return String(value ?? "").trim();
}

function visualLength(value) {
  return Array.from(String(value ?? "")).reduce((total, char) => {
    if (char === "\n") return total;
    return total + (char.charCodeAt(0) < 128 ? 0.55 : 1);
  }, 0);
}

function estimateHeight(value, width, { fontSize = 15, minHeight = 31, padding = 10 } = {}) {
  const usableWidth = Math.max(width * 0.38, 1);
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(visualLength(line) / usableWidth)), 0);

  return Math.max(minHeight, lines * fontSize * 1.35 + padding);
}

function mergedWidth(startColumn, endColumn) {
  const start = startColumn.charCodeAt(0);
  const end = endColumn.charCodeAt(0);
  let width = 0;

  for (let code = start; code <= end; code += 1) {
    width += COL_WIDTHS[String.fromCharCode(code)];
  }

  return width;
}

function point(value) {
  return Math.round(value * 4) / 4;
}

function columnNumber(column) {
  return column.charCodeAt(0) - 64;
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function normalizeTemplateData(result, meta) {
  const lessonNumber = meta.lessonNumber || 1;

  return {
    lesson: `第${lessonNumber}次课`,
    dateTime: `【上课时间】${formatDateLabel(meta.classDate)}${meta.classTime || "10:10-12:10"}`,
    teacher: `【任课老师】${meta.teacherName || "陈思桐"}`,
    student: result.studentName || "同学",
    attendance: meta.attendance || "√",
    homeworkStatus: meta.homeworkStatus || "已完成",
    seriousness: "★".repeat(Number(meta.seriousness) || 4),
    interaction: "★".repeat(Number(meta.interaction) || 3),
    content: cellText(result.todayContent),
    absorption: cellText(result.absorption),
    keyPoints: cellText(result.keyPoints),
    difficultPoints: cellText(result.difficultPoints),
    homework: cellText(result.homework),
  };
}

function formatDateLabel(value) {
  if (!value) {
    const today = new Date();
    return `${today.getMonth() + 1}月${today.getDate()}日`;
  }

  const [, month, day] = String(value).split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function buildRowHeights(data) {
  const rowHeights = {
    1: 35,
    2: 23,
    3: 23,
    4: 31,
    5: estimateHeight(data.content, mergedWidth("A", "I"), { minHeight: 132 }),
    6: 31,
    7: 31,
    8: estimateHeight(data.keyPoints, mergedWidth("A", "I"), { minHeight: 116 }),
    9: 31,
    10: estimateHeight(data.difficultPoints, mergedWidth("A", "I"), { minHeight: 147 }),
  };
  const absorptionTotal = estimateHeight(data.absorption, mergedWidth("J", "P"), { minHeight: 174 });
  const homeworkTotal = estimateHeight(data.homework, mergedWidth("J", "P"), {
    fontSize: 16,
    minHeight: 140,
  });

  rowHeights[5] = Math.max(rowHeights[5], absorptionTotal - rowHeights[3] - rowHeights[4]);
  rowHeights[10] = Math.max(rowHeights[10], homeworkTotal - rowHeights[7] - rowHeights[8] - rowHeights[9]);

  return Object.fromEntries(Object.entries(rowHeights).map(([row, height]) => [row, point(height)]));
}

function styleForCell(row, column) {
  if (row === 1) return STYLE.top;
  if (row === 2 && column >= 10) return STYLE.greenTitle;
  if (row === 2) return STYLE.label;
  if (row === 3 && column < 10) return STYLE.smallCenter;
  if (row >= 3 && row <= 5 && column >= 10) return STYLE.text;
  if (row === 4 && column <= 9) return STYLE.orangeTitle;
  if (row === 5 && column <= 9) return STYLE.text;
  if (row === 6 && column <= 9) return STYLE.blueTitle;
  if (row === 6 && column >= 10) return STYLE.cyanTitle;
  if ((row === 7 || row === 9) && column <= 9) return STYLE.subTitle;
  if ((row === 8 || row === 10) && column <= 9) return STYLE.text;
  if (row >= 7 && row <= 10 && column >= 10) return STYLE.homework;
  return STYLE.normal;
}

export function buildTemplateWorksheetModel(result, meta) {
  const data = normalizeTemplateData(result, meta);
  const values = {
    A1: data.lesson,
    D1: data.dateTime,
    J1: data.teacher,
    A2: "学员姓名",
    B2: "出席情况",
    C2: "课堂表现点评",
    H2: "作业完成情况",
    J2: "三、学生吸收情况",
    A3: data.student,
    B3: data.attendance,
    C3: `认真程度： ${data.seriousness}        互动性： ${data.interaction}`,
    H3: data.homeworkStatus,
    J3: data.absorption,
    A4: "一、本节课教学内容",
    A5: data.content,
    A6: "二、本节课重难点",
    J6: "四、作业布置",
    A7: "一、知识重点",
    A8: data.keyPoints,
    A9: "二、核心难点",
    A10: data.difficultPoints,
    J7: data.homework,
  };

  return {
    sheetName: SHEET_NAME,
    columns: COL_WIDTHS,
    merges: MERGES,
    rowHeights: buildRowHeights(data),
    values,
  };
}

function workbookXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function appXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>课堂反馈生成器</Application></Properties>`;
}

function coreXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>课堂反馈生成器</dc:creator><cp:lastModifiedBy>课堂反馈生成器</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="11">
    <font><sz val="15"/><name val="宋体"/></font>
    <font><b/><sz val="22"/><color rgb="FFFF0000"/><name val="宋体"/></font>
    <font><b/><sz val="13"/><name val="宋体"/></font>
    <font><sz val="13"/><name val="宋体"/></font>
    <font><b/><sz val="22"/><name val="宋体"/></font>
    <font><sz val="16"/><name val="宋体"/></font>
    <font><b/><sz val="26"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="20"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="20"/><color rgb="FFFF0000"/><name val="Microsoft YaHei"/></font>
    <font><b/><sz val="15"/><name val="Microsoft YaHei"/></font>
    <font><sz val="13"/><name val="Microsoft YaHei"/></font>
  </fonts>
  <fills count="12">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4B183"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF8EA9DB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFA9D18E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC9F1EF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F9FC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF4B6BD"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF9FE3DF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="25">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="10" fillId="11" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="10" fillId="0" borderId="1" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="0" shrinkToFit="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function cellXml(ref, value, style) {
  const styleAttr = style ? ` s="${style}"` : "";
  if (value === undefined || value === null || value === "") {
    return `<c r="${ref}"${styleAttr}/>`;
  }

  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function worksheetXml(model) {
  const columnXml = Object.entries(model.columns)
    .map(([column, width]) => `<col min="${columnNumber(column)}" max="${columnNumber(column)}" width="${width}" customWidth="1"/>`)
    .join("");
  const rowsXml = Array.from({ length: 10 }, (_, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const height = model.rowHeights[rowNumber];
    const cells = Array.from({ length: 16 }, (_, columnIndex) => {
      const column = columnName(columnIndex + 1);
      const ref = `${column}${rowNumber}`;
      return cellXml(ref, model.values[ref], styleForCell(rowNumber, columnIndex + 1));
    }).join("");

    return `<row r="${rowNumber}" ht="${height}" customHeight="1">${cells}</row>`;
  }).join("");
  const mergesXml = model.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnXml}</cols><sheetData>${rowsXml}</sheetData><mergeCells count="${model.merges.length}">${mergesXml}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.15" right="0.15" top="0.15" bottom="0.15" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(buffer, offset, value) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function dosTimeDate(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function createZip(entries) {
  const encoder = new TextEncoder();
  const { time, day } = dosTimeDate();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const nameBytes = encoder.encode(name);
    const data = typeof content === "string" ? encoder.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);

    writeUint32(local, 0, 0x04034b50);
    writeUint16(local, 4, 20);
    writeUint16(local, 6, 0x0800);
    writeUint16(local, 8, 0);
    writeUint16(local, 10, time);
    writeUint16(local, 12, day);
    writeUint32(local, 14, crc);
    writeUint32(local, 18, data.length);
    writeUint32(local, 22, data.length);
    writeUint16(local, 26, nameBytes.length);
    writeUint16(local, 28, 0);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    writeUint32(central, 0, 0x02014b50);
    writeUint16(central, 4, 20);
    writeUint16(central, 6, 20);
    writeUint16(central, 8, 0x0800);
    writeUint16(central, 10, 0);
    writeUint16(central, 12, time);
    writeUint16(central, 14, day);
    writeUint32(central, 16, crc);
    writeUint32(central, 20, data.length);
    writeUint32(central, 24, data.length);
    writeUint16(central, 28, nameBytes.length);
    writeUint16(central, 30, 0);
    writeUint16(central, 32, 0);
    writeUint16(central, 34, 0);
    writeUint16(central, 36, 0);
    writeUint32(central, 38, 0);
    writeUint32(central, 42, offset);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + data.length;
  }

  const centralOffset = offset;
  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  writeUint32(end, 0, 0x06054b50);
  writeUint16(end, 8, entries.length);
  writeUint16(end, 10, entries.length);
  writeUint32(end, 12, centralDirectory.length);
  writeUint32(end, 16, centralOffset);

  return concatBytes([...localParts, centralDirectory, end]);
}

export function createTemplateExcelBuffer(result, meta) {
  const model = buildTemplateWorksheetModel(result, meta);
  return createZip([
    ["[Content_Types].xml", contentTypesXml()],
    ["_rels/.rels", rootRelsXml()],
    ["docProps/app.xml", appXml()],
    ["docProps/core.xml", coreXml()],
    ["xl/workbook.xml", workbookXml()],
    ["xl/_rels/workbook.xml.rels", workbookRelsXml()],
    ["xl/styles.xml", stylesXml()],
    ["xl/worksheets/sheet1.xml", worksheetXml(model)],
  ]);
}

export function createTemplateExcelBlob(result, meta) {
  return new Blob([createTemplateExcelBuffer(result, meta)], { type: MIME_XLSX });
}

function groupWorkbookXml(lastRow) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${SHEET_NAME}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'${SHEET_NAME}'!$A$1:$P$${lastRow}</definedName></definedNames></workbook>`;
}

function groupStyleForCell(row, column, layout) {
  if (row === 1) return 13;
  if (row === 2) return 14;
  if (row === 3 && column >= 7) return 18;
  if (row === 3) return 15;
  if (row >= 4 && row <= layout.studentEnd && column <= 6) return column >= 3 && column <= 4 ? 24 : 16;
  if (row >= 4 && row <= layout.teachingContent && column >= 7) return 17;
  if (row === layout.teachingTitle && column <= 6) return 19;
  if (row === layout.teachingContent && column <= 6) return 22;
  if (row === layout.difficultTitle && column <= 6) return 20;
  if (row === layout.difficultTitle && column >= 7) return 21;
  if (row === layout.difficultContent) return 22;
  return STYLE.normal;
}

export function buildGroupClassWorksheetModel(data) {
  const students = Array.isArray(data.students) ? data.students : [];
  const rowCount = Math.max(students.length, 1);
  const studentEnd = 3 + rowCount;
  const teachingTitle = studentEnd + 1;
  const teachingContent = teachingTitle + 1;
  const difficultTitle = teachingContent + 1;
  const difficultContent = difficultTitle + 1;
  const layout = { studentEnd, teachingTitle, teachingContent, difficultTitle, difficultContent };
  const values = {
    A1: `${[data.classTitle || "班级", `${data.grade || ""}${data.subject || ""}`].filter(Boolean).join("·")}·教学反馈`,
    A2: `【上课时间】${formatDateLabel(data.classDate)} ${data.classTime || "13:10-15:10"}  【课次】第${data.lessonNumber || 1}次`,
    A3: "学员姓名",
    B3: "出席情况",
    C3: "课堂表现点评",
    E3: "入门测（30分）",
    G3: "三、学生吸收情况",
    G4: cellText(data.absorption),
    [`A${teachingTitle}`]: "一、本节课教学内容",
    [`A${teachingContent}`]: cellText(data.teachingContent),
    [`A${difficultTitle}`]: "二、本节课重难点",
    [`G${difficultTitle}`]: "四、作业",
    [`A${difficultContent}`]: cellText(data.difficultPoints),
    [`G${difficultContent}`]: cellText(data.homework),
  };

  students.forEach((student, index) => {
    const row = index + 4;
    values[`A${row}`] = student.name || "";
    values[`B${row}`] = student.attendance === "出席" ? "√" : student.attendance || "";
    values[`C${row}`] = cellText(student.quickNote);
    values[`E${row}`] = student.score ?? "";
  });

  const merges = [
    "A1:P1", "A2:P2", "C3:D3", "E3:F3", "G3:P3",
    `G4:P${teachingContent}`, `A${teachingTitle}:F${teachingTitle}`,
    `A${teachingContent}:F${teachingContent}`, `A${difficultTitle}:F${difficultTitle}`,
    `G${difficultTitle}:P${difficultTitle}`, `A${difficultContent}:F${difficultContent}`,
    `G${difficultContent}:P${difficultContent}`,
  ];

  for (let row = 4; row <= studentEnd; row += 1) {
    merges.push(`C${row}:D${row}`, `E${row}:F${row}`);
  }

  return {
    sheetName: SHEET_NAME,
    columns: { A: 8.5, B: 11, C: 12, D: 12, E: 9, F: 9, G: 9.75, H: 9.75, I: 9.75, J: 9.75, K: 9.75, L: 9.75, M: 9.75, N: 9.75, O: 9.75, P: 9.75 },
    merges,
    values,
    layout,
    rowHeights: Object.fromEntries(Array.from({ length: difficultContent }, (_, index) => {
      const row = index + 1;
      if (row === 1) return [row, 54];
      if (row === 2) return [row, 42];
      if (row === 3 || row === teachingTitle || row === difficultTitle) return [row, 40];
      if (row >= 4 && row <= studentEnd) return [row, 42];
      if (row === teachingContent) return [row, 38];
      return [row, 64];
    })),
  };
}

function groupWorksheetXml(model) {
  const columnXml = Object.entries(model.columns).map(([column, width]) => `<col min="${columnNumber(column)}" max="${columnNumber(column)}" width="${width}" customWidth="1"/>`).join("");
  const rowsXml = Array.from({ length: 60 }, (_, rowIndex) => {
    const row = rowIndex + 1;
    const cells = Array.from({ length: 52 }, (_, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${row}`;
      const insideTemplate = row <= model.layout.difficultContent && columnIndex + 1 <= 16;
      const style = insideTemplate ? groupStyleForCell(row, columnIndex + 1, model.layout) : 23;
      const value = model.values[ref];
      if (columnIndex + 1 === 5 && row >= 4 && row <= model.layout.studentEnd && value !== "" && Number.isFinite(Number(value))) {
        return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
      }
      return cellXml(ref, value, style);
    }).join("");
    const height = model.rowHeights[row];
    return `<row r="${row}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells}</row>`;
  }).join("");
  const mergesXml = model.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:AZ60"/><sheetViews><sheetView showGridLines="0" showRowColHeaders="1" zoomScale="85" zoomScaleNormal="85" workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnXml}</cols><sheetData>${rowsXml}</sheetData><mergeCells count="${model.merges.length}">${mergesXml}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.15" right="0.15" top="0.15" bottom="0.15" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

export function createGroupClassExcelBuffer(data) {
  const model = buildGroupClassWorksheetModel(data);
  return createZip([
    ["[Content_Types].xml", contentTypesXml()], ["_rels/.rels", rootRelsXml()],
    ["docProps/app.xml", appXml()], ["docProps/core.xml", coreXml()],
    ["xl/workbook.xml", groupWorkbookXml(model.layout.difficultContent)], ["xl/_rels/workbook.xml.rels", workbookRelsXml()],
    ["xl/styles.xml", stylesXml()], ["xl/worksheets/sheet1.xml", groupWorksheetXml(model)],
  ]);
}

export function createGroupClassExcelBlob(data) {
  return new Blob([createGroupClassExcelBuffer(data)], { type: MIME_XLSX });
}
