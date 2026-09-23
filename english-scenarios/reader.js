(() => {
  'use strict';

  const articles = Array.from(document.querySelectorAll('[data-scenario]'));
  if (!articles.length) return;

  const pane = document.getElementById('eng-reading');
  const listPane = document.querySelector('.eng-list-pane');
  const list = document.getElementById('eng-list');
  const search = document.getElementById('eng-search');
  const group = document.getElementById('eng-group');
  const clear = document.getElementById('eng-clear');
  const results = document.getElementById('eng-results');
  const previous = document.getElementById('eng-previous');
  const next = document.getElementById('eng-next');
  const showList = document.getElementById('eng-show-list');
  const byId = new Map(articles.map(article => [article.dataset.scenario, article]));
  const items = Array.from(list.children);
  const ids = articles.map(article => article.dataset.scenario);
  const positions = new Map();
  let active = '';
  let visible = ids.slice();

  function normalize(text) {
    return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }

  // Local HTML only: index once, without fetching or rewriting lesson content.
  const searchIndex = new Map(articles.map(article => [
    article.dataset.scenario,
    normalize(`${article.dataset.scenario} ${article.dataset.groupLabel} ${article.textContent}`)
  ]));

  function setStep(link, id) {
    if (id) {
      link.href = `#${id}`;
      link.removeAttribute('aria-disabled');
      link.removeAttribute('tabindex');
    } else {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('tabindex', '-1');
    }
  }

  function updateSteps() {
    const index = visible.indexOf(active);
    document.getElementById('eng-position').textContent = index < 0
      ? 'Ngoài bộ lọc'
      : `${index + 1} / ${visible.length}`;
    setStep(previous, index > 0 ? visible[index - 1] : null);
    setStep(next, index < 0 ? visible[0] : visible[index + 1]);
  }

  function filter() {
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    visible = [];
    items.forEach(item => {
      const id = item.dataset.id;
      const matches = (group.value === 'all' || item.dataset.group === group.value) &&
        terms.every(term => searchIndex.get(id).includes(term));
      item.hidden = !matches;
      if (matches) visible.push(id);
    });
    results.textContent = `${visible.length} / ${ids.length} tình huống`;
    document.getElementById('eng-empty').hidden = visible.length !== 0;
    clear.hidden = !search.value && group.value === 'all';
    updateSteps();
  }

  function revealActiveLink() {
    const item = items.find(candidate => candidate.dataset.id === active);
    if (!item || item.hidden) return;
    const rect = item.getBoundingClientRect();
    const container = listPane.getBoundingClientRect();
    if (rect.top < container.top || rect.bottom > container.bottom) {
      listPane.scrollTop += rect.top - container.top - (container.height - rect.height) / 2;
    }
  }

  function showArticle(id, focus) {
    if (!byId.has(id)) id = ids[0];
    if (active && pane.getClientRects().length) positions.set(active, pane.scrollTop);
    active = id;
    articles.forEach(article => { article.hidden = article.dataset.scenario !== id; });
    items.forEach(item => {
      const link = item.querySelector('a');
      if (item.dataset.id === id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.body.classList.remove('eng-list-open');
    showList.setAttribute('aria-expanded', 'false');
    const article = byId.get(id);
    const title = article.querySelector('h1');
    document.getElementById('eng-current-group').textContent = article.dataset.groupLabel;
    document.title = `${id}: ${title.textContent} | Luyện tiếng Anh`;
    pane.scrollTop = positions.get(id) || 0;
    updateSteps();
    revealActiveLink();
    if (focus) title.focus({ preventScroll: true });
  }

  function route(focus) {
    let id = location.hash.slice(1).toUpperCase();
    const showInitialList = !id;
    if (!byId.has(id)) {
      id = ids[0];
      if (!showInitialList) {
        history.replaceState(history.state, '', `${location.pathname}${location.search}#${id}`);
      }
    }
    showArticle(id, focus && !showInitialList);
    if (showInitialList) {
      document.body.classList.add('eng-list-open');
      showList.setAttribute('aria-expanded', 'true');
      if (focus && window.matchMedia('(max-width: 760px)').matches) search.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    if (!byId.has(id)) return;
    event.preventDefault();
    if (location.hash === `#${id}`) showArticle(id, true);
    else location.hash = id;
  });

  const random = document.getElementById('eng-random');
  random.hidden = false;
  random.addEventListener('click', () => {
    const candidates = ids.filter(id => id !== active);
    if (!candidates.length) return;
    const id = candidates[Math.floor(Math.random() * candidates.length)];
    positions.delete(id);
    location.hash = id;
  });

  search.addEventListener('input', filter);
  group.addEventListener('change', filter);
  clear.addEventListener('click', () => {
    search.value = '';
    group.value = 'all';
    filter();
    search.focus({ preventScroll: true });
  });
  showList.addEventListener('click', () => {
    positions.set(active, pane.scrollTop);
    document.body.classList.add('eng-list-open');
    showList.setAttribute('aria-expanded', 'true');
    revealActiveLink();
    search.focus({ preventScroll: true });
  });
  document.getElementById('eng-skip').addEventListener('click', event => {
    event.preventDefault();
    showArticle(active, true);
  });
  window.addEventListener('hashchange', () => route(true));

  document.getElementById('eng-filter-controls').hidden = false;
  document.getElementById('eng-reading-tools').hidden = false;
  document.body.classList.add('eng-ready');
  route(false);
  filter();
})();
