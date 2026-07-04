import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import MarkdownIt from 'markdown-it';

export interface StaticSiteOptions {
  outputPath?: string;
  includeMedia?: boolean;
  includeGraph?: boolean;
  theme?: 'light' | 'dark' | 'both';
}

export interface StaticSiteResult {
  outputDir: string;
  pagesGenerated: number;
  mediaCopied: number;
  graphGenerated: boolean;
  totalFiles: number;
  durationMs: number;
}

interface PageRow {
  slug: string;
  title: string;
  type: string;
  content_md: string;
  raw_md: string;
  contexts: string[];
  updated_at: Date;
}

interface LinkRow {
  source_slug: string;
  target_slug: string;
  relation: string;
}

const md = new MarkdownIt({ html: false, linkify: true });

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extractTitle(rawMd: string, slug: string): string {
  const match = rawMd.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  const fmMatch = rawMd.match(/^---\s*\n[\s\S]*?\ntitle:\s*(.+)\n/);
  if (fmMatch) return fmMatch[1].trim();
  return slug;
}

function baseLayout(title: string, body: string, sidebar: string, activeSlug?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-header">
      <a href="../index.html" class="logo">Alethia KB</a>
    </div>
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="搜索实体..." oninput="filterPages(this.value)">
    </div>
    <nav class="nav-links">
      <a href="../index.html" class="nav-link ${activeSlug === '__index__' ? 'active' : ''}">首页</a>
      <a href="../search.html" class="nav-link ${activeSlug === '__search__' ? 'active' : ''}">搜索</a>
      <a href="../about.html" class="nav-link ${activeSlug === '__about__' ? 'active' : ''}">关于</a>
    </nav>
    <div class="sidebar-section">
      <h3 class="sidebar-title">实体列表</h3>
      <ul class="page-list" id="pageList">
        ${sidebar}
      </ul>
    </div>
  </aside>
  <main class="main-content">
    <article class="content">
      ${body}
    </article>
  </main>
</div>
<script>
function filterPages(query) {
  const q = query.toLowerCase().trim();
  const items = document.querySelectorAll('#pageList .page-item');
  items.forEach(item => {
    const title = item.textContent.toLowerCase();
    item.style.display = (!q || title.includes(q)) ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

function cssContent(): string {
  return `:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-sidebar: #f1f5f9;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border-color: #e2e8f0;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --code-bg: #f1f5f9;
  --link-color: #2563eb;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-sidebar: #1e293b;
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-muted: #64748b;
    --border-color: #334155;
    --accent: #60a5fa;
    --accent-hover: #3b82f6;
    --code-bg: #1e293b;
    --link-color: #60a5fa;
  }
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
}

.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 280px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  overflow-y: auto;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  text-decoration: none;
}

.search-box {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.search-box input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-box input:focus {
  border-color: var(--accent);
}

.nav-links {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-link {
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.nav-link:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.nav-link.active {
  background: var(--accent);
  color: white;
}

.sidebar-section {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.sidebar-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.page-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-item a {
  display: block;
  padding: 6px 10px;
  border-radius: 4px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  transition: all 0.2s;
}

.page-item a:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.page-item.active a {
  background: var(--accent);
  color: white;
}

.main-content {
  margin-left: 280px;
  flex: 1;
  padding: 40px 60px;
  max-width: 900px;
}

.content h1, .content h2, .content h3, .content h4 {
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  line-height: 1.3;
}

.content h1:first-child {
  margin-top: 0;
}

.content h1 { font-size: 2rem; }
.content h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
.content h3 { font-size: 1.25rem; }

.content p { margin-bottom: 1em; }

.content a {
  color: var(--link-color);
  text-decoration: none;
}

.content a:hover {
  text-decoration: underline;
}

.content ul, .content ol {
  margin: 1em 0;
  padding-left: 2em;
}

.content li { margin: 0.25em 0; }

.content code {
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

.content pre {
  background: var(--code-bg);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.content pre code {
  background: none;
  padding: 0;
}

.content blockquote {
  border-left: 4px solid var(--accent);
  padding-left: 16px;
  margin: 1em 0;
  color: var(--text-secondary);
  font-style: italic;
}

.content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.content th, .content td {
  border: 1px solid var(--border-color);
  padding: 8px 12px;
  text-align: left;
}

.content th {
  background: var(--bg-secondary);
}

.page-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 24px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-label {
  font-weight: 600;
  color: var(--text-muted);
}

.type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--accent);
  color: white;
  font-size: 0.75rem;
  font-weight: 500;
}

.context-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--border-color);
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-right: 4px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin: 32px 0;
}

.stat-card {
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 12px;
  text-align: center;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--accent);
}

.stat-label {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.recent-list {
  list-style: none;
  margin: 16px 0;
}

.recent-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.recent-item:last-child { border-bottom: none; }

.recent-title {
  color: var(--link-color);
  text-decoration: none;
  font-weight: 500;
}

.recent-date {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.section-title {
  font-size: 1.25rem;
  margin-top: 32px;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

@media (max-width: 768px) {
  .sidebar {
    position: static;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  .main-content {
    margin-left: 0;
    padding: 20px;
  }
  .layout { flex-direction: column; }
}
`;
}

function buildSidebarList(pages: PageRow[], activeSlug?: string): string {
  return pages
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    .map(p => {
      const isActive = activeSlug === p.slug;
      return `<li class="page-item ${isActive ? 'active' : ''}">
        <a href="../wiki/${escapeHtml(p.slug)}.html">${escapeHtml(p.title)}</a>
      </li>`;
    })
    .join('\n');
}

function renderWikiPage(page: PageRow, allPages: PageRow[]): string {
  const sidebarHtml = buildSidebarList(allPages, page.slug);
  const contentHtml = md.render(page.content_md || page.raw_md);
  const contextsHtml = (page.contexts && page.contexts.length > 0)
    ? page.contexts.map(c => `<span class="context-tag">${escapeHtml(c)}</span>`).join('')
    : '<span style="color: var(--text-muted);">无</span>';

  const metaHtml = `
    <div class="page-meta">
      <div class="meta-item">
        <span class="meta-label">类型:</span>
        <span class="type-tag">${escapeHtml(page.type)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">上下文:</span>
        <span>${contextsHtml}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">更新时间:</span>
        <span>${new Date(page.updated_at).toLocaleString('zh-CN')}</span>
      </div>
    </div>
  `;

  const body = `<h1>${escapeHtml(page.title)}</h1>${metaHtml}<div class="page-body">${contentHtml}</div>`;
  return baseLayout(page.title, body, sidebarHtml, page.slug);
}

function renderIndexPage(allPages: PageRow[], linkCount: number): string {
  const sidebarHtml = buildSidebarList(allPages, '__index__');
  const recentPages = [...allPages]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 10);

  const recentHtml = recentPages.map(p => `
    <li class="recent-item">
      <a class="recent-title" href="wiki/${escapeHtml(p.slug)}.html">${escapeHtml(p.title)}</a>
      <span class="recent-date">${new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
    </li>
  `).join('');

  const lastUpdated = recentPages.length > 0
    ? new Date(recentPages[0].updated_at).toLocaleString('zh-CN')
    : 'N/A';

  const body = `
    <h1>Alethia 知识库</h1>
    <p style="color: var(--text-secondary); margin-bottom: 24px;">静态导出的知识图谱与实体百科</p>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${allPages.length}</div>
        <div class="stat-label">实体数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${linkCount}</div>
        <div class="stat-label">关系数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${lastUpdated.split(' ')[0]}</div>
        <div class="stat-label">最后更新</div>
      </div>
    </div>

    <h2 class="section-title">最近更新</h2>
    <ul class="recent-list">
      ${recentHtml}
    </ul>
  `;

  return baseLayout('首页 - Alethia 知识库', body, sidebarHtml, '__index__');
}

function renderSearchPage(allPages: PageRow[]): string {
  const sidebarHtml = buildSidebarList(allPages, '__search__');

  const pageListJson = JSON.stringify(allPages.map(p => ({
    slug: p.slug,
    title: p.title,
    type: p.type,
    updated_at: p.updated_at
  })));

  const body = `
    <h1>搜索</h1>
    <p style="color: var(--text-secondary); margin-bottom: 24px;">在知识库中搜索实体</p>

    <div class="search-box" style="padding: 0; margin-bottom: 24px;">
      <input type="text" id="searchBox" placeholder="输入关键词搜索..." style="font-size: 1rem; padding: 12px 16px;" autofocus>
    </div>

    <div id="searchResults">
      <p style="color: var(--text-muted);">请输入关键词开始搜索</p>
    </div>
  `;

  const layout = baseLayout('搜索 - Alethia 知识库', body, sidebarHtml, '__search__');

  const searchScript = `
<script>
const allPages = ${pageListJson};

function doSearch() {
  const q = document.getElementById('searchBox').value.toLowerCase().trim();
  const container = document.getElementById('searchResults');

  if (!q) {
    container.innerHTML = '<p style="color: var(--text-muted);">请输入关键词开始搜索</p>';
    return;
  }

  const results = allPages.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.type.toLowerCase().includes(q) ||
    p.slug.toLowerCase().includes(q)
  );

  if (results.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted);">未找到匹配的实体</p>';
    return;
  }

  container.innerHTML = '<p style="color: var(--text-secondary); margin-bottom: 12px;">找到 ' + results.length + ' 个结果</p>' +
    '<ul class="recent-list">' +
    results.map(p =>
      '<li class="recent-item">' +
        '<a class="recent-title" href="wiki/' + encodeURIComponent(p.slug) + '.html">' + escapeHtml(p.title) + '</a>' +
        '<span class="recent-date">' + p.type + '</span>' +
      '</li>'
    ).join('') +
    '</ul>';
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('searchBox').addEventListener('input', doSearch);

const params = new URLSearchParams(window.location.search);
const qParam = params.get('q');
if (qParam) {
  document.getElementById('searchBox').value = qParam;
  doSearch();
}
</script>
`;

  return layout.replace('</body>', searchScript + '</body>');
}

function renderAboutPage(allPages: PageRow[], linkCount: number): string {
  const sidebarHtml = buildSidebarList(allPages, '__about__');
  const generatedAt = new Date().toLocaleString('zh-CN');

  const body = `
    <h1>关于</h1>
    <p style="color: var(--text-secondary); margin-bottom: 24px;">Alethia AI 知识库静态站点</p>

    <h2 class="section-title">知识库统计</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${allPages.length}</div>
        <div class="stat-label">实体总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${linkCount}</div>
        <div class="stat-label">关系总数</div>
      </div>
    </div>

    <h2 class="section-title">站点信息</h2>
    <ul>
      <li><strong>生成时间:</strong> ${generatedAt}</li>
      <li><strong>引擎:</strong> Alethia Brain v5.0</li>
      <li><strong>格式:</strong> 纯静态 HTML</li>
    </ul>

    <h2 class="section-title">使用说明</h2>
    <ul>
      <li>使用左侧边栏浏览实体列表</li>
      <li>使用顶部搜索框快速过滤实体</li>
      <li>点击页面链接跳转到相关实体</li>
      <li>支持深色模式（跟随系统设置）</li>
    </ul>
  `;

  return baseLayout('关于 - Alethia 知识库', body, sidebarHtml, '__about__');
}

async function copyDirRecursive(src: string, dest: string): Promise<number> {
  let count = 0;
  const srcDir = Bun.file(src);
  if (!(await srcDir.exists())) return 0;

  const entries = [];
  for await (const entry of (globalThis as any).Bun.glob(src + '/**/*')) {
    entries.push(entry);
  }

  for (const entry of entries) {
    const f = Bun.file(entry);
    const stat = await f.exists();
    if (!stat) continue;

    const relativePath = entry.slice(src.length + 1);
    const destPath = dest + '/' + relativePath;

    if ((f as any).type === 'application/x-directory' || (relativePath.includes('/') && !(await f.text().catch(() => null)))) {
      continue;
    }

    const destDir = destPath.substring(0, destPath.lastIndexOf('/'));
    await Bun.write(destDir + '/.keep', '');
    await Bun.write(destPath, f);
    count++;
  }

  return count;
}

async function generateGraphJson(pages: PageRow[], links: LinkRow[]): Promise<any> {
  const nodes = pages.map(p => ({
    id: p.slug,
    label: p.title,
    type: p.type
  }));

  const edges = links.map(l => ({
    source: l.source_slug,
    target: l.target_slug,
    relation: l.relation
  }));

  return { nodes, edges };
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  try {
    for await (const _ of (globalThis as any).Bun.glob(dir + '/**/*')) {
      count++;
    }
  } catch {
    // ignore
  }
  return count;
}

export async function generateStaticSite(options: StaticSiteOptions = {}): Promise<StaticSiteResult> {
  const startTime = Date.now();
  const {
    outputPath,
    includeMedia = false,
    includeGraph = false
  } = options;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseOutputDir = outputPath || (process.cwd() + '/exports');
  const outputDir = `${baseOutputDir}/${timestamp}`;

  logger.info({ outputDir, includeMedia, includeGraph }, '开始生成静态站点');

  let pagesGenerated = 0;
  let mediaCopied = 0;
  let graphGenerated = false;

  try {
    const pool = getPool();

    const [pagesResult, linksResult] = await Promise.all([
      pool.query('SELECT slug, type, content_md, raw_md, contexts, updated_at FROM pages ORDER BY slug'),
      pool.query('SELECT source_slug, target_slug, relation FROM links')
    ]);

    const pages: PageRow[] = pagesResult.rows.map((row: any) => ({
      ...row,
      title: extractTitle(row.raw_md, row.slug)
    }));

    const links: LinkRow[] = linksResult.rows;

    const wikiDir = `${outputDir}/wiki`;
    const assetsDir = `${outputDir}/assets`;

    await Bun.write(`${wikiDir}/.keep`, '');
    await Bun.write(`${assetsDir}/.keep`, '');

    await Bun.write(`${assetsDir}/style.css`, cssContent());

    for (const page of pages) {
      const html = renderWikiPage(page, pages);
      const filePath = `${wikiDir}/${page.slug}.html`;
      await Bun.write(filePath, html);
      pagesGenerated++;
    }

    const indexHtml = renderIndexPage(pages, links.length);
    await Bun.write(`${outputDir}/index.html`, indexHtml);

    const searchHtml = renderSearchPage(pages);
    await Bun.write(`${outputDir}/search.html`, searchHtml);

    const aboutHtml = renderAboutPage(pages, links.length);
    await Bun.write(`${outputDir}/about.html`, aboutHtml);

    pagesGenerated += 3;

    if (includeMedia) {
      const mediaSrc = process.cwd() + '/library/objects';
      const mediaDest = `${outputDir}/media/objects`;
      mediaCopied = await copyDirRecursive(mediaSrc, mediaDest);
      logger.info({ mediaCopied }, '媒体文件拷贝完成');
    }

    if (includeGraph) {
      const graphData = await generateGraphJson(pages, links);
      await Bun.write(`${outputDir}/graph.json`, JSON.stringify(graphData, null, 2));
      graphGenerated = true;
      logger.info('图谱 JSON 生成完成');
    }

    const totalFiles = await countFiles(outputDir);
    const durationMs = Date.now() - startTime;

    logger.info(
      { outputDir, pagesGenerated, mediaCopied, graphGenerated, totalFiles, durationMs },
      '静态站点生成完成'
    );

    return {
      outputDir,
      pagesGenerated,
      mediaCopied,
      graphGenerated,
      totalFiles,
      durationMs
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logger.error({ err, durationMs }, '静态站点生成失败');
    throw err;
  }
}
