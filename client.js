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
      accept: '#22c55e',
      error: '#ef4444',
    };

    function tint(hex, alpha) {
      const value = hex.replace('#', '');
      const r = parseInt(value.slice(0, 2), 16);
      const g = parseInt(value.slice(2, 4), 16);
      const b = parseInt(value.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    const MESSAGES = {
      zh: {
        title: '待办账本',
        description: '当前目录的账本：进行中、待办、待复核、受阻',
        loading: '正在读取账本…',
        absent: '当前目录没有 _todo/ 或 todo/ 账本',
        inconsistent: '账本不一致：队列、索引与任务详情对不上',
        error: '读取账本失败',
        unbound: '尚未绑定到会话目录',
        empty: '队列里没有任务',
        refresh: '刷新',
        accept: '通过',
        accepting: '处理中…',
        acceptFailed: '接受失败',
        expand: '展开',
        collapse: '折叠',
        doing: '进行中',
        todo: '待办',
        review: '待复核',
        blocked: '受阻',
      },
      en: {
        title: 'Todo ledger',
        description: "This directory's ledger: in progress, to do, awaiting review, blocked",
        loading: 'Reading the ledger…',
        absent: 'No _todo/ or todo/ ledger in this directory',
        inconsistent: 'Ledger is inconsistent: queue, index and task files disagree',
        error: 'Could not read the ledger',
        unbound: 'Not bound to a session directory yet',
        empty: 'The queue is empty',
        refresh: 'Refresh',
        accept: 'Accept',
        accepting: 'Accepting…',
        acceptFailed: 'Could not accept',
        expand: 'Expand',
        collapse: 'Collapse',
        doing: 'In progress',
        todo: 'To do',
        review: 'Awaiting review',
        blocked: 'Blocked',
      },
    };

    function language() {
      if (typeof document === 'undefined') return 'en';
      const tag = String(document.documentElement?.lang ?? '').toLowerCase();
      return tag.startsWith('zh') ? 'zh' : 'en';
    }

    function translate(key) {
      const table = MESSAGES[language()];
      return table[key] ?? MESSAGES.en[key] ?? key;
    }

    async function load(sessionId, signal) {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : '';
      const response = await fetch(`${ROUTE}${query}`, { signal, headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    const styles = {
      shell: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', fontSize: '12px', color: 'var(--dsw-alias-text-primary, inherit)' },
      header: { display: 'flex', alignItems: 'center', gap: '8px' },
      toggle: { flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: '0', padding: '2px 0', color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left' },
      chevron: { width: '10px', display: 'inline-block' },
      counts: { display: 'flex', gap: '6px', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' },
      chip: { padding: '1px 6px', borderRadius: '999px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14))' },
      body: { display: 'flex', flexDirection: 'column', gap: '10px' },
      sectionTitle: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '10px', fontWeight: 600 },
      sectionLabel: { display: 'flex', alignItems: 'center', gap: '5px' },
      dot: { width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block' },
      countPill: { padding: '0 6px', borderRadius: '999px', fontSize: '10px', fontWeight: 600 },
      list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
      item: { display: 'flex', flexDirection: 'column', gap: '1px', padding: '3px 6px', borderRadius: '6px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08))' },
      itemTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      itemMeta: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
      accept: { background: 'transparent', border: '1px solid currentColor', borderRadius: '999px', padding: '0 8px', color: 'inherit', font: 'inherit', fontSize: '10px', cursor: 'pointer', opacity: 0.85 },
      slug: { opacity: 0.6, fontSize: '10px', fontFamily: 'var(--dsw-alias-font-mono, ui-monospace, monospace)' },
      note: { opacity: 0.72, padding: '6px 0' },
      footer: { display: 'flex', justifyContent: 'space-between', gap: '8px', opacity: 0.68, fontSize: '10px' },
      path: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' },
      action: { background: 'transparent', border: '0', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' },
    };

    function useLedger(sessionId) {
      const [state, setState] = React.useState({ phase: 'loading' });
      const [nonce, setNonce] = React.useState(0);
      const refresh = React.useCallback(() => setNonce((value) => value + 1), []);

      React.useEffect(() => {
        const controller = new AbortController();
        let cancelled = false;
        const read = () => {
          load(sessionId, controller.signal)
            .then((data) => {
              if (!cancelled) setState({ phase: 'ready', data });
            })
            .catch((error) => {
              if (cancelled || error?.name === 'AbortError') return;
              setState({ phase: 'error', message: String(error?.message ?? error) });
            });
        };
        read();
        const timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          read();
        }, VISIBLE_REFRESH_MS);
        return () => {
          cancelled = true;
          clearInterval(timer);
          controller.abort();
        };
      }, [sessionId, nonce]);

      return { state, refresh };
    }

    function Section({ status, tasks, onAccept, pending }) {
      if (tasks.length === 0) return null;
      const tone = TONE[status] ?? TONE.todo;
      return h(
        'div',
        null,
        h(
          'div',
          { style: { ...styles.sectionTitle, color: tone } },
          h(
            'span',
            { style: styles.sectionLabel },
            h('span', { style: { ...styles.dot, background: tone } }),
            translate(status),
          ),
          h('span', { style: { ...styles.countPill, background: tint(tone, 0.16), color: tone } }, String(tasks.length)),
        ),
        h(
          'ul',
          { style: styles.list },
          tasks.map((task) =>
            h(
              'li',
              {
                key: task.slug,
                style: { ...styles.item, borderLeft: `3px solid ${tone}`, background: tint(tone, 0.08) },
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
                        style: {
                          ...styles.accept,
                          borderColor: tint(TONE.accept, 0.55),
                          background: tint(TONE.accept, pending === true ? 0.08 : 0.16),
                          color: TONE.accept,
                        },
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
      const [expanded, setExpanded] = React.useState(true);
      const [pending, setPending] = React.useState({});
      const [actionError, setActionError] = React.useState(null);
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : undefined;
      const { state, refresh } = useLedger(sessionId);
      const data = state.phase === 'ready' ? state.data : null;
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const counts = data?.counts ?? {};

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
            'button',
            {
              type: 'button',
              style: styles.toggle,
              'aria-expanded': expanded ? 'true' : 'false',
              onClick: () => setExpanded((value) => !value),
              title: expanded ? translate('collapse') : translate('expand'),
            },
            h('span', { style: styles.chevron }, expanded ? '▾' : '▸'),
            h('span', null, translate('title')),
          ),
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
                    background: tint(TONE[status] ?? TONE.todo, 0.16),
                    color: TONE[status] ?? TONE.todo,
                    border: `1px solid ${tint(TONE[status] ?? TONE.todo, 0.4)}`,
                  },
                  title: translate(status),
                },
                `${translate(status)} ${counts[status]}`,
              ),
            ),
          ),
        ),
        note === null
          ? expanded
            ? h(
                'div',
                { style: styles.body },
                ORDER.map((status) =>
                  h(Section, {
                    key: status,
                    status,
                    tasks: tasks.filter((task) => task.status === status),
                    onAccept: accept,
                    pending,
                  }),
                ),
              )
            : null
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

    return {
      name: 'todo-ledger-panel',
      inject: ['slots'],
      apply(ctx) {
        ctx.inject(['sidebarRightTabs'], (owner) => {
          const tabs = owner.get('sidebarRightTabs');
          if (tabs === undefined) return;
          owner.effect(
            () =>
              tabs.register({
                id: TYPE_ID,
                kind: KIND,
                title: () => translate('title'),
                guide: [{ order: 100, title: () => translate('title'), description: () => translate('description') }],
              }),
            'todo-ledger.tab-type',
          );
        });

        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: TYPE_ID,
              inject: (sessionId) => ({ sessionId }),
            },
            Panel,
          ),
        );
      },
    };
  },
});
