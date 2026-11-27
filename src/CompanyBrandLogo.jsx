import './CompanyBrandLogo.css';
import {DEFAULT_LOGO_PATH,DEFAULT_LOGO_NAME} from './defaultWorkspaceLogo.mjs';
import {useWorkspaceImages} from './workspaceImagesContext.mjs';
// One transparent brand asset shared by every portal, login page and sidebar.
export const BRAND_LOGO_PATH=DEFAULT_LOGO_PATH;
export default function CompanyBrandLogo({dark=false,whiteText=false,image,name}){
 const saved=useWorkspaceImages()?.data?.images?.logo,custom=image===undefined?saved?.image:image,official=custom&&(name??saved?.name)===DEFAULT_LOGO_NAME;
 if(custom&&!official)return <div className="company-brand-logo company-brand-logo-custom"><img className="company-brand-logo-image" src={custom} alt="公司標誌"/></div>;
 const lightLettering=dark||whiteText;
 return <div className={`company-brand-logo${dark?' company-brand-logo-dark':''}${lightLettering?' company-brand-logo-white':''}`}>
  <img className="company-brand-logo-image" src={custom||`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="2169" height="725" alt="COLONG IE Technology Co., Ltd."/>
  {lightLettering&&<img className="company-brand-logo-image company-brand-logo-lettering" src={custom||`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="2169" height="725" alt="" aria-hidden="true"/>}
 </div>;
}
