export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    keepalive: body !== undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && path !== 'login') window.location.assign('/login');
    throw new Error(data.error ?? 'Request failed');
  }
  return data;
}
export const write = (operation: string, payload: Record<string, unknown>) =>
  api('mutate', { operation, payload }).then((result) => {
    window.dispatchEvent(new Event('tazns:saved'));
    return result;
  });
