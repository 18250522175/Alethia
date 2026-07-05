import type { EvidenceSpan, ExtractReport, HealthDashboard, RebuildReport } from '@shared/index';
import { brainAPI } from '../brainapi';
import logger from '../i18n/logger';

// ANSI 颜色码
const ANSI = {
  green: '\x1B[32m',
  red: '\x1B[31m',
  yellow: '\x1B[33m',
  cyan: '\x1B[36m',
  dim: '\x1B[2m',
  reset: '\x1B[0m'
} as const;

function printSuccess(msg: string): void {
  console.log(`${ANSI.green}✓${ANSI.reset} ${msg}`);
}

function printError(msg: string): void {
  console.error(`${ANSI.red}✗ ${msg}${ANSI.reset}`);
}

function printInfo(msg: string): void {
  console.log(msg);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function printHelp(): void {
  const lines = [
    '',
    `${ANSI.cyan}Alethia Brain CLI${ANSI.reset} - 知识库命令行工具`,
    '',
    `${ANSI.yellow}用法:${ANSI.reset}`,
    '  brain <command> [options]',
    '',
    `${ANSI.yellow}命令:${ANSI.reset}`,
    `  ${ANSI.green}ask${ANSI.reset} <问题>                            提问并获取 Markdown 答案与来源`,
    `  ${ANSI.green}rebuild-struct${ANSI.reset}                       重建知识库结构（页面与链接）`,
    `  ${ANSI.green}extract-pending${ANSI.reset}                      扫描并提取待处理文件`,
    `  ${ANSI.green}archive-versions${ANSI.reset} [slug]              归档超过 50 条的活跃版本`,
    `  ${ANSI.green}clean-ghost-relations${ANSI.reset}                清理已解决/超期的幽灵关系`,
    `  ${ANSI.green}translate-evidence${ANSI.reset} <spanIds...> [--lang=xx]  翻译证据片段`,
    `  ${ANSI.green}generate-static-site${ANSI.reset} [outputPath]    生成静态站点`,
    `  ${ANSI.green}dashboard-snapshot${ANSI.reset}                   输出健康仪表盘快照`,
    `  ${ANSI.green}help${ANSI.reset}                                 显示此帮助信息`,
    '',
    `${ANSI.yellow}示例:${ANSI.reset}`,
    '  brain ask "熵是什么？"',
    '  brain archive-versions quantum-mechanics',
    '  brain translate-evidence span-1 span-2 --lang=en',
    '  brain generate-static-site ./site',
    ''
  ];
  console.log(lines.join('\n'));
}

function formatEvidenceList(sources: EvidenceSpan[]): string {
  if (sources.length === 0) return `${ANSI.dim}（无来源）${ANSI.reset}`;
  return sources
    .map((s, i) => {
      const loc = s.original_location ? ` @ ${s.original_location}` : '';
      const text = truncate(s.span_text.replace(/\s+/g, ' ').trim(), 120);
      return (
        `${ANSI.dim}${i + 1}.${ANSI.reset} ` +
        `[${ANSI.cyan}${s.span_id}${ANSI.reset}] ${s.slug}${loc}\n` +
        `   ${ANSI.dim}${text}${ANSI.reset}`
      );
    })
    .join('\n');
}

function formatDashboard(d: HealthDashboard): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const backlog = (label: string, color: string, n: number) =>
    `${color}${label}${ANSI.reset}: ${n}`;
  const dailyOver = d.budget.daily.exceeded ? ` ${ANSI.red}[超限]${ANSI.reset}` : '';
  const monthlyOver = d.budget.monthly.exceeded ? ` ${ANSI.red}[超限]${ANSI.reset}` : '';
  return [
    `${ANSI.cyan}═══ 知识库健康快照 ═══${ANSI.reset}`,
    `${ANSI.yellow}规模${ANSI.reset}`,
    `  节点(pages): ${d.scale.nodes}`,
    `  边(links):   ${d.scale.edges}`,
    `  观察文件:    ${d.observedFiles}`,
    `${ANSI.yellow}审核积压${ANSI.reset}`,
    `  ${backlog('绿', ANSI.green, d.reviewBacklog.green)}  ${backlog('黄', ANSI.yellow, d.reviewBacklog.yellow)}  ${backlog('红', ANSI.red, d.reviewBacklog.red)}`,
    `${ANSI.yellow}版本归档${ANSI.reset}`,
    `  活跃版本: ${d.archiveStatus.activeVersions}`,
    `  归档版本: ${d.archiveStatus.archivedVersions}`,
    `${ANSI.yellow}幽灵关系${ANSI.reset}`,
    `  待处理: ${d.ghostRelations}`,
    `${ANSI.yellow}预算${ANSI.reset}`,
    `  日预算: ${d.budget.daily.spent}/${d.budget.daily.limit}${dailyOver}`,
    `  月预算: ${d.budget.monthly.spent}/${d.budget.monthly.limit}${monthlyOver}`,
    `${ANSI.yellow}AI 质量${ANSI.reset}`,
    `  正确性: ${pct(d.aiQuality.correctness)}`,
    `${ANSI.yellow}其他${ANSI.reset}`,
    `  缓存命中率: ${pct(d.cacheHitRate)}`,
    `  断链证据: ${d.brokenEvidenceChains}`,
    `  孤儿文件: ${d.orphanedFiles}`,
    `${ANSI.dim}更新时间: ${d.lastUpdated}${ANSI.reset}`
  ].join('\n');
}

