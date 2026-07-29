const BASE_URL = "http://localhost:5050/api/v1";

// A single wrapper around fetch that:
//  - prepends the base URL
//  - sets JSON headers
//  - attaches the auth token if we have one
//  - parses the JSON response and throws on errors

async function request(endpoint, {method = 'GET', body, token } = {}) {
    const headers = {'Content-Type': 'application/json'};

    // if a token was passed, attach it way our 'Protect' middleware expects.
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {method, headers}
    if (body) {
        config.body = JSON.stringify(body); // JS object -> JSON string for the wire

    }

    const res = await fetch(`${BASE_URL}${endpoint}`, config);
    const data = await res.json(); // parse the JSON response into a JS object

    // Our Server returns {error: {code, message}} with a non-2xx status on failure.
    if (!res.ok) {
        // Surface the server's message so the UI can show it.
        throw new Error(data?.error?.message || 'Something went wrong');
    }

    return data;
}

export const authApi = {
    register: (name, email, password) =>
        request('/auth/register', {
            method: 'POST',
            body: { name, email, password }
        }),

    login: (email, password) =>
        request('/auth/login', {
            method: 'POST',
            body: { email, password }
        }),

    getMe: (token) =>
        request('/auth/me', {
            token
        }),
}

export const boardApi = {
  list: (token) =>
    request('/boards', { token }),

  getOne: (boardId, token) =>
    request(`/boards/${boardId}`, { token }),

  create: (name, token, { emoji, color } = {}) =>
    request('/boards', { method: 'POST', body: { name, emoji, color }, token }),

  createList: (boardId, title, position, token) =>
    request(`/boards/${boardId}/lists`, { method: 'POST', body: { title, position }, token }),

  createCard: (boardId, title, listId, position, token) =>
    request(`/boards/${boardId}/cards`, { method: 'POST', body: { title, listId, position }, token }),

  // Partial update — pass any of { title, position, list } for a card.
  // Used by drag & drop to persist a card's new order / column.
  updateCard: (boardId, cardId, updates, token) =>
    request(`/boards/${boardId}/cards/${cardId}`, { method: 'PATCH', body: updates, token }),

  // Partial update — pass any of { title, position } for a list.
  updateList: (boardId, listId, updates, token) =>
    request(`/boards/${boardId}/lists/${listId}`, { method: 'PATCH', body: updates, token }),
}

