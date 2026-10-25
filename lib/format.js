export const LANGS = ['en', 'zh'];

export const DEFAULT_LANG = 'en';

export const TEMPLATE = {
  en: {
    section: {
      goal: 'Goal',
      subtasks: 'Subtasks',
      acceptance: 'Acceptance criteria',
      progress: 'Progress',
      blocker: 'Blocker',
      files: 'Related files',
      delivery: 'Delivery record',
    },
    field: {
      completedOn: 'Completed on',
      outcome: 'Outcome',
      deliverables: 'Deliverables',
      evidence: 'Evidence',
      signoff: 'Sign-off',
      leftover: 'Left over',
    },
    detail: 'Details',
    placeholder: {
      goal: '(one line: what done looks like)',
      progress: '(where it stands, with numbers)',
      blocker: '(none / what is stuck)',
      files: '- ',
    },
    queueTitle: 'Task queue',
    indexTitle: 'Task index',
    nothing: '(nothing written yet — call todo_checkpoint)',
    currentGoal: 'Current goal',
  },
  zh: {
    section: {
      goal: '目标',
      subtasks: '子项',
      acceptance: '验收标准',
      progress: '进度',
      blocker: '阻塞',
      files: '相关文件',
      delivery: '交付记录',
    },
    field: {
      completedOn: '完成日期',
      outcome: '结论',
      deliverables: '交付物',
      evidence: '验收证据',
      signoff: '签收',
      leftover: '遗留',
    },
    detail: '详情',
    placeholder: {
      goal: '（一句话：做到什么样算完成）',
      progress: '（当前到哪一步，带数字）',
      blocker: '（无 / 卡在哪里）',
      files: '- ',
    },
    queueTitle: '任务队列',
    indexTitle: '任务索引',
    nothing: '（尚未写入 — 调用 todo_checkpoint）',
    currentGoal: '当前目标',
  },
};

export const SECTION = TEMPLATE[DEFAULT_LANG].section;

export const FIELD = TEMPLATE[DEFAULT_LANG].field;

export const DETAIL_LABEL = TEMPLATE[DEFAULT_LANG].detail;

export function resolveLang(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text) return null;
  if (text === 'zh' || text === 'zh-cn' || text === 'zh-tw' || text === 'cn' || text === 'chinese' || text === '中文') return 'zh';
  if (text === 'en' || text === 'en-us' || text === 'en-gb' || text === 'english') return 'en';
  if (text.startsWith('zh')) return 'zh';
  if (text.startsWith('en')) return 'en';
  return 'en';
}

const aliasesFor = (kind) =>
  Object.fromEntries(
    Object.keys(TEMPLATE.en[kind]).map((key) => [key, [...new Set(LANGS.map((lang) => TEMPLATE[lang][kind][key]))]]),
  );

export const SECTION_ALIASES = aliasesFor('section');

export const FIELD_ALIASES = aliasesFor('field');

const DETAIL_ALIASES = [...new Set(LANGS.map((lang) => TEMPLATE[lang].detail))];

export const sectionName = (name, lang = DEFAULT_LANG) => TEMPLATE[lang].section[name];

export const fieldName = (name, lang = DEFAULT_LANG) => TEMPLATE[lang].field[name];

export const detailLabel = (lang = DEFAULT_LANG) => TEMPLATE[lang].detail;

export const placeholder = (name, lang = DEFAULT_LANG) => TEMPLATE[lang].placeholder[name];

export const heading = (name, lang = DEFAULT_LANG) => `## ${sectionName(name, lang)}`;

export const headingPattern = (name) => new RegExp(`^## (?:${SECTION_ALIASES[name].join('|')})\\s*$`, 'm');

export const sectionText = (body, name) => {
  const match = body.match(new RegExp(`## (?:${SECTION_ALIASES[name].join('|')})\\s*\\n+([\\s\\S]*?)(?=\\n## |$)`));
  return match ? match[1] : '';
};

export const detailPattern = () => `(?:${DETAIL_ALIASES.join('|')})`;

export const fieldPattern = (name) => new RegExp(`^-\\s*(?:${FIELD_ALIASES[name].join('|')})\\s*[：:]\\s*(.*)$`, 'm');

export function fieldValue(text, name) {
  const match = text.match(fieldPattern(name));
  return match ? match[1].trim() : null;
}

export const fieldLine = (name, value, lang = DEFAULT_LANG) => `- ${fieldName(name, lang)}: ${value}`;
