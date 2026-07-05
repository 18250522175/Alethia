/**
 * QueryService · 检索、图谱、时间线、搜索服务
 *
 * 职责：执行查询、获取图谱数据、读取时间线、跨实体搜索。
 *
 * 对应原 BrainAPI.query / getGraphData / getTimeline / search。
 */

import type { QueryParams, QueryResult } from '@shared/index';
import { getPool } from '../../db/pool';
import logger from '../../i18n/logger';
import { executeQuery } from '../../retrieval/router';

export class QueryService {
  /** 执行一次检索查询。 */
  async query(params: QueryParams): Promise<QueryResult> {
    return executeQuery(params);
  }

  /** 获取知识图谱节点与边（默认 500 节点 / 1000 边）。 */
  async getGraphData(): Promise<{ nodes: any[]; edges: any[] }> {
    try {
      const { getGraphNodes, getGraphEdges } = await import('../../retrieval/graph');
      const [nodes, edges] = await Promise.all([getGraphNodes(500), getGraphEdges(1000)]);
      return { nodes, edges };
    } catch {
      return { nodes: [], edges: [] };
    }
  }

  /** 读取时间线条目，可按 slug 过滤、分页。 */
  async getTimeline(params?: {
    slug?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: any[]; total: number }> {
    try {
      const pool = getPool();
      const limit = params?.limit || 20;
      const offset = params?.offset || 0;

      let query = 'SELECT id, slug, type, payload, ts FROM timeline_entries';
      let countQuery = 'SELECT COUNT(*) as count FROM timeline_entries';
      const queryParams: any[] = [];

      if (params?.slug) {
        query += ' WHERE slug = $1';
        countQuery += ' WHERE slug = $1';
        queryParams.push(params.slug);
      }

      query += ` ORDER BY ts DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);

      const [result, countResult] = await Promise.all([
        pool.query(query, queryParams),
        pool.query(countQuery, params?.slug ? [params.slug] : [])
      ]);

      const items = result.rows.map((row: any) => ({
        id: row.id,
        slug: row.slug,
        type: row.type,
        payload: row.payload,
        ts: row.ts,
        title: row.payload?.title || '',
        description: row.payload?.description || ''
      }));

      return {
        items,
        total: Number.parseInt(countResult.rows[0]?.count || '0')
      };
    } catch (err) {
      logger.warn({ err }, '获取时间线失败');
      return { items: [], total: 0 };
    }
  }

  /** 全局搜索：跨页面、文件、对话三层匹配。 */
  async search(
    query: string
  ): Promise<{ pages: any[]; files: any[]; conversations: any[]; total: number }> {
    try {
      const pool = getPool();
      const queryString = `%${query}%`;

      const [pageResult, fileResult, convResult] = await Promise.all([
        pool.query(
          `SELECT slug, title, type,
                  LEFT(content_md, 200) as snippet
           FROM pages
           WHERE title ILIKE $1 OR content_md ILIKE $1 OR slug ILIKE $1
           LIMIT 10`,
          [queryString]
        ),
        pool.query(
          `SELECT hash, mime, original_name, size, status
           FROM library_files
           WHERE original_name ILIKE $1 OR hash ILIKE $1
           LIMIT 10`,
          [queryString]
        ),
        pool.query(
          `SELECT conversation_id, content, ts, role
           FROM conversation_logs
           WHERE content ILIKE $1
           ORDER BY ts DESC
           LIMIT 10`,
          [queryString]
        )
      ]);

      const pages = pageResult.rows.map((r: any) => ({
        slug: r.slug,
        title: r.title,
        snippet: r.snippet,
        type: r.type
      }));
      const files = fileResult.rows.map((r: any) => ({
        hash: r.hash,
        originalName: r.original_name,
        mime: r.mime,
        size: r.size,
        status: r.status
      }));
      const conversations = convResult.rows
        .filter((r: any) => r.role === 'user')
        .map((r: any) => ({
          id: r.conversation_id,
          question: r.content,
          answer: '',
          ts: r.ts
        }));

      return {
        pages,
        files,
        conversations,
        total: pages.length + files.length + conversations.length
      };
    } catch (err) {
      logger.warn({ err }, '搜索失败');
      return { pages: [], files: [], conversations: [], total: 0 };
    }
  }
}
