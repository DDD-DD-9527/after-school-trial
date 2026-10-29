type Kind = 'success' | 'error' | 'info';

export function toast(message: string, kind: Kind = 'info') {
  const el = document.createElement('div');
  el.textContent = message;
  const color = kind === 'success' ? '#12b76a' : kind === 'error' ? '#f04438' : '#1f2329';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    top: '24px',
    transform: 'translateX(-50%)',
    background: '#fff',
    color,
    border: '1px solid #e5e6eb',
    boxShadow: '0 8px 24px rgba(0,0,0,.12)',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '9999',
    maxWidth: '80vw',
    textAlign: 'center',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
