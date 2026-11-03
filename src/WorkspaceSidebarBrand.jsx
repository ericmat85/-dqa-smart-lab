import CompanyBrandLogo from './CompanyBrandLogo.jsx';
import './WorkspaceSidebar.css';
export default function WorkspaceSidebarBrand({className=''}={}){
 return <div className={`workspace-sidebar-brand ${className}`}><CompanyBrandLogo dark whiteText/></div>;
}
