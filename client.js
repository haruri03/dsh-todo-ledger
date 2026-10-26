window.__ModuleLoader__.load({
  id: 'dsh-todo-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TYPE_ID = 'dsh-todo-ledger:ledger';
    const KIND = 'todo-ledger';
    const ROUTE = '/todo-ledger/projection';
    const ORDER = ['doing', 'todo', 'review', 'blocked'];
    const VISIBLE_REFRESH_MS = 5000;

    const TONE = {
      doing: '#3b82f6',
      todo: '#94a3b8',
      review: '#a855f7',
      blocked: '#ef4444',
      accept: 'var(--dsw-alias-state-success-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
    };

    const LOCALE_NAMESPACE = 'todo-ledger-panel';
    const MESSAGES = {
      zh: {
        title: '待办账本',
        description: '当前目录的账本：进行中、待办、待复核、受阻',
        loading: '正在读取账本…',
        absent: '当前目录没有 _todo/ 或 todo/ 账本',
        inconsistent: '账本不一致：队列、索引与任务详情对不上',
        error: '读取账本失败',
        noSession: '选择一个会话后查看其目录的账本',
        unbound: '此会话目录尚不可用；会话加载后将自动重试',
        empty: '此账本没有已登记的未完成任务；已归档任务不在此显示',
        refresh: '刷新',
        accept: '通过',
        accepting: '处理中…',
        acceptFailed: '接受失败',
        doing: '进行中',
        todo: '待办',
        review: '待复核',
        blocked: '受阻',
        launcher: 'Todo',
        launcherLabel: '打开待办账本浮窗',
        close: '关闭',
        move: '移动窗口',
        resize: '调整窗口大小',
        expandSection: '展开这一组',
        collapseSection: '折叠这一组',
        jumpTo: '跳到',
      },
      en: {
        title: 'Todo ledger',
        description: "This directory's ledger: in progress, to do, awaiting review, blocked",
        loading: 'Reading the ledger…',
        absent: 'No _todo/ or todo/ ledger in this directory',
        inconsistent: 'Ledger is inconsistent: queue, index and task files disagree',
        error: 'Could not read the ledger',
        noSession: 'Select a conversation to view its directory’s ledger',
        unbound: 'This session directory is not available yet; retrying as the session loads',
        empty: 'No active tasks registered in this ledger; archived tasks are not shown',
        refresh: 'Refresh',
        accept: 'Accept',
        accepting: 'Accepting…',
        acceptFailed: 'Could not accept',
        doing: 'In progress',
        todo: 'To do',
        review: 'Awaiting review',
        blocked: 'Blocked',
        launcher: 'Todo',
        launcherLabel: 'Open the Todo ledger window',
        close: 'Close',
        move: 'Move window',
        resize: 'Resize window',
        expandSection: 'Expand this group',
        collapseSection: 'Collapse this group',
        jumpTo: 'Jump to',
      },
    };
    let localeService = null;
    let localeTranslate = null;

    function translate(key) {
      if (typeof localeTranslate === 'function') {
        try {
          const value = localeTranslate(key);
          if (typeof value === 'string' && value !== key) return value;
        } catch {}
      }
      return MESSAGES.en[key] ?? key;
    }

    function useLocaleRevision() {
      const [, setRevision] = React.useState(0);
      React.useEffect(() => {
        if (typeof localeService?.subscribe !== 'function') return undefined;
        return localeService.subscribe(() => setRevision((value) => value + 1));
      }, []);
    }

    async function load(sessionId, signal) {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const response = await fetch(`${ROUTE}${query}`, { signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    const styles = {
      shell: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', minHeight: 0, minWidth: 0, flex: '1 1 auto', fontSize: '12px', color: 'var(--dsw-alias-label-primary)' },
      header: { display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 },
      counts: { display: 'flex', gap: '6px', flexWrap: 'wrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' },
      chip: { padding: '1px 6px', borderRadius: '999px', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)' },
      body: { display: 'flex', flexDirection: 'column', gap: '10px', flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', scrollbarGutter: 'stable', paddingRight: 4 },
      sectionTitle: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '10px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' },
      sectionToggle: { width: '100%', background: 'transparent', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' },
      chevron: { width: '10px', flexShrink: 0, opacity: 0.8 },
      sectionLabel: { display: 'flex', alignItems: 'center', gap: '5px', flex: '1 1 auto', minWidth: 0 },
      dot: { width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' },
      countPill: { padding: '0 6px', borderRadius: '999px', fontSize: '10px', fontWeight: 600, background: 'var(--dsw-alias-bg-layer-2)' },
      list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
      item: { display: 'flex', flexDirection: 'column', gap: '1px', padding: '3px 6px', borderRadius: '6px', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l1)' },
      itemTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      itemMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
      accept: { background: 'transparent', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '999px', padding: '0 8px', font: 'inherit', fontSize: '10px', cursor: 'pointer' },
      slug: { color: 'var(--dsw-alias-label-secondary)', fontSize: '10px', fontFamily: 'var(--dsw-alias-font-mono, ui-monospace, monospace)' },
      note: { color: 'var(--dsw-alias-label-secondary)', padding: '6px 0', flexShrink: 0 },
      footer: { display: 'flex', justifyContent: 'space-between', gap: '8px', color: 'var(--dsw-alias-label-secondary)', fontSize: '10px', flexShrink: 0, paddingRight: 16 },
      path: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' },
      action: { background: 'transparent', border: '0', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' },
    };

    const LAYOUT_KEY = 'dsh-todo-ledger:floating-layout';
    const LEGACY_POSITION_KEY = 'dsh-todo-ledger:floating-position';
    const WINDOW_WIDTH = 360;
    const WINDOW_HEIGHT = 420;
    const MIN_WIDTH = 240;
    const MIN_HEIGHT = 180;
    const WINDOW_MARGIN = 12;

    function clampLayout(layout) {
      const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - 2 * WINDOW_MARGIN);
      const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - 2 * WINDOW_MARGIN);
      const width = Math.min(maxWidth, Math.max(MIN_WIDTH, Number.isFinite(layout.width) ? layout.width : WINDOW_WIDTH));
      const height = Math.min(maxHeight, Math.max(MIN_HEIGHT, Number.isFinite(layout.height) ? layout.height : WINDOW_HEIGHT));
      const maxX = Math.max(WINDOW_MARGIN, window.innerWidth - width - WINDOW_MARGIN);
      const maxY = Math.max(WINDOW_MARGIN, window.innerHeight - height - WINDOW_MARGIN);
      return {
        x: Math.min(maxX, Math.max(WINDOW_MARGIN, layout.x)),
        y: Math.min(maxY, Math.max(WINDOW_MARGIN, layout.y)),
        width,
        height,
      };
    }

    function initialLayout() {
      const fallback = { x: (window.innerWidth - Math.min(WINDOW_WIDTH, window.innerWidth)) / 2, y: (window.innerHeight - Math.min(WINDOW_HEIGHT, window.innerHeight)) / 2, width: WINDOW_WIDTH, height: WINDOW_HEIGHT };
      for (const key of [LAYOUT_KEY, LEGACY_POSITION_KEY]) {
        try {
          const stored = JSON.parse(window.localStorage.getItem(key));
          if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return clampLayout({ ...fallback, ...stored });
        } catch {}
      }
      return clampLayout(fallback);
    }

    function saveLayout(layout) {
      try {
        window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
      } catch {}
    }

    function BookIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M12 6c-2.4-1.5-5.3-1.8-9-1v13c3.7-.8 6.6-.5 9 1 2.4-1.5 5.3-1.8 9-1V5c-3.7-.8-6.6-.5-9 1Z' }),
        h('path', { d: 'M12 6v13' }));
    }

    const ledgerResources = new Map();
    const floatingListeners = new Set();
    let floatingRequest = null;
    let floatingRequestSequence = 0;

    function updateFloatingRequest(request) {
      floatingRequest = request;
      for (const listener of floatingListeners) {
        try {
          listener(request);
        } catch {}
      }
    }

    function useFloatingRequest() {
      const [request, setRequest] = React.useState(floatingRequest);
      React.useEffect(() => {
        floatingListeners.add(setRequest);
        return () => floatingListeners.delete(setRequest);
      }, []);
      return request;
    }

    const foregroundListeners = new Set();
    let foregroundSessionId = null;

    function publishForegroundSession(sessionId) {
      const next = typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
      if (next === foregroundSessionId) return;
      foregroundSessionId = next;
      for (const listener of foregroundListeners) {
        try {
          listener(next);
        } catch {}
      }
    }

    function useForegroundSession() {
      const [sessionId, setSessionId] = React.useState(foregroundSessionId);
      React.useEffect(() => {
        foregroundListeners.add(setSessionId);
        setSessionId(foregroundSessionId);
        return () => foregroundListeners.delete(setSessionId);
      }, []);
      return sessionId;
    }

    function getLedgerResource(sessionId) {
      const key = typeof sessionId === 'string' ? sessionId : '';
      const existing = ledgerResources.get(key);
      if (existing) return existing;

      const resource = {
        key,
        sessionId,
        state: key ? { phase: 'loading' } : { phase: 'ready', data: { kind: 'no-session' } },
        listeners: new Set(),
        references: 0,
        timer: null,
        controller: null,
        inFlight: false,
        requestToken: 0,
        disposed: false,
      };

      const publish = (state) => {
        resource.state = state;
        for (const listener of resource.listeners) {
          try {
            listener(state);
          } catch {}
        }
      };

      const read = async () => {
        if (!key || resource.inFlight || resource.references === 0 || resource.disposed) return;
        resource.inFlight = true;
        const token = ++resource.requestToken;
        const controller = new AbortController();
        resource.controller = controller;
        try {
          const data = await load(resource.sessionId, controller.signal);
          if (!resource.disposed && resource.requestToken === token) publish({ phase: 'ready', data });
        } catch (error) {
          if (!resource.disposed && resource.requestToken === token && error?.name !== 'AbortError') {
            publish({ phase: 'error', message: String(error?.message ?? error) });
          }
        } finally {
          if (resource.requestToken === token) {
            resource.controller = null;
            resource.inFlight = false;
          }
        }
      };

      resource.refresh = () => {
        void read();
      };
      resource.subscribe = (listener) => {
        resource.listeners.add(listener);
        resource.references += 1;
        listener(resource.state);
        if (key && resource.references === 1) {
          resource.disposed = false;
          ledgerResources.set(key, resource);
          void read();
          resource.timer = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            void read();
          }, VISIBLE_REFRESH_MS);
        }
        return () => {
          resource.listeners.delete(listener);
          resource.references = Math.max(0, resource.references - 1);
          if (resource.references !== 0) return;
          resource.disposed = true;
          if (resource.timer !== null) clearInterval(resource.timer);
          resource.timer = null;
          resource.requestToken += 1;
          resource.controller?.abort();
          resource.controller = null;
          resource.inFlight = false;
          if (ledgerResources.get(key) === resource) ledgerResources.delete(key);
        };
      };

      ledgerResources.set(key, resource);
      return resource;
    }

    function useLedger(sessionId) {
      const resource = React.useMemo(() => getLedgerResource(sessionId), [sessionId]);
      const [, setState] = React.useState(resource.state);
      const refresh = React.useCallback(() => resource.refresh(), [resource]);

      React.useEffect(() => resource.subscribe(setState), [resource]);

      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
        const wake = () => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          resource.refresh();
        };
        window.addEventListener('focus', wake);
        window.addEventListener('pageshow', wake);
        const canWatchDocument = typeof document !== 'undefined' && typeof document.addEventListener === 'function';
        if (canWatchDocument) document.addEventListener('visibilitychange', wake);
        return () => {
          window.removeEventListener('focus', wake);
          window.removeEventListener('pageshow', wake);
          if (canWatchDocument) document.removeEventListener('visibilitychange', wake);
        };
      }, [resource]);

      return { state: resource.state, refresh };
    }

    function Section({ status, tasks, onAccept, pending, collapsed, onToggle, headerRef }) {
      if (tasks.length === 0) return null;
      const tone = TONE[status] ?? TONE.todo;
      return h(
        'div',
        { 'data-todo-ledger-section': status },
        h(
          'button',
          {
            type: 'button',
            ref: headerRef,
            'data-todo-ledger-section-header': status,
            'aria-expanded': collapsed === true ? 'false' : 'true',
            'aria-controls': `todo-ledger-list-${status}`,
            title: collapsed === true ? translate('expandSection') : translate('collapseSection'),
            onClick: () => onToggle(status),
            style: { ...styles.sectionTitle, ...styles.sectionToggle },
          },
          h('span', { style: styles.chevron }, collapsed === true ? '▸' : '▾'),
          h('span', { style: styles.sectionLabel }, h('span', { style: { ...styles.dot, background: tone } }), translate(status)),
          h('span', { style: { ...styles.countPill, color: tone } }, String(tasks.length)),
        ),
        collapsed === true
          ? null
          : h(
              'ul',
              { id: `todo-ledger-list-${status}`, style: styles.list },
              tasks.map((task) =>
                h(
                  'li',
                  {
                    key: task.slug,
                    style: { ...styles.item, borderLeft: `2px solid ${tone}` },
                    title: `${task.title} · ${task.slug}`,
                  },
                  h('span', { style: styles.itemTitle }, task.title),
                  h(
                    'span',
                    { style: styles.itemMeta },
                    h('span', { style: styles.slug }, task.slug),
                    status === 'review' && typeof onAccept === 'function'
                      ? h(
                          'button',
                          {
                            type: 'button',
                            style: { ...styles.accept, color: TONE.accept, opacity: pending === true ? 0.6 : 1 },
                            disabled: pending === true,
                            onClick: () => onAccept(task.slug),
                          },
                          pending === true ? translate('accepting') : translate('accept'),
                        )
                      : null,
                  ),
                ),
              ),
            ),
      );
    }

    function Panel(props) {
      useLocaleRevision();
      const [pending, setPending] = React.useState({});
      const [collapsed, setCollapsed] = React.useState({});
      const [actionError, setActionError] = React.useState(null);
      const bodyRef = React.useRef(null);
      const headerRefs = React.useRef({});
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : undefined;
      const { state, refresh } = useLedger(sessionId);
      const data = state.phase === 'ready' ? state.data : null;
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const counts = data?.counts ?? {};

      const toggleSection = (status) => {
        setCollapsed((current) => ({ ...current, [status]: current[status] !== true }));
      };

      const jumpToSection = (status) => {
        const scroll = () => {
          const scroller = bodyRef.current;
          const header = headerRefs.current[status];
          if (!scroller || !header) return;
          scroller.scrollTop += header.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        };
        setCollapsed((current) => (current[status] === true ? { ...current, [status]: false } : current));
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(scroll);
        else scroll();
      };

      const accept = React.useCallback(
        async (slug) => {
          setActionError(null);
          setPending((current) => ({ ...current, [slug]: true }));
          try {
            const query = new URLSearchParams({ slug });
            if (sessionId) query.set('sessionId', sessionId);
            const response = await fetch(`${ROUTE.replace('projection', 'complete')}?${query.toString()}`, {
              headers: { accept: 'application/json' },
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok || body.ok !== true) throw new Error(body.message ?? `HTTP ${response.status}`);
            refresh();
          } catch (error) {
            setActionError(`${translate('acceptFailed')}: ${error?.message ?? error}`);
          } finally {
            setPending((current) => {
              const next = { ...current };
              delete next[slug];
              return next;
            });
          }
        },
        [sessionId, refresh],
      );

      const note = React.useMemo(() => {
        if (state.phase === 'loading') return translate('loading');
        if (state.phase === 'error') return `${translate('error')}: ${state.message}`;
        if (data === null) return translate('error');
        if (data.kind === 'absent') return translate('absent');
        if (data.kind === 'inconsistent') return translate('inconsistent');
        if (data.kind === 'no-session') return translate('noSession');
        if (data.kind === 'unbound') return translate('unbound');
        if (data.kind === 'error') return `${translate('error')}: ${data.message ?? ''}`;
        if (tasks.length === 0) return translate('empty');
        return null;
      }, [state, data, tasks.length]);

      return h(
        'div',
        { style: styles.shell, 'data-todo-ledger-panel': '' },
        h(
          'div',
          { style: styles.header },
          h(
            'div',
            { style: styles.counts },
            ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) =>
              h(
                'span',
                {
                  key: status,
                  style: {
                    ...styles.chip,
                    color: TONE[status] ?? TONE.todo,
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: '12px',
                  },
                  title: `${translate('jumpTo')} ${translate(status)}`,
                  'aria-label': `${translate('jumpTo')} ${translate(status)}`,
                  'data-todo-ledger-chip': status,
                  onClick: () => jumpToSection(status),
                },
                `${translate(status)} ${counts[status]}`,
              ),
            ),
          ),
        ),
        note === null
          ? h(
              'div',
              { ref: bodyRef, style: styles.body },
              ORDER.map((status) =>
                h(Section, {
                  key: status,
                  status,
                  tasks: tasks.filter((task) => task.status === status),
                  onAccept: accept,
                  pending,
                  collapsed: collapsed[status] === true,
                  onToggle: toggleSection,
                  headerRef: (node) => {
                    headerRefs.current[status] = node;
                  },
                }),
              ),
            )
          : h(
              'div',
              {
                style:
                  state.phase === 'error' || data?.kind === 'error' || data?.kind === 'inconsistent'
                    ? { ...styles.note, color: TONE.error }
                    : styles.note,
              },
              note,
            ),
        actionError === null ? null : h('div', { style: styles.note }, actionError),
        h(
          'div',
          { style: styles.footer },
          h('span', { style: styles.path, title: data?.root ?? '' }, data?.root ?? ''),
          h('button', { type: 'button', style: styles.action, onClick: refresh }, translate('refresh')),
        ),
      );
    }

    function ComposerLauncher({ sessionId }) {
      useLocaleRevision();
      const foreground = useForegroundSession();
      React.useEffect(() => {
        publishForegroundSession(sessionId);
      }, [sessionId]);
      const request = useFloatingRequest();
      const [highlighted, setHighlighted] = React.useState(false);
      const expanded = Boolean(request) && (foreground === null || foreground === sessionId);
      return h('button', {
        type: 'button',
        'data-todo-ledger-launcher': '',
        'aria-label': translate('launcherLabel'),
        'aria-expanded': expanded,
        onClick: () => updateFloatingRequest(expanded ? null : { sessionId, token: ++floatingRequestSequence }),
        onMouseEnter: () => setHighlighted(true),
        onMouseLeave: () => setHighlighted(false),
        onFocus: () => setHighlighted(true),
        onBlur: () => setHighlighted(false),
        style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', border: 0, borderRadius: 6, background: expanded || highlighted ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent', color: 'var(--dsw-alias-label-secondary)', opacity: expanded || highlighted ? 1 : 0.8, font: 'inherit', fontSize: '13px', fontWeight: 400, fontVariantNumeric: 'normal', letterSpacing: 'normal', lineHeight: 'inherit', cursor: 'pointer' },
      }, h(BookIcon), translate('launcher'));
    }

    function FloatingOverlay() {
      useLocaleRevision();
      const request = useFloatingRequest();
      const foreground = useForegroundSession();
      const [layout, setLayout] = React.useState(initialLayout);
      const layoutRef = React.useRef(layout);
      const dragRef = React.useRef(null);
      const resizeRef = React.useRef(null);
      layoutRef.current = layout;

      React.useEffect(() => {
        const onResize = () => setLayout((current) => clampLayout(current));
        const onMove = (event) => {
          const drag = dragRef.current;
          if (drag && drag.pointerId === event.pointerId) {
            const next = clampLayout({ ...layoutRef.current, x: drag.x + event.clientX - drag.clientX, y: drag.y + event.clientY - drag.clientY });
            layoutRef.current = next;
            setLayout(next);
            return;
          }
          const resize = resizeRef.current;
          if (resize && resize.pointerId === event.pointerId) {
            const next = clampLayout({ ...layoutRef.current, width: resize.width + event.clientX - resize.clientX, height: resize.height + event.clientY - resize.clientY });
            layoutRef.current = next;
            setLayout(next);
          }
        };
        const onEnd = (event) => {
          const active = dragRef.current?.pointerId === event.pointerId || resizeRef.current?.pointerId === event.pointerId;
          if (!active) return;
          dragRef.current = null;
          resizeRef.current = null;
          saveLayout(layoutRef.current);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
        return () => {
          window.removeEventListener('resize', onResize);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onEnd);
          window.removeEventListener('pointercancel', onEnd);
          dragRef.current = null;
          resizeRef.current = null;
        };
      }, []);

      if (!request) return null;
      const close = () => {
        if (floatingRequest?.token === request.token) updateFloatingRequest(null);
      };
      const moveByKeyboard = (event) => {
        const deltas = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] };
        const delta = deltas[event.key];
        if (!delta) return;
        event.preventDefault();
        const next = clampLayout({ ...layoutRef.current, x: layoutRef.current.x + delta[0], y: layoutRef.current.y + delta[1] });
        layoutRef.current = next;
        setLayout(next);
        saveLayout(next);
      };
      const startResize = (event) => {
        if (event.button !== 0) return;
        resizeRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, width: layoutRef.current.width, height: layoutRef.current.height };
        event.preventDefault();
      };
      return h('div', {
        'data-todo-ledger-overlay': '',
        style: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 80 },
      }, h('section', {
        role: 'region',
        'aria-label': translate('title'),
        style: { position: 'absolute', left: layout.x, top: layout.y, width: layout.width, height: layout.height, display: 'flex', flexDirection: 'column', overflow: 'hidden', pointerEvents: 'auto', borderRadius: 14, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', boxShadow: '0 12px 40px rgba(0, 0, 0, 0.28), 0 2px 8px rgba(0, 0, 0, 0.12)' },
      }, h('div', {
        style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--dsw-alias-border-l1)' },
      }, h('div', {
        role: 'button', tabIndex: 0, 'aria-label': translate('move'), title: translate('move'),
        onKeyDown: moveByKeyboard,
        onPointerDown: (event) => {
          if (event.button !== 0) return;
          dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: layoutRef.current.x, y: layoutRef.current.y };
          event.preventDefault();
        },
        style: { display: 'flex', flex: 1, alignItems: 'center', gap: 7, minWidth: 0, cursor: 'grab', touchAction: 'none', userSelect: 'none', fontWeight: 600 },
      }, h(BookIcon), translate('title')), h('button', {
        type: 'button', 'aria-label': translate('close'), title: translate('close'), onClick: close,
        style: { border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 18 },
      }, '×')), h('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' } }, h(Panel, { key: request.token, sessionId: foreground ?? request.sessionId })), h('div', {
        role: 'separator',
        'aria-label': translate('resize'),
        title: translate('resize'),
        'data-todo-ledger-resize': '',
        onPointerDown: startResize,
        style: { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 3, cursor: 'nwse-resize', touchAction: 'none', color: 'var(--dsw-alias-label-secondary)', opacity: 0.6 },
      }, h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true' },
        h('path', { d: 'M9 1 1 9M9 5 5 9', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', fill: 'none' })))));
    }

    return {
      name: 'todo-ledger-panel',
      inject: ['slots'],
      apply(ctx) {
        ctx.inject(['locale'], (owner) => {
          const service = owner.get('locale');
          if (service === undefined) return;
          owner.effect(
            () => {
              const disposers = [];
              localeService = service;
              try {
                const dispose = service.register(LOCALE_NAMESPACE, 'en', MESSAGES.en);
                if (typeof dispose === 'function') disposers.push(dispose);
              } catch {}
              try {
                const dispose = service.register(LOCALE_NAMESPACE, 'zh', MESSAGES.zh);
                if (typeof dispose === 'function') disposers.push(dispose);
              } catch {}
              try {
                localeTranslate = service.bind(LOCALE_NAMESPACE);
              } catch {
                localeTranslate = null;
              }
              return () => {
                for (const dispose of disposers.reverse()) {
                  try {
                    dispose();
                  } catch {}
                }
                if (localeService === service) {
                  localeService = null;
                  localeTranslate = null;
                }
              };
            },
            'todo-ledger.locale',
          );
        });

        ctx.inject(['sidebarRightTabs'], (owner) => {
          const tabs = owner.get('sidebarRightTabs');
          if (tabs === undefined) return;
          owner.effect(
            () =>
              tabs.register({
                id: TYPE_ID,
                kind: KIND,
                title: () => translate('title'),
                icon: () => h(BookIcon),
                guide: [{ order: 100, title: () => translate('title'), description: () => translate('description') }],
              }),
            'todo-ledger.tab-type',
          );
        });

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'dsh-todo-ledger:launcher',
              order: 2,
            },
            ComposerLauncher,
          ),
        );

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-todo-ledger:floating' },
            FloatingOverlay,
          ),
        );

        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: TYPE_ID,
            },
            Panel,
          ),
        );
      },
    };
  },
});
