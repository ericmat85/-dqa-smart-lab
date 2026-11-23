import test from 'node:test';
import assert from 'node:assert/strict';
import {PROFILE_DEFAULTS,validateWorkspaceProfile,formatProfileDate} from '../src/workspaceProfile.mjs';
const profile={...PROFILE_DEFAULTS,workspaceName:'合成工作區'};
test('strict shared profile schema rejects secrets, missing values and invalid types',()=>{for(const bad of [{...profile,token:'secret'},{...profile,timeZone:'Mars'},{...profile,website:'javascript:alert(1)'},{...profile,labName:null},{...profile,email:'wrong'},{...profile,workspaceName:''}])assert.throws(()=>validateWorkspaceProfile(bad));assert.deepEqual(validateWorkspaceProfile(profile),profile);});
test('display timezone/date formats never modify source timestamp',()=>{const at='2026-01-02T00:00:00Z';assert.equal(formatProfileDate(at,profile),'2026/01/02');assert.equal(formatProfileDate(at,{...profile,timeZone:'America/New_York',dateFormat:'DD/MM/YYYY'}),'01/01/2026');assert.equal(at,'2026-01-02T00:00:00Z');assert.equal(formatProfileDate('invalid',profile),'—');});
