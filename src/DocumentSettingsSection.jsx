import './DocumentSettingsSection.css';
export default function DocumentSettingsSection({title,description,defaultOpen=false,children}){
 return <details className="document-settings-section" open={defaultOpen} role="group" aria-label={title}><summary role="button" aria-label={title}><div><h3>{title}</h3>{description&&<p>{description}</p>}</div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></summary><div className="document-settings-section-body">{children}</div></details>;
}
