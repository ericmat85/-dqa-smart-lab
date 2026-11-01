export default function DashboardMetricIcon({kind}) {
  return <svg className="dashboard-metric-symbol" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind==='pending'&&<><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v4m10-4v4M3 9h18M7 13h4m-4 4h3"/><circle cx="16" cy="15.5" r="3"/><path d="M16 14v1.5l1 1"/></>}
    {kind==='running'&&<><path d="M9 3h6m-5 0v6l-5.8 9.5A2.3 2.3 0 0 0 6.2 22h11.6a2.3 2.3 0 0 0 2-3.5L14 9V3M7.5 14h9"/><path d="m9 17 2 1.5 3-3"/></>}
    {kind==='completed'&&<><rect x="5" y="4" width="14" height="17" rx="3"/><rect x="9" y="2" width="6" height="4" rx="1.5"/><path d="m8.5 13 2.5 2.5 4.5-5M9 18h6"/></>}
  </svg>;
}
