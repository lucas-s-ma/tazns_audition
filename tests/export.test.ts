import { it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, safeSheetName } from '@/lib/export';
import { emptyEvaluation, type Candidate, type Cycle, type User } from '@/lib/domain';
it('Summary first, candidates in audition order, team distinct, wrapped notes and stronger Overall fills', async () => {
  const c = {
    id: '1',
    audition_order: 2,
    first_name: 'Jane',
    last_name: 'Doe',
    excluded: true,
    deliberation_status: 'ACCEPTED',
    accepted_section: 'Alto',
  } as Candidate;
  const d = { ...c, id: '2', audition_order: 1, first_name: 'Alex' };
  const own = {
      ...emptyEvaluation('1'),
      judge_user_id: 'alice',
      overall_rating: 'RED' as const,
      solo_notes: '=HYPERLINK("evil")',
    },
    team = { ...emptyEvaluation('1'), overall_rating: 'GREEN' as const };
  const book = await buildWorkbook({
    cycle: { name: 'Fall 2026' } as Cycle,
    candidates: [c, d],
    evaluations: [own],
    team: [team],
    users: [{ id: 'alice', display_name: 'Alice' } as User],
  });
  expect(book.worksheets.map((s) => s.name)).toEqual(['Summary', '1 Alex Doe', '2 Jane Doe']);
  const rows: unknown[][] = [];
  book.worksheets[2].eachRow((r) => rows.push(r.values as unknown[]));
  expect(JSON.stringify(rows)).toContain('Shared Team Deliberation');
  expect(JSON.stringify(rows)).toContain('=HYPERLINK');
  const buffer = await book.xlsx.writeBuffer();
  expect(buffer.byteLength).toBeGreaterThan(1000);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer);
  const exported = loaded.worksheets[2];
  expect(exported.getCell('I22').value).toBe('=HYPERLINK("evil")');
  expect(exported.getCell('I22').type).toBe(ExcelJS.ValueType.String);
  expect(exported.getCell('I22').alignment.wrapText).toBe(true);
  expect(exported.getCell('L22').fill).toEqual({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'B63644' },
  });
  expect(exported.getCell('L24').value).toBe('GREEN');
  expect(exported.getCell('L24').fill).not.toEqual(exported.getCell('B24').fill);
  expect(exported.getColumn(3).width).toBe(45);
  expect(exported.getCell('A1').font.bold).toBe(true);
});
it('sanitizes illegal, long, duplicate and case-insensitive sheet names', () => {
  const used = new Set(['summary']);
  expect(safeSheetName('Summary', used)).toBe('Summary (2)');
  const name = safeSheetName('a/b:*?[]'.repeat(20), used);
  expect(name.length).toBeLessThanOrEqual(31);
  expect(name).not.toMatch(/[\\/*?:\[\]]/);
  expect(safeSheetName('SAME', used)).toBe('SAME');
  expect(safeSheetName('same', used)).toBe('same (2)');
});
