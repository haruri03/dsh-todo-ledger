window.__ModuleLoader__.load({
  id: 'dsh-todo-ledger',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const TYPE_ID = 'dsh-todo-ledger:ledger';
    const KIND = 'todo-ledger';
    const ROUTE = '/todo-ledger/projection';
    const ORDER = ['doing', 'todo', 'review', 'blocked'];

    const MESSAGES = {
      zh: {
        title: '待办账本',
        loading: '正在读取账本…',
        absent: '当前目录没有 _todo/ 或 todo/ 账本',
        inconsistent: '账本不一致：队列、索引与任务详情对不上',
        error: '读取账本失败',
        unbound: '尚未绑定到会话目录',
        empty: '队列里没有任务',
        refresh: '刷新',
        expand: '展开',
        collapse: '折叠',
        doing: '进行中',
        todo: '待办',
        review: '待复核',
        blocked: '受阻',
      },
      en: {
        title: 'Todo ledger',
        loading: 'Reading the ledger…',
        absent: 'No _todo/ or todo/ ledger in this directory',
        inconsistent: 'Ledger is inconsistent: queue, index and task files disagree',
        error: 'Could not read the ledger',
        unbound: 'Not bound to a session directory yet',
        empty: 'The queue is empty',
        refresh: 'Refresh',
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

    function toolSignature(trajectory) {
      try {
        if (!Array.isArray(trajectory)) return '';
        const names = [];
        for (const entry of trajectory) {
          const name = entry?.toolName ?? entry?.tool?.name ?? entry?.name;
          if (typeof name === 'string' && name.startsWith('todo_')) names.push(name);
        }
        return `${names.length}:${names.slice(-1)[0] ?? ''}`;
      } catch {
        return '';
      }
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
      chevron: { width: '10px', display: 'inline-block', transition: 'transform 120ms ease-out' },
      counts: { display: 'flex', gap: '6px', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' },
      chip: { padding: '1px 6px', borderRadius: '999px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.14))' },
      body: { display: 'flex', flexDirection: 'column', gap: '10px' },
      sectionTitle: { display: 'flex', justifyContent: 'space-between', gap: '8px', opacity: 0.72, textTransform: 'uppercase', letterSpacing: '.04em', fontSize: '10px' },
      list: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
      item: { display: 'flex', flexDirection: 'column', gap: '1px', padding: '3px 6px', borderRadius: '6px', background: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.08))' },
      itemTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      slug: { opacity: 0.6, fontSize: '10px', fontFamily: 'var(--dsw-alias-font-mono, ui-monospace, monospace)' },
      note: { opacity: 0.72, padding: '6px 0' },
      footer: { display: 'flex', justifyContent: 'space-between', gap: '8px', opacity: 0.68, fontSize: '10px' },
      path: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' },
      action: { background: 'transparent', border: '0', padding: 0, color: 'inherit', font: 'inherit', textDecoration: 'underline', cursor: 'pointer' },
    };

    function useLedger(sessionId, visible) {
      const [state, setState] = React.useState({ phase: 'loading' });
      const [nonce, setNonce] = React.useState(0);
      const refresh = React.useCallback(() => setNonce((value) => value + 1), []);

      React.useEffect(() => {
        if (!visible) return undefined;
        const controller = new AbortController();
        let cancelled = false;
        load(sessionId, controller.signal)
          .then((data) => {
            if (!cancelled) setState({ phase: 'ready', data });
          })
          .catch((error) => {
            if (cancelled || error?.name === 'AbortError') return;
            setState({ phase: 'error', message: String(error?.message ?? error) });
          });
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [sessionId, visible, nonce]);

      return { state, refresh };
    }

    function Section({ status, tasks }) {
      if (tasks.length === 0) return null;
      return h(
        'div',
        null,
        h('div', { style: styles.sectionTitle }, h('span', null, translate(status)), h('span', null, String(tasks.length))),
        h(
          'ul',
          { style: styles.list },
          tasks.map((task) =>
            h(
              'li',
              { key: task.slug, style: styles.item, title: `${task.title} · ${task.slug}` },
              h('span', { style: styles.itemTitle }, task.title),
              h('span', { style: styles.slug }, task.slug),
            ),
          ),
        ),
      );
    }

    function Panel(props) {
      const [expanded, setExpanded] = React.useState(true);
      const sessionId = typeof props?.sessionId === 'string' ? props.sessionId : undefined;
      const visible = props?.tab?.visible !== false;
      const { state, refresh } = useLedger(sessionId, visible);
      const data = state.phase === 'ready' ? state.data : null;
      const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
      const counts = data?.counts ?? {};

      const useTrajectory = typeof props?.useTrajectory === 'function' ? props.useTrajectory : null;
      let trajectory = null;
      if (useTrajectory !== null) {
        try {
          trajectory = useTrajectory();
        } catch {
          trajectory = null;
        }
      }
      const signature = toolSignature(trajectory);
      const lastSignature = React.useRef(signature);
      React.useEffect(() => {
        if (lastSignature.current === signature) return;
        lastSignature.current = signature;
        refresh();
      }, [signature, refresh]);

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
            h('span', { style: { ...styles.chevron, transform: expanded ? 'rotate(90deg)' : 'none' } }, '›'),
            h('span', null, translate('title')),
          ),
          h(
            'div',
            { style: styles.counts },
            ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) =>
              h('span', { key: status, style: styles.chip, title: translate(status) }, `${translate(status)} ${counts[status]}`),
            ),
          ),
        ),
        note === null
          ? expanded
            ? h(
                'div',
                { style: styles.body },
                ORDER.map((status) =>
                  h(Section, { key: status, status, tasks: tasks.filter((task) => task.status === status) }),
                ),
              )
            : null
          : h('div', { style: styles.note }, note),
        h(
          'div',
          { style: styles.footer },
          h('span', { style: styles.path, title: data?.root ?? '' }, data?.root ?? ''),
          h('button', { type: 'button', style: styles.action, onClick: refresh }, translate('refresh')),
        ),
      );
    }

    function Title() {
      return h('span', null, translate('title'));
    }

    return {
      name: 'todo-ledger',
      inject: ['slots', 'sidebarRightTabs'],
      apply(ctx) {
        const definition = {
          id: TYPE_ID,
          kind: KIND,
          keepMounted: true,
          title: () => translate('title'),
        };
        ctx.sidebarRightTabs.register(definition);
        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TYPE_ID }, Panel),
        );
        ctx.slots.inject('sidebar.right.pane.tab.title', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TYPE_ID }, Title),
        );
      },
    };
  },
});
