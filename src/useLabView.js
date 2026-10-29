import {useMemo,useSyncExternalStore} from 'react';
import useLabSnapshot from './useLabSnapshot.js';
import {deriveLabMetrics} from './labData.mjs';
import {subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot} from './scheduleClock.mjs';
export default function useLabView() {
  const snapshot=useLabSnapshot();
  const now=useSyncExternalStore(subscribeScheduleClock,scheduleClockSnapshot,scheduleServerSnapshot);
  const metrics=useMemo(()=>deriveLabMetrics(snapshot,now),[snapshot,now]);
  return {snapshot,metrics,now};
}
