import { storage } from './markdown';
import { parser, type ParsedPage, type ParsedCausalEdge, type ParsedCausalCPT, type ParsedHyperEdge, type ParsedOntology } from './parser';
import { syncSummaries } from './summary';
import { getPool } from '../db/pool';
import logger from '../i18n/logger';
import { createHash, randomUUID } from 'crypto';
import { llmRouter } from '../llm/router';
import { validateHyperedge } from '../causal/ontologyValidator';

const EXTRACTABLE_MIME_PREFIXES = ['text/', 'application/json', 'application/xml'];
const LIBRARY_EXTRACTION_PROMPT = `请从以下文本中提取知识实体和关系，输出 JSON 格式：
{
  "entities": [{"slug": "实体名", "type": "概念/人物/事件", "summary": "简述"}],
  "relations": [{"source": "实体A", "target": "实体B", "relation": "关系类型"}]
}

要求：
1. 仅输出 JSON，不要附加任何解释性文本
2. 实体 slug 使用简洁的唯一标识
3. type 只能是 概念、人物、事件 之一
4. 没有明确实体或关系时返回空数组

文本内容：
`;

/**
 * 根据关系类型计算链接权重。
 * 语义紧密的关系（如 "is-a"、"定义"）权重较高，
 * 松散关联（如 "相关"、"参考"）权重较低。
 */
function calcLinkWeight(relation: string): number {
  const r = relation.toLowerCase();
  if (r.includes('is-a') || r.includes('定义') || r.includes('等价') || r.includes('实例')) return 0.9;
  if (r.includes('包含') || r.includes('依赖') || r.includes('继承') || r.includes('实现')) return 0.8;
  if (r.includes('关联') || r.includes('影响') || r.includes('导致') || r.includes('引用')) return 0.6;
  if (r.includes('相关') || r.includes('参考') || r.includes('参见')) return 0.4;
  return 0.5;
}

export class SyncEngine {
  async syncAll(): Promise<{ pages: number; links: number; timeline: number; versions: number; clusters: number; causalEdges: number; hyperEdgeCount: number }> {
    const wikiFiles = storage.listWikiFiles();
    let pageCount = 0;
    let linkCount = 0;
    let timelineCount = 0;
    let versionCount = 0;
    let causalEdgeCount = 0;
    let hyperEdgeCount = 0;

    const pool = getPool();
    const client = await pool.connect();

    try {
      // 清空旧的因果缓存
      await client.query('DELETE FROM causal_edges');
      await client.query('DELETE FROM causal_cpt');
      await client.query('DELETE FROM hyperedges');
      await client.query('DELETE FROM causal_hyperedges');

      // 清空本体论缓存表
      await client.query('TRUNCATE TABLE ontology_classes');
      await client.query('TRUNCATE TABLE ontology_properties');
      await client.query('TRUNCATE TABLE ontology_hyperedge_signatures');
      await client.query('TRUNCATE TABLE ontology_rules');

      // 全局本体论（core.md）优先处理
      let globalOntology: ParsedOntology | undefined;

      for (const filePath of wikiFiles) {
        try {
          const content = storage.readFile(filePath);
          const parsed = await parser.parse(filePath, content);
          await this.syncPage(client, parsed);
          pageCount++;

          const links = await this.syncLinks(client, parsed);
          linkCount += links;

          const timeline = await this.syncTimeline(client, parsed);
          timelineCount += timeline;

          const versions = await this.syncVersions(client, parsed);
          versionCount += versions;

          const cEdges = await this.syncCausalEdges(client, parsed);
          causalEdgeCount += cEdges;

          await this.syncCausalCPT(client, parsed);

          const hEdges = await this.syncHyperRelations(client, parsed);
          hyperEdgeCount += hEdges;

          const chEdges = await this.syncCausalHyperedges(client, parsed);
          hyperEdgeCount += chEdges;

          // 本体论同步：全局本体论（core.md）作为基础，本地本体论可覆盖
          if (parsed.ontology) {
            if (filePath.includes('core.md') || filePath.includes('ontology/core.md')) {
              globalOntology = parsed.ontology;
            } else {
              await this.syncOntology(client, parsed.ontology, parsed.slug);
            }
          }
        } catch (err) {
          logger.error({ err, filePath }, '同步文件失败');
        }
      }

      // 全局本体论最后同步（作为基础，本地本体论已覆盖）
      if (globalOntology) {
        await this.syncOntology(client, globalOntology, 'wiki/ontology/core');
      }

      logger.info(`同步完成: ${pageCount} 页, ${linkCount} 链接, ${timelineCount} 时间线, ${versionCount} 版本, ${causalEdgeCount} 因果边, ${hyperEdgeCount} 超边`);

      const summaryResult = await syncSummaries(client);
      return { pages: pageCount, links: linkCount, timeline: timelineCount, versions: versionCount, clusters: summaryResult.clusters, causalEdges: causalEdgeCount, hyperEdgeCount };
    } finally {
      client.release();
    }
  }

