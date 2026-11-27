import {businessClient} from './businessClient.mjs';
import {businessIdentity,businessSessionVersion,resourceReference} from './originalBusiness.mjs';
import {validateTrialDetails} from './trialDefinitionDetails.mjs';
export async function loadTrialEditor(id){const ref=resourceReference('trial',id),actor=businessIdentity()?.member?.id,epoch=businessSessionVersion();if(!ref)throw Error('試驗項目已更新，請重新開啟。');const {data}=await businessClient.request('/resources/trial-details/'+ref.id);if(epoch!==businessSessionVersion()||actor!==businessIdentity()?.member?.id)throw Error('登入帳號已變更，請重新開啟。');if(data?.trial_id!==ref.id||data.revision!==ref.revision)throw Error('試驗項目已更新，請重新讀取目錄。');return validateTrialDetails(data.details);}