async function cmdAsk(args: string[]): Promise<void> {
  const question = args.join(' ').trim();
  if (!question) {
    printError('请提供问题，例如: brain ask "熵是什么？"');
    process.exit(1);
  }
  const result = await brainAPI.askQuestion({ question });

  printInfo('');
  printInfo(result.answer);
  printInfo('');
  printInfo(`${ANSI.cyan}── 来源 ──${ANSI.reset}`);
  printInfo(formatEvidenceList(result.sources));
  printInfo('');
  printInfo(
    `${ANSI.dim}会话ID: ${result.conversationId}  置信度: ${(result.confidence * 100).toFixed(1)}%  ` +
      `Tokens: ${result.tokensUsed}  估算成本: $${result.estimatedCost.toFixed(4)}${ANSI.reset}`
  );
  if (result.relatedEntities.length > 0) {
    printInfo(
      `${ANSI.dim}相关实体: ${result.relatedEntities.map((e) => e.title).join(', ')}${ANSI.reset}`
    );
  }
}

async function cmdRebuildStruct(): Promise<void> {
  const report: RebuildReport = await brainAPI.rebuildStruct();
  printSuccess(
    `重建完成: ${report.pages} 页面, ${report.links} 链接, ${report.ghostCount} 幽灵关系, 耗时 ${report.durationMs}ms`
  );
}

async function cmdExtractPending(): Promise<void> {
  const report: ExtractReport = await brainAPI.extractPending();
  printSuccess(
    `提取完成: 处理 ${report.processed} 个文件, 创建 ${report.pendingDiffsCreated} 个待审核变更`
  );
  if (report.errors.length > 0) {
    printError(`发生 ${report.errors.length} 个错误:`);
    for (const e of report.errors) {
      console.error(`  - ${e.filePath}: ${e.message}`);
    }
  }
}

async function cmdArchiveVersions(args: string[]): Promise<void> {
  const slug = args[0];
  const result = await brainAPI.archiveVersions(slug);
  printSuccess(`归档完成: ${result.archived} 个版本${slug ? ` (slug: ${slug})` : ''}`);
}

async function cmdCleanGhostRelations(): Promise<void> {
  const result = await brainAPI.cleanGhostRelations();
  printSuccess(`清理完成: ${result.cleaned} 条幽灵关系`);
}

async function cmdTranslateEvidence(args: string[]): Promise<void> {
  const spanIds = args.filter((a) => !a.startsWith('--'));
  const langArg = args.find((a) => a.startsWith('--lang='));
  const targetLang = langArg ? langArg.split('=')[1] : undefined;

  if (spanIds.length === 0) {
    printError('请提供至少一个 spanId, 例如: brain translate-evidence span-1 span-2');
    process.exit(1);
  }
  const result = await brainAPI.translateEvidence(spanIds, targetLang);
  printSuccess(`翻译完成: ${result.length} 个片段`);
  for (const t of result) {
    printInfo('');
    printInfo(`${ANSI.cyan}${t.spanId ?? t.span_id ?? ''}${ANSI.reset}`);
    if (t.original) printInfo(`${ANSI.dim}原文: ${truncate(t.original, 200)}${ANSI.reset}`);
    if (t.translated) printInfo(`译文: ${truncate(t.translated, 200)}`);
  }
}

async function cmdGenerateStaticSite(args: string[]): Promise<void> {
  const outputPath = args[0];
  const options: Record<string, unknown> = {};
  if (outputPath) options.outputPath = outputPath;
  const result = await brainAPI.generateStaticSite(options);
  printSuccess(`静态站点生成完成: ${JSON.stringify(result)}`);
}

async function cmdDashboardSnapshot(): Promise<void> {
  const dashboard = await brainAPI.getHealth();
  printInfo(formatDashboard(dashboard));
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case 'ask':
        await cmdAsk(rest);
        break;
      case 'rebuild-struct':
        await cmdRebuildStruct();
        break;
      case 'extract-pending':
        await cmdExtractPending();
        break;
      case 'archive-versions':
        await cmdArchiveVersions(rest);
        break;
      case 'clean-ghost-relations':
        await cmdCleanGhostRelations();
        break;
      case 'translate-evidence':
        await cmdTranslateEvidence(rest);
        break;
      case 'generate-static-site':
        await cmdGenerateStaticSite(rest);
        break;
      case 'dashboard-snapshot':
        await cmdDashboardSnapshot();
        break;
      default:
        printError(`未知命令: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printError(message);
    logger.error({ err }, 'CLI 命令执行失败');
    process.exit(1);
  }
}

export default runCli;
export { runCli };

if (import.meta.main) {
  runCli();
}
