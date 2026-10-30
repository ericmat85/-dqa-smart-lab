import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesRequestSearch} from '../src/requestListFilters.mjs';
test('history field search targets each displayed field and preserves decimal dates',()=>{
 const r={id:'REQ-001',productCode:'ABC',project:'新專案',testItems:['一般性能試驗'],requester:'王示範',dueDate:'2026-11-06'};
 for(const [field,query] of [['id','req-001'],['product','新專案'],['testItems','性能'],['requester','王'],['dueDate','2026-11']])assert.equal(matchesRequestSearch(r,query,field),true);
 assert.equal(matchesRequestSearch(r,'ABC','id'),false);
 assert.equal(matchesRequestSearch(r,'2026-11'),true);
 assert.equal(matchesRequestSearch({},''),true);
});
