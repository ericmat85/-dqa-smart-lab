import './CompanyBrandLogo.css';
// One transparent brand asset shared by every portal, login page and sidebar.
export const BRAND_LOGO_PATH='branding/colong-ie-transparent.png';
export default function CompanyBrandLogo({dark=false,whiteText=false}){
 const lightLettering=dark||whiteText;
 return <div className={`company-brand-logo${dark?' company-brand-logo-dark':''}${lightLettering?' company-brand-logo-white':''}`}>
  <img className="company-brand-logo-image" src={`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="2169" height="725" alt="COLONG IE Technology Co., Ltd."/>
  {lightLettering&&<img className="company-brand-logo-image company-brand-logo-lettering" src={`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="2169" height="725" alt="" aria-hidden="true"/>}
 </div>;
}
