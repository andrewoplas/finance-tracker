import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityDateLabel} from '../lib/finance/date-label';
import {manilaToday} from '../lib/finance/core';
test('activity labels use Manila date-only boundaries, including year and leap transitions',()=>{
 const today=manilaToday(new Date('2026-12-31T16:01:00Z'));
 assert.equal(today,'2027-01-01');assert.equal(activityDateLabel(today,today),'Today');
 assert.equal(activityDateLabel('2026-12-31',today),'Yesterday');
 assert.equal(activityDateLabel('2024-02-29','2024-03-01'),'Yesterday');
 assert.notEqual(activityDateLabel('2026-10-01','2026-10-06'),'Yesterday');
});
