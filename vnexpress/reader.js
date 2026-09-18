(() => {
  const root = document.querySelector('#vne-reader');
  if (!root) return;

  const endpoint = 'https://api-sirrista-singapore.com/api/v1/vnexpress/rss';
  const eVnexpressEndpoint = 'https://api-sirrista-singapore.com/api/v1/e-vnexpress/rss';
  const bbcEndpoint = 'https://api-sirrista-singapore.com/api/v1/bbc/rss';
  const englishCategories = { home: 'Home', news: 'News', business: 'Business', tech: 'Tech', world: 'World', perspectives: 'Perspectives' };
  const externalSources = {
    'e-vnexpress': { name: 'E-Vnexpress', hosts: ['e.vnexpress.net'] },
    bbc: { name: 'BBC News Tiếng Việt', hosts: ['www.bbc.com'] }
  };
  const categories = {
    'tin-noi-bat': 'Tin tổng hợp',
    'tin-moi-nhat': 'Tin mới nhất',
    'thoi-su': 'Thời sự',
    'the-gioi': 'Thế giới',
    'kinh-doanh': 'Kinh doanh',
    'phap-luat': 'Pháp luật',
    'khoa-hoc-cong-nghe': 'Khoa học công nghệ',
    'giao-duc': 'Giáo dục',
    'bat-dong-san': 'Bất động sản',
    'gia-dinh': 'Đời sống',
    'oto-xe-may': 'Xe',
    'du-lich': 'Du lịch'
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
  const detailSourceName = root.querySelector('#vne-detail-source-name');
  const readingNote = root.querySelector('.vne-reading-note');
  const detailCategory = root.querySelector('#vne-detail-category');
  const detailMeta = root.querySelector('#vne-detail-meta');
  const detailDescription = root.querySelector('#vne-detail-description');
  const detailStatus = root.querySelector('#vne-detail-status');
  const detailBody = root.querySelector('#vne-detail-body');
  const related = root.querySelector('#vne-related');
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  let articles = [];
  let homeTopArticles = [];
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

  function safeUrl(value, image = false, source = 'vnexpress') {
    try {
      const url = new URL(value);
      const allowedHost = image
        ? (source === 'bbc' ? url.hostname === 'ichef.bbci.co.uk' : url.hostname.endsWith('.vnecdn.net'))
        : source === 'vnexpress' ? url.hostname === 'vnexpress.net'
          : Object.hasOwn(externalSources, source) && externalSources[source].hosts.includes(url.hostname);
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

  function validCategory(id) {
    return ['all', 'featured', 'e-vnexpress', 'bbc'].includes(id) || Object.hasOwn(categories, id)
      || (id.startsWith('e-vnexpress/') && Object.hasOwn(englishCategories, id.slice(12)));
  }

  function categoryName(id) {
    if (id === 'bbc') return 'BBC';
    if (id === 'featured') return 'Tin nổi bật';
    if (id === 'e-vnexpress') return 'E-Vnexpress';
    if (id.startsWith('e-vnexpress/')) return `E-Vnexpress · ${englishCategories[id.slice(12)]}`;
    return id === 'all' ? 'Tất cả' : categories[id];
  }

  function articleLink(article) {
    const link = element('a');
    // Modified clicks still open the original source, not a duplicate reader tab.
    link.href = article.url;
    link.rel = 'noopener noreferrer';
    if (article.external && !['e-vnexpress', 'bbc'].includes(article.source)) {
      // Unsupported external sources continue to open at the publisher.
      link.dataset.externalArticle = 'true';
    } else {
      link.target = '_blank';
      link.dataset.articleUrl = article.url;
    }
    return link;
  }

  function card(article, { hero = false, brief = false, summary = !brief, heading = 'h2' } = {}) {
    const node = element('article', `vne-card${hero ? ' vne-hero' : ''}`);
    if (article.external) node.lang = article.source === 'e-vnexpress' ? 'en' : 'vi';
    const imageUrl = !brief && safeUrl(article.imageUrl, true, article.source);
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
    if (summary && article.description) text.append(element('p', 'vne-description', article.description));
    text.append(element('p', 'vne-meta', [article.sourceName, article.source === 'e-vnexpress' ? englishCategories[article.category] : categories[article.category], formatDate(article.publishedAt),
      article.external && !['e-vnexpress', 'bbc'].includes(article.source) ? 'Đọc tại nguồn ↗' : ''].filter(Boolean).join(' · ')));
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
    const eVnexpress = currentCategory === 'e-vnexpress' || currentCategory.startsWith('e-vnexpress/');
    const topic = currentCategory.split('/')[1] || 'home';
    const englishHome = eVnexpress && topic === 'home';
    const visible = articles.filter(article => currentCategory === 'bbc' ? article.source === 'bbc' : eVnexpress
      ? article.source === 'e-vnexpress' && (englishHome ? article.featured : article.categories.includes(topic))
      : !article.external && (home || currentCategory === 'featured' ? article.featured === true
        : currentCategory === 'tin-moi-nhat' ? article.latest === true
          : currentCategory === 'all' || article.categories.includes(currentCategory)));
    // RSS rank applies to the featured tab and remaining stream; homepage top four use publisher matches plus fallback.
    if (home || currentCategory === 'featured') visible.sort((a, b) => (a.featuredRank ?? Number.MAX_SAFE_INTEGER) - (b.featuredRank ?? Number.MAX_SAFE_INTEGER));
    const topItems = home ? homeTopArticles : visible.slice(0, 4);
    const fragment = document.createDocumentFragment();
    const displayedUrls = new Set(topItems.map(article => article.url));
    const headlineItems = home
      ? articles.filter(article => !article.external && article.latest === true && !displayedUrls.has(article.url)).slice(0, 5)
      : visible.slice(4, 9);
    if (topItems.length || headlineItems.length) {
      const frontpage = element('div', 'vne-front-grid');
      if (topItems.length) {
        const lead = element('div', 'vne-lead');
        lead.append(card(topItems[0], { hero: true }));
        if (topItems[1]) lead.append(card(topItems[1], { brief: true, summary: true }));
        const secondary = element('div', 'vne-secondary');
        topItems.slice(2, 4).forEach(article => secondary.append(card(article)));
        frontpage.append(lead);
        if (secondary.childElementCount) frontpage.append(secondary);
      }
      if (headlineItems.length) {
        const sidebar = element('aside', 'vne-headlines');
        sidebar.append(sectionHeading(home ? 'Tin mới nhất' : eVnexpress ? 'Latest headlines' : 'Điểm tin',
          home ? 'tin-moi-nhat' : null));
        const headlines = element('ol');
        headlineItems.forEach(article => {
          displayedUrls.add(article.url);
          const item = element('li');
          const link = articleLink(article);
          link.textContent = article.title;
          if (article.external) link.lang = article.source === 'e-vnexpress' ? 'en' : 'vi';
          item.append(link, element('p', 'vne-meta', formatDate(article.publishedAt)));
          headlines.append(item);
        });
        sidebar.append(headlines);
        frontpage.append(sidebar);
      }
      if (home && frontpage.childElementCount < 3) frontpage.classList.add(`vne-columns-${frontpage.childElementCount}`);
      fragment.append(frontpage);
    } else if (!home) {
      fragment.append(element('p', 'vne-empty', 'Chưa có tin trong mục này. Bạn có thể chọn chuyên mục khác hoặc tải lại.'));
    }

    if (home || englishHome) {
      const topics = englishHome ? englishCategories : categories;
      for (const id of Object.keys(topics).slice(1)) {
        if (home && id === 'tin-moi-nhat') continue;
        const items = articles.filter(article => englishHome
          ? article.source === 'e-vnexpress' && article.categories.includes(id)
          : !article.external && !displayedUrls.has(article.url)
            && article.categories.includes(id)).slice(0, 6);
        if (!items.length) continue;
        if (home) items.forEach(article => displayedUrls.add(article.url));
        const route = englishHome ? `e-vnexpress/${id}` : id;
        const section = element('section', 'vne-category-section');
        if (englishHome) section.lang = 'en';
        const header = element('div', 'vne-section-header');
        const more = element('a', 'vne-more', englishHome ? 'View all →' : 'Xem tất cả →');
        more.href = categoryHash(route);
        header.append(sectionHeading(topics[id], route), more);
        const grid = element('div', 'vne-section-grid');
        const lead = element('div', 'vne-section-lead');
        lead.append(card(items[0], { hero: true, heading: 'h3' }));
        if (items[5]) lead.append(card(items[5], { brief: true, summary: true, heading: 'h3' }));
        const stories = element('div', 'vne-section-stories');
        items.slice(1, 5).forEach(article => stories.append(card(article, { heading: 'h3' })));
        grid.append(lead, stories);
        section.append(header, grid);
        fragment.append(section);
      }
    }
    const remaining = visible.filter(article => !displayedUrls.has(article.url));
    if (remaining.length) {
      const stream = element('section', 'vne-stream');
      stream.append(sectionHeading(eVnexpress ? 'More stories' : 'Tiếp dòng tin'));
      const grid = element('div', 'vne-category-stream');
      remaining.forEach(article => {
        grid.append(card(article, { heading: 'h3' }));
        displayedUrls.add(article.url);
      });
      stream.append(grid);
      fragment.append(stream);
    }
    if (home && !displayedUrls.size) {
      fragment.append(element('p', 'vne-empty', 'Chưa có tin vượt qua bộ lọc. Bạn có thể tải lại để thử lại.'));
    }
    list.replaceChildren(fragment);
    renderedCategory = currentCategory;
    status.textContent = `${home ? displayedUrls.size : visible.length} bài · Cập nhật ${fetchedAt}`;
  }

  function renderRelated(article) {
    related.replaceChildren();
    const english = article.source === 'e-vnexpress';
    const items = articles.filter(item => item.source === article.source && item.url !== article.url
      && (english ? item.categories.includes(article.category) : item.category === article.category)).slice(0, 3);
    related.hidden = !items.length;
    if (!items.length) return;
    related.append(sectionHeading('Đọc tiếp cùng chuyên mục', english ? `e-vnexpress/${article.category}` : article.category));
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
    const english = article.source === 'e-vnexpress';
    const bbc = article.source === 'bbc';
    const sourceName = bbc ? 'BBC News Tiếng Việt' : english ? 'VnExpress International' : 'VnExpress';
    const timer = setTimeout(() => controller.abort(), 15000);
    detailTitle.textContent = article.title || 'Đang tải bài viết…';
    for (const node of [detailTitle, detailDescription, detailBody]) node.lang = english ? 'en' : 'vi';
    detailSource.href = article.url;
    detailSourceName.textContent = sourceName;
    readingNote.textContent = `Bản đọc gọn từ ${sourceName}. Video, nội dung tương tác hoặc bài yêu cầu đăng nhập có thể cần đọc trên trang gốc.`;
    detailCategory.textContent = bbc ? 'BBC' : (english ? englishCategories[article.category] : categories[article.category]) || (english ? 'E-Vnexpress' : 'Tin tức');
    detailCategory.href = categoryHash(bbc ? 'bbc' : english ? (article.category ? `e-vnexpress/${article.category}` : 'e-vnexpress') : article.category || currentCategory);
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
      const url = new URL('article', bbc ? bbcEndpoint : english ? eVnexpressEndpoint : endpoint);
      url.searchParams.set('url', article.url);
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (detailRequest !== controller) return;
      if (typeof data.contentHtml !== 'string' || !data.contentHtml.trim()) throw new Error('Missing article content');
      detailTitle.textContent = data.title || article.title || `Bài viết ${sourceName}`;
      detailDescription.textContent = data.description || '';
      if (data.publishedAt) detailMeta.textContent = formatDate(data.publishedAt);
      // Only the backend's allowlist-sanitized body is inserted, never the full source page.
      detailBody.innerHTML = data.contentHtml;
      // Source toolbar icons are stripped by sanitization, leaving empty bullet lists.
      detailBody.querySelectorAll('ul, ol').forEach(list => {
        if (!list.textContent.trim() && !list.querySelector('img')) list.remove();
      });
      detailStatus.hidden = true;
      document.title = `${detailTitle.textContent} · Góc đọc`;
      if (scrollTop) restoreScroll(scrollTop);
    } catch {
      if (detailRequest === controller) {
        detailStatus.textContent = 'Chưa đọc được bài này tại đây. ';
        const fallback = element('a', '', `Đọc trên ${sourceName} ↗`);
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
      try {
        const decoded = decodeURIComponent(currentHash.slice(9));
        articleUrl = safeUrl(decoded) || safeUrl(decoded, false, 'e-vnexpress') || safeUrl(decoded, false, 'bbc');
      } catch { /* Invalid route falls back to the list. */ }
    }
    if (articleUrl) {
      front.hidden = true;
      detail.hidden = false;
      const english = Boolean(safeUrl(articleUrl, false, 'e-vnexpress'));
      const bbc = Boolean(safeUrl(articleUrl, false, 'bbc'));
      if (state.category && validCategory(state.category)) currentCategory = state.category;
      else currentCategory = bbc ? 'bbc' : english ? 'e-vnexpress' : 'tin-noi-bat';
      const article = articles.find(item => item.url === articleUrl)
        || { url: articleUrl, source: bbc ? 'bbc' : english ? 'e-vnexpress' : 'vnexpress', external: english || bbc };
      openArticle(article, scrollTop);
    } else {
      activeArticle = null;
      detail.hidden = true;
      front.hidden = false;
      const id = currentHash.startsWith('#category/') ? currentHash.slice(10) : 'tin-noi-bat';
      currentCategory = validCategory(id) ? id : 'tin-noi-bat';
      sectionTitle.textContent = categoryName(currentCategory);
      document.title = `${categoryName(currentCategory)} · Góc đọc của Hudson`;
      if (loaded && renderedCategory !== currentCategory) render();
      sectionTitle.focus({ preventScroll: true });
      restoreScroll(scrollTop);
    }
    const eVnexpress = currentCategory === 'e-vnexpress' || currentCategory.startsWith('e-vnexpress/');
    root.querySelector('#vne-english-categories').hidden = !eVnexpress;
    for (const link of root.querySelectorAll('[data-topic]')) {
      if (eVnexpress && link.dataset.topic === (currentCategory.split('/')[1] || 'home')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    for (const link of root.querySelectorAll('[data-category]')) {
      if (link.dataset.category === (eVnexpress ? 'e-vnexpress' : activeArticle?.category || currentCategory)) link.setAttribute('aria-current', 'page');
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
    } else if (link.dataset.externalArticle) {
      history.replaceState({ ...history.state, vne: true, scroll: window.scrollY, category: currentCategory }, '');
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
      const results = await Promise.allSettled([url, eVnexpressEndpoint, bbcEndpoint].map(async feedUrl => {
        const response = await fetch(feedUrl, {
          cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(35000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.articles)) throw new Error('Invalid RSS response');
        return data;
      }));
      if (results.every(result => result.status === 'rejected')) throw new Error('All RSS APIs failed');
      const merged = [];
      const failures = [];
      const timestamps = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failures.push(['VnExpress', 'E-Vnexpress', 'BBC'][index]);
          return;
        }
        const data = result.value;
        if (index === 0 && data.homepage?.error) failures.push('Ưu tiên trang chủ VnExpress');
        if (data.fetchedAt) timestamps.push(data.fetchedAt);
        for (const article of data.articles) {
          if (!article || !(index === 2 ? article.category === 'bbc' : Object.hasOwn(index === 1 ? englishCategories : categories, article.category)) || typeof article.title !== 'string') continue;
          const source = ['vnexpress', 'e-vnexpress', 'bbc'][index];
          const articleUrl = safeUrl(article.url, false, source);
          if (!articleUrl) continue;
          const topics = index === 2 ? ['bbc'] : Array.isArray(article.categories)
            ? article.categories.filter(id => Object.hasOwn(index === 1 ? englishCategories : categories, id)) : [article.category];
          merged.push({ ...article, url: articleUrl, source, categories: topics, external: index !== 0,
            sourceName: index === 0 ? 'VnExpress' : externalSources[source].name });
        }
        for (const item of data.errors || []) failures.push(item.sourceName || categories[item.category] || item.feed || item.category);
      });
      articles = [...new Map(merged.map(article => [article.url, article])).values()]
        .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
      // Publisher homepage ranks only exist on filtered RSS matches. Fill gaps with the existing random pool.
      const homepageItems = articles.filter(article => !article.external
        && Number.isInteger(article.homepageRank) && article.homepageRank > 0)
        .sort((a, b) => a.homepageRank - b.homepageRank).slice(0, 4);
      const homepageUrls = new Set(homepageItems.map(article => article.url));
      const topPool = articles.filter(article => !article.external && !homepageUrls.has(article.url)
        && (article.featured === true || article.latest === true || article.categories.includes('the-gioi')));
      for (let i = topPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [topPool[i], topPool[j]] = [topPool[j], topPool[i]];
      }
      homeTopArticles = [...homepageItems, ...topPool.slice(0, 4 - homepageItems.length)];
      fetchedAt = formatDate(timestamps.sort()[0]);
      loaded = true;
      render();
      if (activeArticle) {
        const article = articles.find(item => item.url === activeArticle.url);
        if (article) {
          activeArticle = article;
          const english = article.source === 'e-vnexpress';
          detailCategory.textContent = article.source === 'bbc' ? 'BBC' : english ? englishCategories[article.category] : categories[article.category];
          detailCategory.href = categoryHash(english ? `e-vnexpress/${article.category}` : article.category);
          detailMeta.textContent = formatDate(article.publishedAt);
          renderRelated(article);
        }
      } else {
        restoreScroll(history.state?.vne ? history.state.scroll || 0 : 0);
      }
      if (failures.length) {
        error.textContent = `Chưa lấy được: ${[...new Set(failures)].join(', ')}. Các nguồn còn lại vẫn hiển thị. Bấm “Tải lại” để thử lại.`;
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
