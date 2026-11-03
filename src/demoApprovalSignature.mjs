export function createDemoApprovalSignature(label='主管測試簽名（僅供流程測試）',{compact=false}={}) {
  const canvas = document.createElement('canvas');
  canvas.width = compact?320:600;
  canvas.height = compact?64:160;
  const context = canvas.getContext('2d');
  context.fillStyle = '#17365e';
  context.font = compact?'18px sans-serif':'28px sans-serif';
  context.fillText(label, compact?10:20, compact?38:85);
  return canvas.toDataURL('image/png');
}

