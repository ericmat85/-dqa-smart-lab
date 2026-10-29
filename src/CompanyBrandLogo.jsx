import './CompanyBrandLogo.css';
export default function CompanyBrandLogo({dark=false}){
 return <div className="company-brand-logo"><img src={`${import.meta.env.BASE_URL}branding/${dark?'colong-sidebar-transparent.png':'colong-intellienergy-logo.jpg'}`} width={dark?676:800} height={dark?150:191} alt="COLONG IntelliEnergy Technology Co., Ltd."/></div>;
}
