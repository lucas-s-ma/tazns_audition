import { z } from 'zod';
export const categories = ['range', 'pitch', 'blending', 'solo', 'vibe', 'overall'] as const;
export type Category = (typeof categories)[number];
export const labels: Record<Category, string> = {
  range: 'Range',
  pitch: 'Pitch Matching',
  blending: 'Blending',
  solo: 'Solo',
  vibe: 'Vibe',
  overall: 'Overall',
};
export const ratingSchema = z.enum(['GREEN', 'YELLOW', 'RED']).nullable();
export type Rating = z.infer<typeof ratingSchema>;
export type EvaluationField = `${Category}_rating` | `${Category}_notes`;
export type Evaluation = {
  candidate_id: string;
  judge_user_id?: string;
  updated_at: string;
} & Record<`${Category}_rating`, Rating> &
  Record<`${Category}_notes`, string>;
export interface User {
  id: string;
  display_name: string;
  is_admin: boolean;
  last_seen_at: string;
}
export interface Cycle {
  id: string;
  name: string;
  is_active: boolean;
  mode: 'AUDITION' | 'DELIBERATION';
  created_at: string;
}
export const classes = ['2027', '2028', '2029', '2030', 'Graduate', 'DKU', 'Fuqua'] as const;
export const sections = ['Soprano', 'Alto', 'Tenor', 'Bass'] as const;
export const origins = [
  'Mainland China',
  'Hong Kong',
  'Taiwan',
  'Korea',
  'Japan',
  'Vietnam',
  'Philippines',
  'Mongolia',
  'Other',
] as const;
export const profileSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  class_year: z.enum(classes).nullable(),
  major: z.string().max(500),
  hometown: z.string().max(500),
  celebrity_crush: z.string().max(500),
  mbti: z.string().regex(/^[EI_][SN_][TF_][JP_]$/),
  primary_section: z.enum(sections).nullable(),
  secondary_section: z.enum(['None', ...sections]).nullable(),
  origin_1: z.enum(origins).nullable(),
  origin_2: z.enum(['None', ...origins]).nullable(),
  origin_1_other: z.string().max(500),
  origin_2_other: z.string().max(500),
});
export type Profile = z.infer<typeof profileSchema>;
export interface Candidate extends Profile {
  id: string;
  audition_cycle_id: string;
  audition_order: number;
  state: 'UPCOMING' | 'PERSONAL_INFO' | 'VOCAL_AUDITION' | 'COMPLETED';
  excluded: boolean;
  note_taker_id: string | null;
  deliberation_status: 'UNDECIDED' | 'ACCEPTED' | 'REJECTED';
  accepted_section: (typeof sections)[number] | null;
  updated_at: string;
}
export interface Snapshot {
  user: User;
  unlocked: boolean;
  cycles: Cycle[];
  cycle: Cycle | null;
  candidates: Candidate[];
  users: User[];
  team: Evaluation[];
}
export interface CandidateDetail {
  candidate: Candidate;
  cycle: Cycle;
  own: Evaluation | null;
  peers: Evaluation[];
  overalls: { judge_user_id: string; overall_rating: Rating }[];
  team: Evaluation | null;
}
export const emptyEvaluation = (id: string): Evaluation => ({
  candidate_id: id,
  updated_at: '',
  range_rating: null,
  range_notes: '',
  pitch_rating: null,
  pitch_notes: '',
  blending_rating: null,
  blending_notes: '',
  solo_rating: null,
  solo_notes: '',
  vibe_rating: null,
  vibe_notes: '',
  overall_rating: null,
  overall_notes: '',
});
export function normalizeName(input: string) {
  return input
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/(^|[\s'-])\p{L}/gu, (c) => c.toLocaleUpperCase('en-US'));
}
export function automaticAdmin(name: string) {
  return ['Lucas', 'Admin'].includes(normalizeName(name));
}
export function canSeeExcluded(user: User, unlocked: boolean) {
  return user.is_admin || unlocked;
}
export function canViewCandidate(user: User, candidate: Candidate, unlocked: boolean) {
  return !candidate.excluded || canSeeExcluded(user, unlocked);
}
export function canReadDetails(viewer: string, owner: string, cycle: Cycle, unlocked: boolean) {
  return viewer === owner || cycle.mode === 'DELIBERATION' || unlocked;
}
export function canViewPeerOverall(candidate: Candidate) {
  return candidate.state === 'COMPLETED';
}
export function canManageProcedure(user: User) {
  return user.is_admin;
}
export function validateField(
  target: 'profile' | 'evaluation' | 'team',
  field: string,
  value: unknown,
) {
  if (target === 'profile') {
    const shape = profileSchema.shape;
    if (!(field in shape)) throw new Error('Unknown profile field');
    return { field, value: shape[field as keyof typeof shape].parse(value) };
  }
  if (!categories.some((c) => field === `${c}_rating` || field === `${c}_notes`))
    throw new Error('Unknown evaluation field');
  return {
    field,
    value: field.endsWith('_rating')
      ? ratingSchema.parse(value)
      : z.string().max(20000).parse(value),
  };
}
