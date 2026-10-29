type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class SessionChangedError extends Error {
  constructor() { super('登录账号已切换，请等待页面刷新后继续操作'); }
}

/** Keep every request in this page tied to the identity its UI was loaded for. */
export function createSessionBinding(storage: TokenStorage, onExternalChange: () => void) {
  let boundToken = storage.getItem('token');
  let invalidated = false;
  function storageChanged() {
    if (storage.getItem('token') !== boundToken && !invalidated) {
      invalidated = true;
      onExternalChange();
    }
  }
  function token() {
    storageChanged();
    if (invalidated) throw new SessionChangedError();
    return boundToken;
  }
  return {
    token,
    setToken(nextToken: string | null) {
      token();
      if (nextToken === null) storage.removeItem('token');
      else storage.setItem('token', nextToken);
      boundToken = nextToken;
    },
    storageChanged,
    assertCurrent(requestToken: string | null) {
      if (token() !== requestToken) throw new SessionChangedError();
    },
  };
}

export const session = createSessionBinding({
  getItem: key => typeof localStorage === 'undefined' ? null : localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: key => localStorage.removeItem(key),
}, () => location.reload());

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
  if (event.key === 'token' || event.key === null) session.storageChanged();
});
