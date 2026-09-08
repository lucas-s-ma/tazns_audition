import ExcelJS from 'exceljs';
import {
  categories,
  labels,
  type Candidate,
  type Cycle,
  type Evaluation,
  type User,
} from './domain';
export interface ExportData {
  cycle: Cycle;
  candidates: Candidate[];
  evaluations: Evaluation[];
  team: Evaluation[];
  users: User[];
}
const profileKeys = [
  'audition_order',
  'first_name',
  'last_name',
  'class_year',
  'major',
  'hometown',
  'celebrity_crush',
  'mbti',
  'primary_section',
  'secondary_section',
  'origin_1',
  'origin_1_other',
  'origin_2',
  'origin_2_other',
  'excluded',
  'state',
  'deliberation_status',
  'accepted_section',
] as const;
const title = (s: string) =>
  s
    .split('_')
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join(' ');
export function safeSheetName(raw: string, used: Set<string>) {
  const base =
    raw
      .replace(/[\\/*?:\[\]\x00-\x1f]/g, ' ')
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31) || 'Candidate';
  let name = base,
    n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n++})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}
function color(cell: ExcelJS.Cell, rating: unknown, strong: boolean) {
  const colors = strong
    ? { GREEN: '23794D', YELLOW: 'B7790C', RED: 'B63644', GREY: '536070' }
    : { GREEN: 'DFF1E5', YELLOW: 'FFF1CA', RED: 'FBE0E2', GREY: 'EDF0F4' };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: colors[(rating || 'GREY') as keyof typeof colors] },
  };
  if (strong) cell.font = { bold: true, color: { argb: 'FFFFFF' } };
}
export async function buildWorkbook(data: ExportData) {
  const book = new ExcelJS.Workbook();
  book.creator = 'Temptasians';
  book.title = data.cycle.name;
  const summary = book.addWorksheet('Summary');
  const used = new Set(['summary']);
  summary.addRow([
    ...profileKeys.map(title),
    'Full Name',
    ...categories.flatMap((c) => [`Team ${labels[c]} Rating`, `Team ${labels[c]} Notes`]),
  ]);
  for (const c of [...data.candidates].sort((a, b) => a.audition_order - b.audition_order)) {
    const team = data.team.find((t) => t.candidate_id === c.id);
    const row = summary.addRow([
      ...profileKeys.map((k) => c[k]),
      `${c.first_name} ${c.last_name}`,
      ...categories.flatMap((cat) => [
        team?.[`${cat}_rating`] ?? 'GREY',
        team?.[`${cat}_notes`] ?? '',
      ]),
    ]);
    categories.forEach((cat, i) =>
      color(
        row.getCell(profileKeys.length + 2 + i * 2),
        team?.[`${cat}_rating`],
        cat === 'overall',
      ),
    );
    const sheet = book.addWorksheet(
      safeSheetName(`${c.audition_order} ${c.first_name} ${c.last_name}`, used),
    );
    sheet.addRow([`${c.first_name} ${c.last_name}`, data.cycle.name]);
    for (const k of profileKeys) sheet.addRow([title(k), c[k]]);
    sheet.addRow([]);
    const header = sheet.addRow([
      'Judge',
      ...categories.flatMap((cat) => [`${labels[cat]} Rating`, `${labels[cat]} Notes`]),
    ]);
    header.font = { bold: true };
    const addEvaluation = (name: string, e: Evaluation | undefined) => {
      const r = sheet.addRow([
        name,
        ...categories.flatMap((cat) => [e?.[`${cat}_rating`] ?? 'GREY', e?.[`${cat}_notes`] ?? '']),
      ]);
      categories.forEach((cat, i) =>
        color(r.getCell(2 + i * 2), e?.[`${cat}_rating`], cat === 'overall'),
      );
    };
    for (const u of data.users)
      addEvaluation(
        u.display_name,
        data.evaluations.find((e) => e.candidate_id === c.id && e.judge_user_id === u.id),
      );
    sheet.addRow([]);
    addEvaluation('Shared Team Deliberation', team);
    sheet.addRow(['Board Status', c.deliberation_status]);
    sheet.addRow(['Accepted Section', c.accepted_section]);
  }
  for (const sheet of book.worksheets) {
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column, i) => {
      column.width = sheet === summary ? 24 : i === 0 ? 28 : i % 2 === 0 ? 45 : 20;
    });
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
      }),
    );
  }
  summary.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: summary.columnCount } };
  return book;
}
