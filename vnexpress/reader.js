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
  const status = root.querySelector('#vne-status');
  const error = root.querySelector('#vne-error');
  const select = root.querySelector('#vne-category');
  const refresh = root.querySelector('#vne-refresh');
  const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  let articles = [];
  let fetchedAt = '';
  let loading = false;

  for (const [id, name] of Object.entries(categories)) select.add(new Option(name, id));
  select.value = 'tin-noi-bat';

  function formatDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? dateFormat.format(date) : '';
  }

  function safeUrl(value, image = false) {
    try {
      const url = new URL(value);
      const allowedHost = image ? url.hostname.endsWith('.vnecdn.net') : url.hostname === 'vnexpress.net';
      return url.protocol === 'https:' && allowedHost && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  }

  function render() {
    const visible = articles.filter(article => select.value === 'tin-noi-bat'
      ? article.featured === true : !select.value || article.category === select.value);
    const fragment = document.createDocumentFragment();
    for (const article of visible) {
      const card = document.createElement('article');
      card.className = 'vne-article';
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = article.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = article.title;
      heading.append(link);
      card.append(heading);

      const imageUrl = safeUrl(article.imageUrl, true);
      if (imageUrl) {
        const image = document.createElement('img');
        image.className = 'vne-thumbnail';
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.width = 160;
        image.height = 96;
        image.referrerPolicy = 'no-referrer';
        image.src = imageUrl;
        image.addEventListener('error', () => image.remove(), { once: true });
        card.append(image);
      }

      const meta = document.createElement('p');
      meta.className = 'vne-meta';
      meta.textContent = [article.featured === true ? '★ Tin nổi bật' : '',
        categories[article.category], formatDate(article.publishedAt)].filter(Boolean).join(' · ');
      const description = document.createElement('p');
      description.textContent = article.description || '';
      card.append(meta, description);
      fragment.append(card);
    }
    list.replaceChildren(fragment);
    status.textContent = `${visible.length} bài · Dữ liệu từ ${fetchedAt} · Cache backend 5 phút`;
  }

  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = select.disabled = true;
    list.setAttribute('aria-busy', 'true');
    articles = [];
    list.replaceChildren();
    error.hidden = true;
    status.textContent = 'Đang tải danh sách tin…';
    try {
      const url = new URL(endpoint);
      url.searchParams.set('categories', Object.keys(categories).join(','));
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.articles)) throw new Error('Invalid RSS response');
      articles = data.articles.filter(article => article && Object.hasOwn(categories, article.category)
        && typeof article.title === 'string' && safeUrl(article.url));
      fetchedAt = formatDate(data.fetchedAt);
      render();
      if (data.errors?.length) {
        const failed = data.errors.map(item => categories[item.category] || item.category).join(', ');
        error.textContent = `Chưa lấy được mục: ${failed}. Bấm “Tải lại” để thử lại.`;
        error.hidden = false;
      }
    } catch {
      status.textContent = 'Chưa tải được danh sách bài.';
      error.textContent = 'Không kết nối được nguồn RSS. Bấm “Tải lại” để thử lại.';
      error.hidden = false;
    } finally {
      loading = false;
      refresh.disabled = select.disabled = false;
      list.setAttribute('aria-busy', 'false');
    }
  }

  refresh.addEventListener('click', load);
  select.addEventListener('change', render);
  // Restoring a page via Back/Forward must fetch again, not reuse its old list.
  window.addEventListener('pageshow', event => { if (event.persisted) load(); });
  load();
})();
