export default function RequestProgress({ status }) {
  if(status==='取消')return <section className="rq-detail-section rq-progress-section"><h3>簽核流程</h3><p>委託已取消，相關試驗排程已中止。</p></section>;
  return (<section className="rq-detail-section rq-progress-section"><h3>簽核流程</h3><ol className="rq-progress-steps" aria-label="簽核流程">{(() => {
          
          const rank = status === '草稿' || status === '退件' || status === '補件中' ? 0 : status === '待主管簽核' || status === '待簽核' ? 1 : ['已核准','待審查','待排程','待確認','已排程','執行中','試驗中'].includes(status) ? 2 : ['已完成','待審核','待查閱','已結案'].includes(status) ? 3 : -1;
          const labels = ['委託者建立委託單','主管簽核','實驗室受理與排程','試驗完成／報告'];
          return labels.map((label, index) => { const complete = rank >= 0 && (index < rank || (index === 3 && status === '已結案')); const active = rank === index && !complete; return <li key={label} className={`rq-progress-step ${complete ? 'is-complete' : active ? 'is-current' : ''}`} aria-current={active ? 'step' : undefined}><span className="rq-progress-dot" aria-hidden="true">{complete ? '✓' : index + 1}</span><span className="rq-progress-label">{label}</span><small>{complete ? '已完成' : active ? (status === '退件' || status === '補件中' ? '待補件' : status === '草稿' ? '草稿' : status==='已完成'?'試驗已完成':'進行中') : '尚未開始'}</small></li>; });
        })()}</ol></section>);
}
