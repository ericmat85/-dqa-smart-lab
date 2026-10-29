export function labNotificationCounts(requests, counts) {
  const safeCount=value=>Number.isFinite(value)&&value>=0?value:0;
  return {
    pendingReview:requests.filter(row=>row.status==='待審查').length,
    unscheduled:safeCount(counts['未排程']),
    conflicts:safeCount(counts['有衝突']),
  };
}
