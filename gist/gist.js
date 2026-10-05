(() => {
  'use strict';

  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = local ? `http://${location.hostname}:8081/api/v1/gist` : 'https://api-sirrista-singapore.com/api/v1/gist';
  const STORAGE_KEY = 'hudson.gist.session.v1';
  const $ = (id) => document.getElementById(id);
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
  let session = null;
  let items = [];
  let loading = false;
  let complete = false;
  let loadController = null;
  let expiryTimer = null;
  let previewController = null;
  let selectedId = null;
  let previewData = null;
  let rawView = false;
  const shortDate = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const title = (gist) => gist.description || (gist.files[0] && gist.files[0].filename) || 'Không có mô tả';

  function storedSession() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
      const remaining = Date.parse(value && value.expiresAt) - Date.now();
      return value && /^[0-9a-f]{64}$/.test(value.sessionId) && remaining > 0 && remaining <= 2 * 24 * 60 * 60 * 1000 ? value : null;
    } catch (_) {
      return null;
    }
  }

  function lock(message = '', removeStored = true) {
    if (loadController) loadController.abort();
    clearTimeout(expiryTimer);
    resetPreview();
    document.body.classList.add('locked');
    $('login-panel').querySelector('.login-card').append($('message'));
    session = null;
    items = [];
    loading = false;
    complete = false;
    $('gists').replaceChildren();
    $('count').textContent = '';
    $('expiry').textContent = '';
    $('library').hidden = true;
    $('logout').hidden = true;
    $('login-panel').hidden = false;
    $('code').value = '';
    $('message').textContent = message;
    if (removeStored) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* Storage may be disabled. */ }
    }
  }

  function unlock(value) {
    session = value;
    document.body.classList.remove('locked');
    $('library').before($('message'));
    $('login-panel').hidden = true;
    $('library').hidden = false;
    $('logout').hidden = false;
    $('expiry').textContent = `Hết hạn: ${dateFormat.format(new Date(value.expiresAt))}`;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => lock('Phiên đã hết hạn. Nhập mã để mở lại.'), Math.max(0, Date.parse(value.expiresAt) - Date.now()));
  }

  async function api(path, { method = 'GET', body, signal, sessionId } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      signal.addEventListener('abort', abort, { once: true });
    }
    const timeout = setTimeout(abort, 20000);
    try {
      const headers = { Accept: 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (sessionId) headers.Authorization = `Bearer ${sessionId}`;
      const response = await fetch(API + path, {
        method, headers, body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      const data = response.status === 204 ? {} : await response.json();
      if (!response.ok) {
        const error = new Error('API request failed');
        error.code = data.error;
        error.remaining = data.remainingAttempts;
        throw error;
      }
      return data;
    } finally {
      clearTimeout(timeout);
      if (signal) signal.removeEventListener('abort', abort);
    }
  }

  function errorMessage(error) {
    if (error.code === 'gist_ip_blocked') return 'IP này đã bị chặn. Cần xóa record blacklist trong database để mở lại.';
    if (error.code === 'gist_session_expired') return 'Phiên đã hết hạn hoặc không còn hợp lệ. Nhập mã để mở lại.';
    if (error.code === 'invalid_gist_code') return `Mã không đúng. Còn ${Number(error.remaining)} lần nhập sai trước khi IP bị chặn.`;
    if (error.code === 'gist_not_configured') return 'Backend chưa được cấu hình mã truy cập hoặc GitHub token.';
    if (error.code === 'gist_upstream_unavailable') return 'Chưa tải được gist từ GitHub. Thử lại hoặc mở trên GitHub.';
    if (error.code === 'gist_origin_rejected') return 'Domain này chưa được phép truy cập Gist API.';
    return 'Request không hoàn tất. Nếu vừa nhập mã, lần nhập đó có thể đã được backend tính; không tự động thử lại.';
  }

  function text(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  }

  const normalize = (value) => String(value || '').normalize('NFC').toLocaleLowerCase('vi');
  const languages = (gist) => [...new Set(gist.files.map((file) => file.language || 'Không rõ'))];

  function updateLanguages() {
    const selected = $('language').value;
    const options = new Set(items.flatMap(languages));
    $('language').replaceChildren(new Option('Tất cả', 'all'));
    [...options].sort().forEach((language) => $('language').add(new Option(language, language)));
    $('language').value = options.has(selected) ? selected : 'all';
  }

  function render() {
    if (!session) return;
    const query = normalize($('search').value.trim());
    const visibility = $('visibility').value;
    const language = $('language').value;
    const filtered = items.filter((gist) => {
      const searchable = normalize([gist.description, ...gist.files.map((file) => file.filename)].join(' '));
      return searchable.includes(query) &&
        (visibility === 'all' || gist.public === (visibility === 'public')) &&
        (language === 'all' || languages(gist).includes(language));
    }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const fragment = document.createDocumentFragment();
    filtered.forEach((gist) => {
      const row = text('button', '', 'gist');
      row.type = 'button';
      row.dataset.id = gist.id;
      row.setAttribute('aria-current', String(gist.id === selectedId));
      row.append(text('span', title(gist), 'gist-title'));
      row.append(text('span', gist.files.map((file) => file.filename).join(', '), 'gist-file'));
      const meta = text('span', '', 'gist-meta');
      meta.append(text('span', `${gist.public ? 'Public' : 'Secret'} · ${gist.files.length} file`));
      const date = new Date(gist.updatedAt);
      if (!Number.isNaN(date.getTime())) meta.append(text('span', shortDate.format(date)));
      row.append(meta);
      row.addEventListener('click', () => selectGist(gist));
      fragment.append(row);
    });
    $('gists').replaceChildren(fragment);
    $('count').textContent = `${filtered.length} / ${items.length} gist${complete ? '' : ' đã tải (chưa đầy đủ)'}`;
    $('empty').hidden = filtered.length > 0 || loading;
  }

  function resetPreview() {
    if (previewController) previewController.abort();
    selectedId = null;
    previewData = null;
    $('library').classList.remove('has-selection');
    $('preview-empty').hidden = false;
    $('preview-detail').hidden = true;
    $('preview-content').replaceChildren();
    $('preview-content').removeAttribute('aria-busy');
    $('file-select').replaceChildren();
    $('preview-title').textContent = '';
    $('preview-meta').textContent = '';
    $('preview-status').textContent = '';
    $('gist-source').removeAttribute('href');
  }

  function markdownPreview(content) {
    // Parse in an inert template, then copy ONLY allowed elements into the live DOM.
    // Never insert raw Markdown HTML, images, styles or event attributes.
    const template = document.createElement('template');
    template.innerHTML = marked(content, { headerIds: false, mangle: false });
    const allowed = new Set('P BR HR H1 H2 H3 H4 H5 H6 STRONG EM DEL BLOCKQUOTE PRE CODE UL OL LI A TABLE THEAD TBODY TR TH TD'.split(' '));
    function copy(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'SVG', 'MATH', 'TEMPLATE'].includes(node.tagName)) return;
      let target = parent;
      if (allowed.has(node.tagName)) {
        target = document.createElement(node.tagName.toLowerCase());
        if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
          target.href = node.getAttribute('href');
          target.target = '_blank';
          target.rel = 'noopener noreferrer';
        }
        parent.append(target);
      }
      node.childNodes.forEach((child) => copy(child, target));
    }
    const result = text('div', '', 'markdown');
    template.content.childNodes.forEach((node) => copy(node, result));
    return result;
  }

  function showFile() {
    if (!previewData) return;
    const file = previewData.files[Number($('file-select').value)];
    const container = $('preview-content');
    container.replaceChildren();
    if (!file) return;
    const markdown = file.language === 'Markdown' || /\.(md|markdown)$/i.test(file.filename);
    $('view-source').hidden = !markdown;
    $('view-source').setAttribute('aria-pressed', String(rawView));
    $('view-source').textContent = rawView ? 'Bản đọc' : 'Mã nguồn';
    $('preview-status').textContent = file.truncated ? 'File lớn: chỉ hiển thị một phần. Mở GitHub để xem đầy đủ.' : '';
    if (markdown && !rawView) {
      container.append(markdownPreview(file.content || ''));
    } else {
      const pre = document.createElement('pre');
      pre.append(text('code', file.content || '(File trống hoặc không có bản xem trước dạng text)'));
      container.append(pre);
    }
    container.scrollTop = 0;
  }

  async function selectGist(gist) {
    if (!session) return;
    if (Date.parse(session.expiresAt) <= Date.now()) return lock('Phiên đã hết hạn. Nhập mã để mở lại.');
    $('library').classList.add('has-selection');
    if (selectedId === gist.id && previewData) return;
    if (previewController) previewController.abort();
    const controller = new AbortController();
    previewController = controller;
    const sessionId = session.sessionId;
    selectedId = gist.id;
    previewData = null;
    rawView = false;
    document.querySelectorAll('.gist').forEach((row) => row.setAttribute('aria-current', String(row.dataset.id === selectedId)));
    $('preview-empty').hidden = true;
    $('preview-detail').hidden = false;
    $('preview-title').textContent = title(gist);
    $('preview-meta').textContent = `${gist.public ? 'Public' : 'Secret'} · Cập nhật ${dateFormat.format(new Date(gist.updatedAt))}`;
    $('gist-source').removeAttribute('href');
    if (/^https:\/\/gist\.github\.com\/[0-9a-f]+$/.test(gist.url)) $('gist-source').href = gist.url;
    $('file-bar').hidden = true;
    $('preview-content').replaceChildren();
    $('preview-content').setAttribute('aria-busy', 'true');
    $('preview-status').textContent = 'Đang tải nội dung…';
    try {
      const data = await api(`/${encodeURIComponent(gist.id)}`, { sessionId, signal: controller.signal });
      if (controller.signal.aborted || !session || session.sessionId !== sessionId) return;
      if (!Array.isArray(data.files)) throw new Error('Invalid file list');
      previewData = data;
      $('file-select').replaceChildren();
      data.files.forEach((file, index) => $('file-select').add(new Option(file.filename, String(index))));
      $('file-bar').hidden = data.files.length === 0;
      $('preview-status').textContent = data.files.length ? '' : 'Gist không có file để hiển thị.';
      showFile();
    } catch (error) {
      if (controller.signal.aborted || !session || session.sessionId !== sessionId) return;
      if (['gist_ip_blocked', 'gist_session_expired'].includes(error.code)) lock(errorMessage(error));
      else $('preview-status').textContent = errorMessage(error);
    } finally {
      if (previewController === controller) $('preview-content').setAttribute('aria-busy', 'false');
    }
  }

  async function load() {
    if (!session) return;
    if (Date.parse(session.expiresAt) <= Date.now()) {
      lock('Phiên đã hết hạn. Nhập mã để mở lại.');
      return;
    }
    if (loadController) loadController.abort();
    const controller = new AbortController();
    loadController = controller;
    const sessionId = session.sessionId;
    resetPreview();
    items = [];
    complete = false;
    loading = true;
    $('refresh').disabled = true;
    $('gists').setAttribute('aria-busy', 'true');
    $('message').textContent = 'Đang tải danh sách gist…';
    render();
    try {
      let page = 1;
      const seen = new Set();
      while (page) {
        const data = await api(`?page=${page}`, { signal: controller.signal, sessionId });
        if (controller.signal.aborted || !session || session.sessionId !== sessionId) return;
        if (!Array.isArray(data.gists)) throw new Error('Invalid gist list');
        data.gists.forEach((gist) => {
          if (!Array.isArray(gist.files)) throw new Error('Invalid file list');
          if (!seen.has(gist.id)) {
            seen.add(gist.id);
            items.push(gist);
          }
        });
        if (data.nextPage != null && data.nextPage !== page + 1) throw new Error('Invalid pagination');
        page = data.nextPage || null;
        complete = !page;
        updateLanguages();
        render();
        $('message').textContent = page ? `Đã tải ${items.length} gist, đang lấy trang tiếp theo…` : '';
      }
    } catch (error) {
      if (controller.signal.aborted || !session || session.sessionId !== sessionId) return;
      if (['gist_ip_blocked', 'gist_session_expired'].includes(error.code)) lock(errorMessage(error));
      else $('message').textContent = errorMessage(error);
    } finally {
      if (loadController === controller) {
        loading = false;
        $('refresh').disabled = false;
        $('gists').setAttribute('aria-busy', 'false');
        render();
      }
    }
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if ($('login-button').disabled) return;
    const code = $('code').value;
    if (!/^[0-9]{6}$/.test(code)) return;
    $('login-button').disabled = true;
    $('code').value = '';
    $('message').textContent = 'Đang kiểm tra…';
    try {
      const value = await api('/session', { method: 'POST', body: { gistCode: code } });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch (_) {
        await api('/session', { method: 'DELETE', sessionId: value.sessionId });
        $('message').textContent = 'Trình duyệt đang chặn localStorage. Cho phép lưu trữ rồi mở lại.';
        return;
      }
      unlock(value);
      await load();
    } catch (error) {
      $('message').textContent = errorMessage(error);
    } finally {
      $('login-button').disabled = false;
    }
  });

  $('logout').addEventListener('click', async () => {
    if (!session) return;
    const sessionId = session.sessionId;
    lock('Đã khóa.');
    try {
      await api('/session', { method: 'DELETE', sessionId });
    } catch (error) {
      if (!session && !['gist_session_expired', 'gist_ip_blocked'].includes(error.code)) {
        $('message').textContent = 'Đã khóa trên trình duyệt nhưng chưa xác nhận hủy phiên ở server. Phiên cũ vẫn tự hết hạn theo thời điểm đã cấp.';
      }
    }
  });

  $('file-select').addEventListener('change', () => { rawView = false; showFile(); });
  $('view-source').addEventListener('click', () => { rawView = !rawView; showFile(); });
  $('back-to-list').addEventListener('click', () => {
    $('library').classList.remove('has-selection');
    const selected = document.querySelector('.gist[aria-current="true"]');
    if (selected) selected.focus();
  });
  $('refresh').addEventListener('click', load);
  $('search').addEventListener('input', render);
  $('visibility').addEventListener('change', render);
  $('language').addEventListener('change', render);

  function resume() {
    const saved = storedSession();
    if (!saved) {
      lock(session ? 'Phiên đã hết hạn hoặc đã được khóa ở tab khác.' : '');
    } else if (!session || session.sessionId !== saved.sessionId) {
      unlock(saved);
      load();
    } else if (Date.parse(session.expiresAt) <= Date.now()) {
      lock('Phiên đã hết hạn. Nhập mã để mở lại.');
    }
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) resume();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      lock('', false);
      resume();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
  resume();
})();
