(() => {
  if (window.__luckyBossStandaloneInitialized) return;
  window.__luckyBossStandaloneInitialized = true;
  const page = document.querySelector('.page');
  const shell = document.querySelector('.page-shell');
  const leaderboard = document.querySelector('.today-leaderboard');
  const mainTabs = document.querySelector('.leaderboard-main-tabs');
  const mainRankingHit = document.querySelector('.leaderboard-main-ranking-hit');
  const historyTrigger = document.querySelector('[data-node-id="94:92"]');
  const dialog = document.querySelector('.history-dialog');
  const yesterdayDock = document.querySelector('.yesterday-rank-dock');
  const defaultTabs = ['94:38', '94:39', '94:40'].map(id => document.querySelector(`[data-node-id="${id}"]`));
  const todayPanel = document.querySelector('.today-ranks');
  const yesterdayPanel = document.querySelector('.yesterday-ranks');
  const dayImages = ['today', 'yesterday'].map(day => document.querySelector(`.leaderboard-${day}`));
  const dayButtons = ['today', 'yesterday'].map(day => document.querySelector(`.leaderboard-${day}-hit`));
  const todaySources = dayImages.map(img => img.getAttribute('src'));
  const yesterdaySources = [
    'assets/state-291-282/btn_today-291-3436@2x.png',
    'assets/state-291-282/btn_yesterday-291-3433@2x.png',
  ];
  let route = 'ranking';
  let returnFocus = null;
  let previousOverflow = '';
  let modalScroll = 0;
  const fitPage = () => {
    const scale = Math.min(1, document.documentElement.clientWidth / 402);
    document.documentElement.style.setProperty('--h5-scale', String(scale));
    document.documentElement.style.setProperty('--dialog-scale', String(Math.min(scale, Math.max(0.1, (innerHeight - 24) / 446))));
    if (shell) shell.style.height = `${(route === 'ranking' ? 903 : 1367) * scale}px`;
  };
  const closeHistory = () => { if (dialog.open) dialog.close(); };
  const setRoute = next => {
    if (dialog.open) closeHistory();
    route = next;
    const active = next !== 'ranking';
    const yesterday = next === 'yesterday';
    page.classList.toggle('leaderboard-page', active);
    document.body.classList.toggle('is-leaderboard', active);
    document.body.classList.toggle('is-yesterday', yesterday);
    leaderboard.hidden = !active;
    leaderboard.style.display = active ? 'block' : 'none';
    mainTabs.style.display = mainRankingHit.style.display = active ? 'block' : 'none';
    defaultTabs.forEach(n => { if (n) n.style.visibility = active ? 'hidden' : 'visible'; });
    historyTrigger.hidden = active;
    historyTrigger.style.display = active ? 'none' : 'block';
    yesterdayDock.hidden = !yesterday;
    todayPanel.setAttribute('aria-hidden', String(yesterday));
    yesterdayPanel.setAttribute('aria-hidden', String(!yesterday));
    todayPanel.inert = yesterday;
    yesterdayPanel.inert = !yesterday;
    dayImages.forEach((img, index) => {
      img.src = (yesterday ? yesterdaySources : todaySources)[index];
      dayButtons[index].setAttribute('aria-pressed', String(yesterday ? index === 1 : index === 0));
    });
    page.setAttribute('aria-label', yesterday ? '幸运霸主-昨日霸主榜单' : active ? '幸运霸主-今日霸主榜单' : '幸运霸主-有人上榜');
    fitPage();
  };
  const readRoute = () => location.hash === '#leaderboard-yesterday' ? 'yesterday' : location.hash === '#leaderboard' ? 'today' : 'ranking';
  const navigate = next => {
    const hash = next === 'yesterday' ? '#leaderboard-yesterday' : next === 'today' ? '#leaderboard' : '';
    if (location.hash === hash) return;
    history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
    setRoute(next);
  };
  const openHistory = () => {
    if (route !== 'ranking' || dialog.open) return;
    returnFocus = document.activeElement;
    previousOverflow = document.body.style.overflow;
    modalScroll = window.scrollY;
    document.body.style.overflow = 'hidden';
    fitPage();
    dialog.showModal();
    dialog.querySelector('.history-list').scrollTop = 0;
    dialog.querySelector('.history-close').focus({preventScroll:true});
  };
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    window.scrollTo(0, modalScroll);
    if (returnFocus?.isConnected && !returnFocus.hidden) returnFocus.focus({preventScroll:true});
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeHistory();
  });
  dialog.querySelector('.history-close').addEventListener('click', closeHistory);
  historyTrigger.addEventListener('click', openHistory);
  document.querySelectorAll('[data-action="leaderboard"]').forEach(el => el.addEventListener('click', () => navigate('today')));
  document.querySelectorAll('[data-action="ranking"]').forEach(el => el.addEventListener('click', () => navigate('ranking')));
  mainRankingHit.addEventListener('click', () => navigate('ranking'));
  dayButtons[0].addEventListener('click', () => navigate('today'));
  dayButtons[1].addEventListener('click', () => navigate('yesterday'));
  window.addEventListener('hashchange', () => setRoute(readRoute()));
  window.addEventListener('popstate', () => setRoute(readRoute()));
  window.addEventListener('resize', fitPage);
  setRoute(readRoute());
})();
