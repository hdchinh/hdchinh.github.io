(() => {
  const collection = document.currentScript.dataset.collection;
  const api = 'https://api-sirrista-singapore.com/api/v1/scenario_reactions';
  const icons = {
    like: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
  };
  fetch(`${api}?collection=${collection}`, { credentials: 'omit', cache: 'no-store' })
    .then(response => response.ok ? response.json() : [])
    .catch(() => [])
    .then(rows => {
      const saved = new Map(rows.map(row => [row.scenarioId, row]));
      document.querySelectorAll('[data-scenario]').forEach(article => {
        const id = article.dataset.scenario;
        const counts = saved.get(id) || { likeCount: 0, trashCount: 0 };
        const controls = document.createElement('span');
        const read = document.createElement('span');
        read.textContent = '✓';
        read.title = 'Đã đọc';
        read.setAttribute('aria-label', 'Đã đọc');
        document.querySelector(`li[data-id="${id}"] .sap-list-meta, li[data-id="${id}"] .eng-list-meta`).append(read);
        function render() {
          controls.querySelectorAll('button').forEach(button => {
            const count = counts[`${button.dataset.reaction}Count`];
            button.lastElementChild.textContent = count;
            button.setAttribute('aria-label', `${button.title}: ${count}`);
          });
          read.hidden = counts.likeCount + counts.trashCount === 0;
        }
        Object.entries(icons).forEach(([reaction, icon]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.reaction = reaction;
          button.title = reaction === 'like' ? 'Thích' : 'Không thích';
          button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${icon}</svg> <span>0</span>`;
          button.addEventListener('click', () => {
            counts[`${reaction}Count`] += 1;
            render();
            fetch(api, {
              method: 'POST', credentials: 'omit', keepalive: true,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ collection, scenarioId: id, reaction })
            }).catch(() => {});
          });
          controls.append(button, ' ');
        });
        article.querySelector('.sap-lesson-meta, .eng-lesson-meta').append(controls);
        render();
      });
    });
})();
