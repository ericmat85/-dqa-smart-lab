import test from 'node:test';
import assert from 'node:assert/strict';
import {APPEARANCE_DEFAULTS,APPEARANCE_PRESETS,validateWorkspaceAppearance,appearancePalette,colorContrast} from '../src/workspaceAppearance.mjs';
test('strict hex-only schema rejects arbitrary CSS, extra fields and missing colors',()=>{
 assert.deepEqual(validateWorkspaceAppearance({tabBarColor:'#abcdef',tableHeaderColor:'#d2dce8'}),{tabBarColor:'#ABCDEF',tableHeaderColor:'#D2DCE8'});
 for(const value of [null,[],{},'red',{...APPEARANCE_DEFAULTS,token:'x'},{tabBarColor:'#123',tableHeaderColor:'#D2DCE8'},{tabBarColor:'#123456',tableHeaderColor:null},{tabBarColor:'url(x)',tableHeaderColor:'#D2DCE8'},{tabBarColor:'#000000; color:red',tableHeaderColor:'#D2DCE8'}])assert.throws(()=>validateWorkspaceAppearance(value),/WORKSPACE_APPEARANCE_FIELDS_INVALID/);
});
test('neutral default and four presets have accessible automatically derived text in both themes',()=>{
 assert.equal(APPEARANCE_DEFAULTS.tableHeaderColor,'#D2DCE8');assert.equal(appearancePalette(APPEARANCE_DEFAULTS).headText,'#30465F');
 for(const preset of APPEARANCE_PRESETS)for(const dark of [false,true]){const p=appearancePalette(preset.configuration,dark);for(const [background,text] of [[p.active,p.activeText],[p.tab,p.tabText],[p.head,p.headText],[p.search,p.searchText],[p.search,p.placeholder]])assert.ok(colorContrast(background,text)>=4.5);}
});
test('extreme and arbitrary user colors remain readable without mutating saved colors',()=>{
 for(const r of ['00','40','80','C0','FF'])for(const g of ['00','60','C0','FF'])for(const b of ['00','80','FF'])for(const dark of [false,true]){const color='#'+r+g+b,configuration={tabBarColor:color,tableHeaderColor:color},p=appearancePalette(configuration,dark);for(const [background,text] of [[p.active,p.activeText],[p.tab,p.tabText],[p.head,p.headText],[p.search,p.searchText],[p.search,p.placeholder]])assert.ok(colorContrast(background,text)>=4.5,JSON.stringify({color,dark,p}));assert.equal(configuration.tableHeaderColor,color);}
});