  private async syncPage(client: any, parsed: ParsedPage): Promise<void> {
    const hash = createHash('sha256').update(parsed.rawMd).digest('hex');

    await client.query(`
      INSERT INTO pages (slug, path, title, type, contexts, aliases, raw_md, parsed_json, content_md, hash, updated_at)
      VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8::jsonb, $9, $10, NOW())
      ON CONFLICT (slug) DO UPDATE SET
        path = EXCLUDED.path,
        title = EXCLUDED.title,
        type = EXCLUDED.type,
        contexts = EXCLUDED.contexts,
        aliases = EXCLUDED.aliases,
        raw_md = EXCLUDED.raw_md,
        parsed_json = EXCLUDED.parsed_json,
        content_md = EXCLUDED.content_md,
        hash = EXCLUDED.hash,
        updated_at = NOW()
    `, [
      parsed.slug,
      parsed.path,
      parsed.title || parsed.slug,
      parsed.type,
      parsed.contexts,
      parsed.aliases,
      parsed.rawMd,
      JSON.stringify(parsed.parsedJson),
      parsed.contentMd,
      hash
    ]);

    const pageResult = await client.query('SELECT id FROM pages WHERE slug = $1', [parsed.slug]);
    const pageId = pageResult.rows[0].id;

    const aliasText = (parsed.aliases && parsed.aliases.length > 0) ? parsed.aliases.join(' ') : '';
    const sourceText = `${parsed.title || ''}\n${parsed.state || ''}\n${parsed.assessment || ''}\n${parsed.contentMd || ''}\n${aliasText}`;
    await client.query(`
      INSERT INTO page_fts (page_id, tsv, source_text)
      VALUES ($1, to_tsvector('simple', $2), $2)
      ON CONFLICT (page_id) DO UPDATE SET
        tsv = to_tsvector('simple', EXCLUDED.source_text),
        source_text = EXCLUDED.source_text
    `, [pageId, sourceText]);

    logger.debug(`同步页面: ${parsed.slug}`);
  }

  private async syncLinks(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.relations.length === 0) return 0;

    await client.query('DELETE FROM links WHERE source_slug = $1', [parsed.slug]);

