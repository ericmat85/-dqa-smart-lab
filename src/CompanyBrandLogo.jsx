import './CompanyBrandLogo.css';
// One transparent brand asset shared by every portal, login page and sidebar.
export const BRAND_LOGO_PATH='branding/colong-ie-transparent.png';
export default function CompanyBrandLogo({dark=false,whiteText=false}){
 return <div className={`company-brand-logo${dark?' company-brand-logo-dark':''}${whiteText?' company-brand-logo-white':''}`}>{whiteText&&<svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs><filter id="lms-white-lettering" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1 -2 0 4 0 0 -2 0 4 0 0 0 0 0 1 0"/></filter></defs></svg>}<img className="company-brand-logo-image" src={`${import.meta.env.BASE_URL}${BRAND_LOGO_PATH}`} width="2169" height="725" alt="COLONG IE Technology Co., Ltd."/></div>;
}
