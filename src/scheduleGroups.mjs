import {compareSchedulePriority} from './schedulingCalendar.mjs';
export function groupSchedulesByExecutor(rows,accounts) {
  const people=accounts.filter(account=>['實驗室工程師','實驗室副工程師'].includes(account.role));
  const groups=people.map(person=>({key:`account:${person.id}`,name:person.name,person,rows:[]}));
  const byId=new Map(groups.map(group=>[group.person.id,group]));
  for(const row of rows){
    let group=row.ownerId?byId.get(row.ownerId):null;
    if(!group&&!row.ownerId){
      const matches=groups.filter(item=>item.person&&item.name===row.owner);
      if(matches.length===1)group=matches[0];
    }
    if(!group){
      const key=row.ownerId?`legacy-id:${row.ownerId}`:row.owner?`legacy-name:${row.owner}`:'unassigned';
      group=groups.find(item=>item.key===key);
      if(!group){group={key,name:row.owner||'尚未指派',person:null,rows:[]};groups.push(group);}
    }
    group.rows.push(row);
  }
  return groups;
}
export function filterScheduleRows(rows,status,search) {
  const text=search.trim().toLowerCase();
  return rows.filter(row=>(status==='全部'||row.status===status)&&[row.requestId,row.id,row.productCode,row.sampleCode,row.title,row.eq,row.owner,row.department,row.requester,row.status].some(value=>String(value||'').toLowerCase().includes(text))).sort(compareSchedulePriority);
}
