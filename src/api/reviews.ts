import { invoke } from '@tauri-apps/api/core';
import type { ReviewPeriodType, ReviewReport } from '@/types';

export interface ReviewDraft {
  highlights: string;
  blockers: string;
  lessons: string;
  nextActions: string;
  score?: number | null;
}

export const reviewsApi = {
  get: (periodType: ReviewPeriodType, periodStart: string, periodEnd: string) =>
    invoke<ReviewReport | null>('get_review_report', { periodType, periodStart, periodEnd }),
  save: (
    periodType: ReviewPeriodType,
    periodStart: string,
    periodEnd: string,
    draft: ReviewDraft,
  ) => invoke<ReviewReport>('save_review_report', {
    periodType,
    periodStart,
    periodEnd,
    ...draft,
  }),
};
