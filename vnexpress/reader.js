(() => {
  const root = document.querySelector('#vne-reader');
  if (!root) return;

  const endpoint = 'https://api-sirrista-singapore.com/api/v1/vnexpress/rss';
  const categories = {
    'tin-noi-bat': 'Tin nổi bật',
    'thoi-su': 'Thời sự',
    'the-gioi': 'Thế giới',
    'kinh-doanh': 'Kinh doanh',
    'phap-luat': 'Pháp luật',
    'khoa-hoc-cong-nghe': 'Khoa học công nghệ',
    'bat-dong-san': 'Bất động sản',
    'gia-dinh': 'Đời sống'
  };
  const list = root.querySelector('#vne-articles');
  const front = root.querySelector('#vne-front');
  const status = root.querySelector('#vne-status');
  const error = root.querySelector('#vne-error');
  const refresh = root.querySelector('#vne-refresh');
  const sectionTitle = root.querySelector('#vne-section-title');
  const detail = root.querySelector('#vne-detail');
  const detailTitle = root.querySelector('#vne-detail-title');
  const detailSource = root.querySelector('#vne-detail-source');
  const detailCategory = root.querySelector('#vne-detail-category');
  const detailMeta = root.querySelector('#vne-detail-meta');
  const detailDescription = root.querySelector('#vne-detail-description');
  const detailStatus = root.querySelector('#vne-detail-status');
  const detailBody = root.querySelector('#vne-detail-body');
  const related = root.querySelector('#vne-related');
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  let articles = [];
  let fetchedAt = '';
  let loading = false;
  let loaded = false;
  let currentCategory = 'tin-noi-bat';
  let renderedCategory = null;
  let currentHash = null;
  let activeArticle = null;
  let detailRequest = null;

  root.querySelector('#vne-today').textContent = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric'
  }).format(new Date());
  history.scrollRestoration = 'manual';

  function formatDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : '';
  }

  function safeUrl(value, image = false) {
    try {
      const url = new URL(value);
      const allowedHost = image ? url.hostname.endsWith('.vnecdn.net') : url.hostname === 'vnexpress.net';
      return url.protocol === 'https:' && allowedHost && !url.username && !url.password && !url.port ? url.href : null;
    } catch {
      return null;
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function categoryHash(id) {
    return id === 'tin-noi-bat' ? '#' : `#category/${id}`;
  }

  function categoryName(id) {
    return id === 'all' ? 'Tất cả' : categories[id];
  }

  function articleLink(article) {
    const link = element('a');
    // Modified clicks still open the original source, not a duplicate reader tab.
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.articleUrl = article.url;
    return link;
  }

  function card(article, { hero = false, brief = false, heading = 'h2' } = {}) {
    const node = element('article', `vne-card${hero ? ' vne-hero' : ''}`);
    const imageUrl = !brief && safeUrl(article.imageUrl, true);
    if (imageUrl) {
      const link = articleLink(article);
      link.className = 'vne-image-link';
      link.setAttribute('aria-label', article.title);
      const image = element('img', 'vne-thumbnail');
      image.alt = '';
      image.loading = hero ? 'eager' : 'lazy';
      image.decoding = 'async';
      image.width = 600;
      image.height = 360;
      image.referrerPolicy = 'no-referrer';
      image.src = imageUrl;
      image.addEventListener('error', () => {
        link.remove();
        node.classList.add('vne-no-image');
      }, { once: true });
      link.append(image);
      node.append(link);
    } else {
      node.classList.add('vne-no-image');
    }
    const text = element('div', 'vne-card-text');
    const title = element(heading);
    const link = articleLink(article);
    link.textContent = article.title;
    title.append(link);
    text.append(title);
    if (!brief && article.description) text.append(element('p', 'vne-description', article.description));
    text.append(element('p', 'vne-meta', [categories[article.category], formatDate(article.publishedAt)].filter(Boolean).join(' · ')));
    node.append(text);
    return node;
  }

  function sectionHeading(name, category, tag = 'h2') {
    const heading = element(tag, 'vne-section-heading');
    const label = element(category ? 'a' : 'span', '', name);
    if (category) label.href = categoryHash(category);
    heading.append(label);
    return heading;
  }

  function render() {
    const home = currentCategory === 'tin-noi-bat';
    const visible = articles.filter(article => home ? article.featured === true
      : currentCategory === 'all' || article.category === currentCategory);
    const fragment = document.createDocumentFragment();
    if (visible.length) {
      fragment.append(card(visible[0], { hero: true }));
      const top = element('div', 'vne-top-stories');
      visible.slice(1, 4).forEach(article => top.append(card(article)));
      if (top.childElementCount) fragment.append(top);
    } else {
      fragment.append(element('p', 'vne-empty', 'Chưa có tin trong mục này. Bạn có thể chọn chuyên mục khác hoặc tải lại.'));
    }

    if (home) {
      const columns = element('div', 'vne-news-columns');
      const stream = element('section', 'vne-stream');
      stream.append(sectionHeading('Tiếp dòng tin nổi bật'));
      visible.slice(4).forEach(article => stream.append(card(article, { heading: 'h3' })));
      if (visible.length <= 4) stream.append(element('p', 'vne-empty', 'Bạn đã xem hết tin nổi bật. Đọc tiếp theo chuyên mục.'));
      const sections = element('div', 'vne-sections');
      for (const id of Object.keys(categories).slice(1)) {
        const items = articles.filter(article => article.category === id).slice(0, 3);
        if (!items.length) continue;
        const section = element('section', 'vne-category-section');
        section.append(sectionHeading(categories[id], id), card(items[0], { heading: 'h3' }));
        const briefs = element('div', 'vne-section-briefs');
        items.slice(1).forEach(article => briefs.append(card(article, { brief: true, heading: 'h3' })));
        if (briefs.childElementCount) section.append(briefs);
        const more = element('a', 'vne-more', `Xem thêm ${categories[id]} →`);
        more.href = categoryHash(id);
        section.append(more);
        sections.append(section);
      }
      columns.append(stream, sections);
      fragment.append(columns);
    } else if (visible.length > 4) {
      const stream = element('div', 'vne-stream vne-category-stream');
      visible.slice(4).forEach(article => stream.append(card(article)));
      fragment.append(stream);
    }
    list.replaceChildren(fragment);
    renderedCategory = currentCategory;
    status.textContent = `${visible.length} bài · Cập nhật ${fetchedAt}`;
  }

  function renderRelated(article) {
    related.replaceChildren();
    const items = articles.filter(item => item.category === article.category && item.url !== article.url).slice(0, 3);
    related.hidden = !items.length;
    if (!items.length) return;
    related.append(sectionHeading('Đọc tiếp cùng chuyên mục', article.category));
    const grid = element('div', 'vne-top-stories');
    items.forEach(item => grid.append(card(item, { heading: 'h3' })));
    related.append(grid);
  }

  function restoreScroll(top) {
    const hash = currentHash;
    requestAnimationFrame(() => {
      if (hash === currentHash) window.scrollTo({ top, behavior: 'instant' });
    });
  }

  async function openArticle(article, scrollTop) {
    const controller = new AbortController();
    detailRequest = controller;
    activeArticle = article;
    const timer = setTimeout(() => controller.abort(), 15000);
    detailTitle.textContent = article.title || 'Đang tải bài viết…';
    detailSource.href = article.url;
    detailSource.textContent = article.url;
    detailCategory.textContent = categories[article.category] || 'Tin tức';
    detailCategory.href = categoryHash(article.category || currentCategory);
    detailMeta.textContent = formatDate(article.publishedAt);
    detailDescription.textContent = article.description || '';
    detailBody.replaceChildren();
    detailBody.setAttribute('aria-busy', 'true');
    detailStatus.hidden = false;
    detailStatus.textContent = 'Đang tải nội dung bài viết…';
    renderRelated(article);
    detailTitle.focus({ preventScroll: true });
    restoreScroll(0);
    document.title = `${article.title || 'Đọc bài'} · Góc đọc`;

    try {
      const url = new URL('article', endpoint);
      url.searchParams.set('url', article.url);
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (detailRequest !== controller) return;
      if (typeof data.contentHtml !== 'string' || !data.contentHtml.trim()) throw new Error('Missing article content');
      detailTitle.textContent = data.title || article.title || 'Bài viết VnExpress';
      detailDescription.textContent = data.description || '';
      // Only the backend's allowlist-sanitized body is inserted, never the full source page.
      detailBody.innerHTML = data.contentHtml;
      detailStatus.hidden = true;
      document.title = `${detailTitle.textContent} · Góc đọc`;
      if (scrollTop) restoreScroll(scrollTop);
    } catch {
      if (detailRequest === controller) {
        detailStatus.textContent = 'Chưa đọc được bài này tại đây. ';
        const fallback = element('a', '', 'Đọc trên VnExpress ↗');
        fallback.href = article.url;
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        detailStatus.append(fallback);
      }
    } finally {
      clearTimeout(timer);
      if (detailRequest === controller) detailBody.setAttribute('aria-busy', 'false');
    }
  }

  function syncRoute() {
    currentHash = location.hash;
    detailRequest?.abort();
    detailRequest = null;
    const state = history.state?.vne ? history.state : {};
    const scrollTop = Number.isFinite(state.scroll) ? state.scroll : 0;
    let articleUrl = null;
    if (currentHash.startsWith('#article/')) {
      try { articleUrl = safeUrl(decodeURIComponent(currentHash.slice(9))); } catch { /* Invalid route falls back to the list. */ }
    }
    if (articleUrl) {
      front.hidden = true;
      detail.hidden = false;
      if (state.category && (state.category === 'all' || Object.hasOwn(categories, state.category))) currentCategory = state.category;
      const article = articles.find(item => item.url === articleUrl) || { url: articleUrl };
      openArticle(article, scrollTop);
    } else {
      activeArticle = null;
      detail.hidden = true;
      front.hidden = false;
      const id = currentHash.startsWith('#category/') ? currentHash.slice(10) : 'tin-noi-bat';
      currentCategory = id === 'all' || Object.hasOwn(categories, id) ? id : 'tin-noi-bat';
      sectionTitle.textContent = categoryName(currentCategory);
      document.title = `${categoryName(currentCategory)} · Góc đọc của Hudson`;
      if (loaded && renderedCategory !== currentCategory) render();
      sectionTitle.focus({ preventScroll: true });
      restoreScroll(scrollTop);
    }
    for (const link of root.querySelectorAll('[data-category]')) {
      if (link.dataset.category === (activeArticle?.category || currentCategory)) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }

  function navigate(hash) {
    if ((location.hash || '#') === hash) return;
    // Keep only navigation position, never article contents, in browser history.
    history.replaceState({ ...history.state, vne: true, scroll: window.scrollY, category: currentCategory }, '');
    const listDepth = hash.startsWith('#article/')
      ? (activeArticle ? (history.state?.listDepth ? history.state.listDepth + 1 : 0) : 1) : 0;
    history.pushState({ vne: true, scroll: 0, category: currentCategory, listDepth }, '', hash);
    syncRoute();
  }

  root.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a');
    if (!link) return;
    if (link.classList.contains('vne-back')) {
      event.preventDefault();
      if (history.state?.vne && history.state.listDepth) history.go(-history.state.listDepth);
      else navigate(categoryHash(currentCategory));
    } else if (link.dataset.articleUrl) {
      event.preventDefault();
      navigate(`#article/${encodeURIComponent(link.dataset.articleUrl)}`);
    } else {
      const hash = link.getAttribute('href');
      if (hash === '#' || hash?.startsWith('#category/')) {
        event.preventDefault();
        navigate(hash);
      }
    }
  });

  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    list.setAttribute('aria-busy', 'true');
    error.hidden = true;
    status.textContent = 'Đang tải danh sách tin…';
    try {
      const url = new URL(endpoint);
      url.searchParams.set('categories', Object.keys(categories).join(','));
      const response = await fetch(url, {
        cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.articles)) throw new Error('Invalid RSS response');
      articles = data.articles.filter(article => article && Object.hasOwn(categories, article.category)
        && typeof article.title === 'string' && safeUrl(article.url));
      fetchedAt = formatDate(data.fetchedAt);
      loaded = true;
      render();
      if (activeArticle) {
        const article = articles.find(item => item.url === activeArticle.url);
        if (article) {
          activeArticle = article;
          detailCategory.textContent = categories[article.category];
          detailCategory.href = categoryHash(article.category);
          detailMeta.textContent = formatDate(article.publishedAt);
          renderRelated(article);
        }
      } else {
        restoreScroll(history.state?.vne ? history.state.scroll || 0 : 0);
      }
      if (data.errors?.length) {
        const failed = data.errors.map(item => categories[item.category] || item.category).join(', ');
        error.textContent = `Chưa lấy được mục: ${failed}. Bấm “Tải lại” để thử lại.`;
        error.hidden = false;
      }
    } catch {
      status.textContent = loaded ? 'Chưa cập nhật được, đang hiển thị danh sách trước.' : 'Chưa tải được danh sách bài.';
      error.textContent = 'Không kết nối được nguồn RSS. Bấm “Tải lại” để thử lại.';
      error.hidden = false;
    } finally {
      loading = false;
      refresh.disabled = false;
      list.setAttribute('aria-busy', 'false');
    }
  }

  refresh.addEventListener('click', load);
  window.addEventListener('popstate', syncRoute);
  window.addEventListener('hashchange', () => { if (location.hash !== currentHash) syncRoute(); });
  // Refresh server data when returning from another site; no persistent article storage.
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  syncRoute();
  load();
})();
