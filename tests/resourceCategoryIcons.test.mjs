import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceCategoryIcon} from '../src/resourceCategoryIcons.mjs';
test('equipment categories distinguish their physical meaning, especially humidity and temperature',()=>{assert.deepEqual(['機械試驗','溫濕度試驗','溫度試驗','量測觀察','防護試驗','腐蝕試驗','電性試驗','耐候試驗'].map(n=>resourceCategoryIcon(n,'設備')),['mechanical','temperature-humidity','temperature','measurement','protection','corrosion','electrical','weather']);assert.equal(resourceCategoryIcon('温湿度测试','設備'),'temperature-humidity');});
test('materials use inspection, fixtures, tools, supplies and instruments rather than equipment symbols',()=>{assert.deepEqual(['完檢機','治具配件','工具','物料耗材','輔助儀器'].map(n=>resourceCategoryIcon(n,'物料')),['inspection','fixtures','tools','consumables','instruments']);});
test('unknown or missing categories keep a valid icon for their resource family',()=>{for(const n of [null,'','自訂分類']){assert.equal(resourceCategoryIcon(n,'物料'),'consumables');assert.equal(resourceCategoryIcon(n,'設備'),'equipment');}});