    for (const rel of parsed.relations) {
      const weight = calcLinkWeight(rel.relation);
      await client.query(`
        INSERT INTO links (source_slug, target_slug, relation, weight, orphaned, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        parsed.slug,
        rel.targetSlug,
        rel.relation,
        weight,
        false
      ]);
    }

    return parsed.relations.length;
  }

  private async syncTimeline(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.timeline.length === 0) return 0;

    await client.query('DELETE FROM timeline_entries WHERE slug = $1', [parsed.slug]);

    for (const entry of parsed.timeline) {
      await client.query(`
        INSERT INTO timeline_entries (slug, type, payload, ts)
        VALUES ($1, $2, $3::jsonb, $4::timestamptz)
      `, [
        parsed.slug,
        entry.type,
        JSON.stringify({ description: entry.description }),
        entry.date
      ]);
    }

    return parsed.timeline.length;
  }

  private async syncVersions(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.versionHistory.length === 0) return 0;

    for (let i = 0; i < parsed.versionHistory.length; i++) {
      const entry = parsed.versionHistory[i];
      const versionNum = parsed.versionHistory.length - i;

      await client.query(`
        INSERT INTO knowledge_versions (slug, version, created_at, change_summary, archived)
        VALUES ($1, $2, $3::timestamptz, $4, false)
        ON CONFLICT ON CONSTRAINT idx_knowledge_versions_unique DO NOTHING
      `, [
        parsed.slug,
        versionNum,
        entry.date,
        entry.summary
      ]);
    }

    return parsed.versionHistory.length;
  }

  private async syncCausalEdges(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.causalEdges.length === 0) return 0;

    for (const edge of parsed.causalEdges) {
      await client.query(`
        INSERT INTO causal_edges (source_slug, target_slug, relation, lag, weight, conf, evidence, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7::text[], NOW())
        ON CONFLICT ON CONSTRAINT causal_edges_pkey DO UPDATE SET
          relation = EXCLUDED.relation,
          lag = EXCLUDED.lag,
          weight = EXCLUDED.weight,
          conf = EXCLUDED.conf,
          evidence = EXCLUDED.evidence,
          updated_at = NOW()
      `, [
        edge.sourceSlug,
        edge.targetSlug,
        edge.relation,
        edge.lag,
        edge.weight,
        edge.conf,
        edge.evidence
      ]);
    }

    return parsed.causalEdges.length;
  }

  private async syncCausalCPT(client: any, parsed: ParsedPage): Promise<void> {
    if (!parsed.causalCpt) return;

    const cpt = parsed.causalCpt;
    const conditions: Record<string, string[]> = {};
    const probabilities: Record<string, Record<string, number>> = {};

    for (const row of cpt.table) {
      let stateKey = '';
      const conditionParts: string[] = [];

      for (const [col, val] of Object.entries(row)) {
        if (col.toLowerCase() === 'state' || col === '状态') {
          stateKey = val;
        } else if (col.toLowerCase() === 'probability' || col === '概率' || col === 'prob') {
          // probability column handled separately
        } else {
          conditionParts.push(`${col}=${val}`);
        }
      }

      const conditionKey = conditionParts.join('; ') || 'unconditional';
      const probVal = parseFloat(row['probability'] || row['Probability'] || row['prob'] || row['Prob'] || '0');

      if (stateKey) {
        if (!probabilities[conditionKey]) {
          probabilities[conditionKey] = {};
        }
        probabilities[conditionKey][stateKey] = probVal;
      }

      if (!conditions[conditionKey]) {
        conditions[conditionKey] = conditionParts;
      }
    }

    await client.query(`
      INSERT INTO causal_cpt (variable_slug, conditions, probabilities, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, NOW())
      ON CONFLICT (variable_slug) DO UPDATE SET
        conditions = EXCLUDED.conditions,
        probabilities = EXCLUDED.probabilities,
        updated_at = NOW()
    `, [
      cpt.variableSlug,
      JSON.stringify(conditions),
      JSON.stringify(probabilities)
    ]);
  }

  private async syncHyperRelations(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.hyperRelations.length === 0) return 0;

    // Note: Hyperedge and CPT changes are tracked via the Diff system (🟡 preview).
    // The auto_change_log table is used for file-level Markdown changes.

    for (const hyperEdge of parsed.hyperRelations) {
      // 本体论验证：检查超边是否符合类型签名约束
      const report = await validateHyperedge({
        type: hyperEdge.type,
        sourceSlugs: hyperEdge.sourceSlugs,
        targetSlugs: hyperEdge.targetSlugs
      });

      if (!report.valid) {
        logger.warn({ hyperEdge, violations: report.violations }, '超边本体论验证失败');

        // 检查是否已有已批准的例外覆盖
        const key = `hyperedge:${hyperEdge.type}:${hyperEdge.sourceSlugs.sort().join(',')}:${hyperEdge.targetSlugs.sort().join(',')}`;
        const existingException = await client.query(
          `SELECT id FROM pending_diffs WHERE slug = $1 AND type = 'ontology_violation'
           AND payload->>'action' = 'hyperedge_validation_failed'
           AND payload->>'exception' = 'true'
           AND resolved = true AND approved = true
           AND payload->>'key' = $2
           LIMIT 1`,
          [parsed.slug, key]
        );

        if (existingException.rows.length > 0) {
          logger.info({ hyperEdge, key }, '超边已有例外覆盖，跳过验证');
          // 仍然插入超边，但置信度降低
          await client.query(`
            INSERT INTO hyperedges (source_slugs, target_slugs, type, params)
            VALUES ($1::text[], $2::text[], $3, $4::jsonb)
          `, [
            hyperEdge.sourceSlugs,
            hyperEdge.targetSlugs,
            hyperEdge.type,
            JSON.stringify({ ...hyperEdge.params, conf: 0.5, ontologyViolations: report.violations, exceptionOverridden: true })
          ]);
          continue;
        }

        // 创建 pending_diff 标记为低置信度
        const diffId = randomUUID();
        await client.query(`
          INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)
          ON CONFLICT DO NOTHING
        `, [
          diffId,
          parsed.slug,
          'ontology_violation',
          JSON.stringify({
            action: 'hyperedge_validation_failed',
            key,
            hyperedge: {
              sourceSlugs: hyperEdge.sourceSlugs,
              targetSlugs: hyperEdge.targetSlugs,
              type: hyperEdge.type
            },
            violations: report.violations,
            exception: false,
            exception_reason: ''
          }),
          0.5,
          'high',
          'red'
        ]);
        // 仍然插入超边，但置信度降低
        await client.query(`
          INSERT INTO hyperedges (source_slugs, target_slugs, type, params)
          VALUES ($1::text[], $2::text[], $3, $4::jsonb)
        `, [
          hyperEdge.sourceSlugs,
          hyperEdge.targetSlugs,
          hyperEdge.type,
          JSON.stringify({ ...hyperEdge.params, conf: 0.5, ontologyViolations: report.violations })
        ]);
        continue;
      }

      await client.query(`
        INSERT INTO hyperedges (source_slugs, target_slugs, type, params)
        VALUES ($1::text[], $2::text[], $3, $4::jsonb)
      `, [
        hyperEdge.sourceSlugs,
        hyperEdge.targetSlugs,
        hyperEdge.type,
        JSON.stringify(hyperEdge.params)
      ]);
    }

    return parsed.hyperRelations.length;
  }

  private async syncCausalHyperedges(client: any, parsed: ParsedPage): Promise<number> {
    if (parsed.causalEdges.length === 0) return 0;

    let count = 0;

    for (const edge of parsed.causalEdges) {
      // 本体论验证
      const report = await validateHyperedge({
        type: edge.relation,
        sourceSlugs: [edge.sourceSlug],
        targetSlugs: [edge.targetSlug]
      });

      let conf = edge.conf;
      if (!report.valid) {
        logger.warn({ edge, violations: report.violations }, '因果超边本体论验证失败');

        // 检查是否已有已批准的例外覆盖
        const key = `causal:${edge.relation}:${edge.sourceSlug}:${edge.targetSlug}`;
        const existingException = await client.query(
          `SELECT id FROM pending_diffs WHERE slug = $1 AND type = 'ontology_violation'
           AND payload->>'action' = 'causal_edge_validation_failed'
           AND payload->>'exception' = 'true'
           AND resolved = true AND approved = true
           AND payload->>'key' = $2
           LIMIT 1`,
          [parsed.slug, key]
        );

        if (existingException.rows.length > 0) {
          logger.info({ edge, key }, '因果边已有例外覆盖，跳过验证');
          conf = 0.5;
        } else {
          conf = 0.5;
          const diffId = randomUUID();
          await client.query(`
          INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)
          ON CONFLICT DO NOTHING
        `, [
          diffId,
          parsed.slug,
          'ontology_violation',
          JSON.stringify({
            action: 'causal_edge_validation_failed',
            key,
            edge: {
              sourceSlug: edge.sourceSlug,
              targetSlug: edge.targetSlug,
              relation: edge.relation
            },
            violations: report.violations,
            exception: false,
            exception_reason: ''
          }),
          0.5,
          'high',
          'red'
        ]);
        }
      }

      // Create a hyperedge entry for each causal edge (single source/target)
      const { rows: existingHyper } = await client.query(
        'SELECT id FROM hyperedges WHERE source_slugs = $1::text[] AND target_slugs = $2::text[] AND type = $3 LIMIT 1',
        [[edge.sourceSlug], [edge.targetSlug], edge.relation]
      );

      let hyperedgeId: number;
      if (existingHyper.length > 0) {
        hyperedgeId = existingHyper[0].id;
      } else {
        const { rows: inserted } = await client.query(
          `INSERT INTO hyperedges (source_slugs, target_slugs, type, params)
           VALUES ($1::text[], $2::text[], $3, $4::jsonb)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [[edge.sourceSlug], [edge.targetSlug], edge.relation, JSON.stringify({ conf, evidence: edge.evidence })]
        );
        if (inserted.length > 0) {
          hyperedgeId = inserted[0].id;
        } else {
          // ON CONFLICT DO NOTHING returned no row, re-query
          const { rows: reQuery } = await client.query(
            'SELECT id FROM hyperedges WHERE source_slugs = $1::text[] AND target_slugs = $2::text[] AND type = $3 LIMIT 1',
            [[edge.sourceSlug], [edge.targetSlug], edge.relation]
          );
          if (reQuery.length === 0) continue;
          hyperedgeId = reQuery[0].id;
        }
      }

      // Insert into causal_hyperedges
      await client.query(`
        INSERT INTO causal_hyperedges (hyperedge_id, lag, weight, conf, evidence_spans)
        VALUES ($1, $2, $3, $4, $5::text[])
        ON CONFLICT DO NOTHING
      `, [
        hyperedgeId,
        edge.lag,
        edge.weight,
        conf,
        edge.evidence
      ]);

      count++;
    }

    return count;
  }

  private async syncOntology(client: any, ontology: ParsedOntology, sourceSlug: string): Promise<void> {
    // 同步本体论类
    for (const cls of ontology.classes) {
      await client.query(`
        INSERT INTO ontology_classes (name, parent, description, source_slug)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [cls.name, cls.parent || null, cls.description || null, sourceSlug]);
    }

    // 同步本体论属性
    for (const prop of ontology.properties) {
      await client.query(`
        INSERT INTO ontology_properties (name, domain_class, range_class, inverse_of, source_slug)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [prop.name, prop.domain, prop.range, prop.inverseOf || null, sourceSlug]);
    }

    // 同步超边类型签名
    for (const heType of ontology.hyperedgeTypes) {
      await client.query(`
        INSERT INTO ontology_hyperedge_signatures (type_name, signature, domain_classes, range_classes, source_slug)
        VALUES ($1, $2, $3::text[], $4::text[], $5)
        ON CONFLICT (type_name) DO UPDATE SET
          signature = EXCLUDED.signature,
          domain_classes = EXCLUDED.domain_classes,
          range_classes = EXCLUDED.range_classes,
          source_slug = EXCLUDED.source_slug
      `, [heType.name, heType.signature, heType.domainClasses, heType.rangeClasses, sourceSlug]);
    }

    // 同步推理规则
    for (const rule of ontology.inferenceRules) {
      await client.query(`
        INSERT INTO ontology_rules (rule_type, description, body, source_slug)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [rule.ruleType, rule.description, rule.body, sourceSlug]);
    }

    logger.debug({ sourceSlug, classes: ontology.classes.length, properties: ontology.properties.length, heTypes: ontology.hyperedgeTypes.length, rules: ontology.inferenceRules.length }, '本体论同步完成');
  }

  async rebuildGhostRelations(): Promise<number> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(`
        UPDATE links
        SET orphaned = true
        WHERE target_slug NOT IN (SELECT slug FROM pages)
      `);

      logger.info(`标记幽灵链接: ${result.rowCount || 0} 条`);
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  async extractNewLibraryFiles(): Promise<{
    scanned: number;
    extracted: number;
    diffsCreated: number;
    errors: string[];
  }> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const result = await client.query(
        `SELECT hash, mime, original_name FROM library_files WHERE status = 'new' LIMIT 50`
      );
      const rows = result.rows;
      const scanned = rows.length;
      let extracted = 0;
      let diffsCreated = 0;
      const errors: string[] = [];

      if (scanned === 0) {
        logger.info('无可提取的新文件');
        return { scanned, extracted, diffsCreated, errors };
      }

      logger.info({ scanned }, '开始扫描新文件提取知识');

      for (const row of rows) {
        const { hash, mime, original_name } = row;

        try {
          // 根据 MIME 类型判断是否可提取
          if (!EXTRACTABLE_MIME_PREFIXES.some(prefix => mime.startsWith(prefix))) {
            await client.query(
              `UPDATE library_files SET status = 'unsupported' WHERE hash = $1`,
              [hash]
            );
            logger.debug({ hash, mime }, '跳过不支持的 MIME 类型');
            continue;
          }

          // 读取文件内容
          const filePath = `${storage.getLibraryPath()}/${hash}`;
          const content = storage.readFile(filePath);

          if (!content || content.trim().length === 0) {
            await client.query(
              `UPDATE library_files SET status = 'error' WHERE hash = $1`,
              [hash]
            );
            errors.push(`${original_name}: 文件内容为空`);
            continue;
          }

          // 调用 LLM 提取知识
          if (!llmRouter.hasAnyConfigured()) {
            errors.push('无可用的 LLM 适配器');
            break;
          }

          const adapter = llmRouter.route('fact_extract');
          const response = await adapter.chat({
            messages: [{ role: 'user', content: LIBRARY_EXTRACTION_PROMPT + content }],
            jsonMode: true,
            temperature: 0.1,
            maxTokens: 2000
          });

          // 解析 LLM 返回的 JSON
          const parsed = this.parseExtractionResponse(response.content);

          // 为每个实体生成 PendingDiff
          for (const entity of parsed.entities) {
            try {
              const diffId = randomUUID();
              const slug = entity.slug || `lib:${hash.slice(0, 12)}`;
              const payload = {
                action: 'create',
                content: { type: entity.type, summary: entity.summary },
                source_file: hash,
                original_name
              };

              await client.query(
                `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
                 VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)`,
                [
                  diffId,
                  slug,
                  'library_extraction',
                  JSON.stringify(payload),
                  entity.confidence ?? 0.7,
                  'medium',
                  'yellow'
                ]
              );
              diffsCreated++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn({ err, slug: entity.slug }, '写入实体 PendingDiff 失败');
              errors.push(`${original_name}: 写入实体 ${entity.slug} 失败 - ${msg}`);
            }
          }

          // 为每个关系生成 PendingDiff
          for (const rel of parsed.relations) {
            try {
              const diffId = randomUUID();
              const slug = rel.source || `lib:${hash.slice(0, 12)}`;
              const payload = {
                action: 'link',
                content: { target: rel.target, relation: rel.relation },
                source_file: hash,
                original_name
              };

              await client.query(
                `INSERT INTO pending_diffs (id, slug, type, payload, confidence, impact, tier, created_at, resolved)
                 VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), false)`,
                [
                  diffId,
                  slug,
                  'library_extraction',
                  JSON.stringify(payload),
                  0.7,
                  'medium',
                  'yellow'
                ]
              );
              diffsCreated++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logger.warn({ err, source: rel.source }, '写入关系 PendingDiff 失败');
              errors.push(`${original_name}: 写入关系 ${rel.source}->${rel.target} 失败 - ${msg}`);
            }
          }

          // 标记文件为已提取
          await client.query(
            `UPDATE library_files SET status = 'extracted' WHERE hash = $1`,
            [hash]
          );
          extracted++;

          logger.debug({ hash, original_name, diffs: parsed.entities.length + parsed.relations.length }, '文件提取完成');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn({ err, hash, original_name }, '文件提取失败');

          try {
            await client.query(
              `UPDATE library_files SET status = 'error' WHERE hash = $1`,
              [hash]
            );
          } catch {
            // 状态更新失败不阻塞
          }

          errors.push(`${original_name}: ${msg}`);
        }
      }

      logger.info({ scanned, extracted, diffsCreated, errorCount: errors.length }, '新文件提取完成');
      return { scanned, extracted, diffsCreated, errors };
    } finally {
      client.release();
    }
  }

  private parseExtractionResponse(content: string): {
    entities: Array<{ slug: string; type: string; summary: string; confidence?: number }>;
    relations: Array<{ source: string; target: string; relation: string }>;
  } {
    try {
      const trimmed = content.trim();
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('LLM 返回内容无法匹配 JSON 对象');
        return { entities: [], relations: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const entities = Array.isArray(parsed.entities)
        ? parsed.entities.filter((e: any) => e.slug && e.type && e.summary)
        : [];
      const relations = Array.isArray(parsed.relations)
        ? parsed.relations.filter((r: any) => r.source && r.target && r.relation)
        : [];

      return { entities, relations };
    } catch (err) {
      logger.warn({ err }, '解析 LLM 提取响应失败');
      return { entities: [], relations: [] };
    }
  }

  async truncateCache(): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE TABLE page_embeddings CASCADE');
      await client.query('TRUNCATE TABLE page_fts CASCADE');
      await client.query('TRUNCATE TABLE links CASCADE');
      await client.query('TRUNCATE TABLE timeline_entries CASCADE');
      await client.query('TRUNCATE TABLE knowledge_versions CASCADE');
      await client.query('TRUNCATE TABLE semantic_rings CASCADE');
      await client.query('TRUNCATE TABLE evidence_spans CASCADE');
      await client.query('TRUNCATE TABLE clusters CASCADE');
      await client.query('TRUNCATE TABLE cluster_members CASCADE');
      await client.query('TRUNCATE TABLE causal_edges CASCADE');
      await client.query('TRUNCATE TABLE causal_cpt CASCADE');
      await client.query('TRUNCATE TABLE hyperedges CASCADE');
      await client.query('TRUNCATE TABLE causal_hyperedges CASCADE');
      await client.query('TRUNCATE TABLE ontology_classes CASCADE');
      await client.query('TRUNCATE TABLE ontology_properties CASCADE');
      await client.query('TRUNCATE TABLE ontology_hyperedge_signatures CASCADE');
      await client.query('TRUNCATE TABLE ontology_rules CASCADE');
      await client.query('TRUNCATE TABLE pages CASCADE');
      await client.query('COMMIT');
      logger.info('所有缓存表已清空');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      logger.error({ err }, '清空缓存表失败，已回滚');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const syncEngine = new SyncEngine();
