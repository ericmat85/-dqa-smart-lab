export const ACCESS_PERMISSIONS=[['members.read','查看工作區人員'],['catalog.read','查看試驗目錄'],['equipment.read','查看設備'],['materials.read','查看物料'],['requests.read_all','查看全部委託'],['schedules.read_all','查看全部排程'],['reports.read_all','查看全部報告'],['quality.read','查看品質資料'],['qualifications.read','查看人員資格'],['audit.read','查看稽核紀錄'],['settings.read','查看設備端口設定'],['requests.draft','建立及修改自己的委託草稿']];
export const ACCESS_SYSTEMS=[['lms','實驗室管理系統'],['lab','實驗室系統'],['request','電子委託系統']];
export const ACCESS_PAGES=[['dashboard','儀表板'],['requests','試驗委託'],['schedule','排程管理'],['equipment','設備管理'],['maintenance','物料管理'],['reports','報表分析'],['archive','資料庫'],['settings','系統管理']];
export const roleData=r=>({name:r.name,enabled:r.enabled,is_tenant_admin:r.is_tenant_admin,permissions:r.permissions,systems:r.systems,pages:r.pages,review_level:r.review_level});
export const memberData=m=>({name:m.name,email:m.email,role_id:m.role_id,department:m.department,supervisor_id:m.supervisor_id||null,enabled:m.enabled});
