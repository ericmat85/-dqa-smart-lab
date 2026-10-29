import test from 'node:test';
import assert from 'node:assert/strict';
import {labNotificationCounts} from '../src/labNotifications.mjs';
test('notification categories use live review and schedule status names',()=>{
  assert.deepEqual(labNotificationCounts([{status:'待審查'},{status:'完成'}],{'未排程':11,'有衝突':3}),{pendingReview:1,unscheduled:11,conflicts:3});
});
test('missing or invalid schedule counts cannot produce NaN badges',()=>{
  assert.deepEqual(labNotificationCounts([],{'有衝突':NaN}),{pendingReview:0,unscheduled:0,conflicts:0});
});
