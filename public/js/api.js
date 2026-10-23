export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const options = { method, headers: { ...headers }, signal };
  if (body !== undefined) {
    if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      options.body = body;
      if (body instanceof Blob && body.type && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = body.type;
      }
    } else {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
    }
  }
  let response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new ApiError('Keine Verbindung zum lokalen StudyForge-Server. Läuft die Anwendung noch?', 0);
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    const message = (data && typeof data === 'object' && data.error) || `Anfrage fehlgeschlagen (${response.status}).`;
    throw new ApiError(message, response.status, data?.details);
  }
  return data;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  raw: request,
  upload(path, body, headers) {
    return request(path, { method: 'POST', body, headers });
  }
};

export function downloadFromApi(path) {
  const link = document.createElement('a');
  link.href = `/api${path}`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function qs(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}
