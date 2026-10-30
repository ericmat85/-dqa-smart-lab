import './CompanyBrandLogo.css';
// All page branding uses one asset; the supplied replacement can be installed here.
export const BRAND_LOGO_PATH='branding/colong-intellienergy-logo.jpg';
export default function CompanyBrandLogo({dark=false}){
 return <div className={`company-brand-logo${dark?' company-brand-logo-dark':''}`}><img src={`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="800" height="191" alt="COLONG IE Technology Co., Ltd."/></div>;
}
