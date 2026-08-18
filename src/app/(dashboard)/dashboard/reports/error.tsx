'use client';

import { ReportsErrorState } from '@/features/reports/components/reports-dashboard';

export default function ReportsError({ reset }: { error: Error; reset: () => void }) {
  return <ReportsErrorState onRetry={reset} />;
}
