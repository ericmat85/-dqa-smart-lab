export function createDemoApprovalSignature(label='主管測試簽名（僅供流程測試）') {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  context.fillStyle = '#17365e';
  context.font = '28px sans-serif';
  context.fillText(label, 20, 85);
  return canvas.toDataURL('image/png');
}

